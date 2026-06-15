import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import {
  peerConfig,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY_MS,
} from "../constants.js";

// Manages the WebRTC peer lifecycle on top of simple-peer + Socket.io signaling.
//
// Params:
//   socket    - connected socket.io client (or null until ready)
//   roomId    - room to exchange signals in
//   initiator - true for sender, false for receiver
//   ready     - when true, the peer is created and signaling begins
//   resumable - enable automatic reconnection after a mid-transfer drop
//   isActive  - () => boolean, checked at drop time; while it returns true a
//               drop triggers a resume. Return false once the transfer is
//               finished (complete/error) so a normal close is left alone.
//
// Returns: { peer, connected, error, reconnecting }
//
// Resume model: a WebRTC data channel can fail (e.g. transient ICE problems)
// while the signaling socket stays connected and the room still exists. When
// that happens we tear down the dead peer and build a fresh one, re-running the
// offer/answer handshake. The receiver detects the drop and drives recovery:
// it recreates its (non-initiator) peer first, then asks the sender — via the
// `resume-request` relay — to recreate its (initiator) peer and emit a new
// offer. Doing it in that order guarantees the receiver is listening before the
// offer arrives, so no signal is lost. Higher layers (useFileTransfer) then
// continue the byte stream from the last verified chunk.
export default function usePeer({
  socket,
  roomId,
  initiator,
  ready,
  resumable = false,
  isActive,
}) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState(null);
  const peerRef = useRef(null);
  const [peer, setPeer] = useState(null);

  // Bumping `generation` rebuilds the peer — this is how we reconnect.
  const [generation, setGeneration] = useState(0);
  const attemptsRef = useRef(0); // reconnection attempts since last success
  const connectedOnceRef = useRef(false); // only resume after an initial connect
  // Latest "still transferring" check, evaluated lazily at drop time so it
  // always sees the current status without ordering constraints in the caller.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const checkActive = () =>
    typeof isActiveRef.current === "function" ? isActiveRef.current() : true;
  const resumableRef = useRef(resumable);
  resumableRef.current = resumable;

  useEffect(() => {
    if (!socket || !roomId || !ready) return;

    // Create the peer. trickle:false batches ICE candidates into a single
    // offer/answer, which keeps signaling simple (one signal each way).
    const p = new Peer({
      initiator,
      trickle: false,
      config: peerConfig,
    });
    peerRef.current = p;
    setPeer(p);

    let reconnectTimer = null;
    let torndown = false; // true once this effect's cleanup runs

    // Outgoing signal -> relay to the other peer via the server.
    p.on("signal", (signal) => {
      socket.emit("signal", { roomId, signal });
    });

    // Incoming signal from the server -> feed it into our peer.
    const onSignal = ({ roomId: incomingRoomId, signal }) => {
      // Reject signals tagged for a different room. The socket is shared and
      // survives "start new transfer", so a stale peer on the other side can
      // still relay signals from a previous room — feeding those into the new
      // peer corrupts the handshake.
      if (incomingRoomId && incomingRoomId !== roomId) return;
      // Guard against signaling a destroyed peer (e.g. after disconnect).
      if (!p.destroyed) {
        try {
          p.signal(signal);
        } catch (err) {
          console.error("signal error", err);
        }
      }
    };
    socket.on("signal", onSignal);

    p.on("connect", () => {
      setConnected(true);
      setReconnecting(false);
      setError(null);
      attemptsRef.current = 0; // fresh budget after every successful connect
      connectedOnceRef.current = true;
    });

    // Schedule a reconnect after a recoverable drop. Only the receiver
    // (non-initiator) drives this; the sender waits for a resume-request.
    const scheduleReconnect = () => {
      if (torndown) return; // effect already being replaced — let it
      if (!resumableRef.current || !checkActive()) return;
      if (!connectedOnceRef.current) return; // never connected -> not a "resume"
      if (initiator) return; // sender reconnects only when asked

      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setReconnecting(false);
        setError(
          "Connection lost and could not be re-established. Please retry."
        );
        return;
      }

      attemptsRef.current += 1;
      setReconnecting(true);
      reconnectTimer = setTimeout(() => {
        // Rebuilding the receiver's peer; the new effect run will emit the
        // resume-request once that peer is wired up and ready for the offer.
        setGeneration((g) => g + 1);
      }, RECONNECT_DELAY_MS);
    };

    p.on("close", () => {
      setConnected(false);
      scheduleReconnect();
    });

    // Convert raw WebRTC/ICE errors into a user-friendly message — unless a
    // resume is possible, in which case we quietly attempt recovery instead.
    p.on("error", (err) => {
      // simple-peer fires a benign error ("User-Initiated Abort, reason=Close
      // called") whenever the connection is torn down via destroy()/close() —
      // during our own cleanup, a reconnect rebuild, or "start new transfer".
      // That's not a real failure, so don't log it or surface an error; the
      // 'close' handler already drives any reconnect that's actually needed.
      const benign =
        torndown ||
        /close called|user-initiated abort/i.test((err && err.message) || "");
      if (benign) {
        setConnected(false);
        return;
      }

      console.error("peer error", err);
      setConnected(false);
      if (
        resumableRef.current &&
        checkActive() &&
        connectedOnceRef.current &&
        !initiator
      ) {
        scheduleReconnect();
      } else if (!resumableRef.current || !connectedOnceRef.current) {
        setError(
          "Unable to establish peer connection. Please check your network and try again."
        );
      }
    });

    // Sender side: when the receiver asks to resume, rebuild our initiator peer
    // so it emits a fresh offer to the (already waiting) receiver.
    const onResumeRequest = ({ roomId: incomingRoomId }) => {
      if (incomingRoomId && incomingRoomId !== roomId) return;
      if (!initiator || !resumableRef.current || !checkActive()) return;
      setReconnecting(true);
      setGeneration((g) => g + 1);
    };
    socket.on("resume-request", onResumeRequest);

    // On a reconnect run, the receiver announces it's ready for a new offer.
    // (generation > 0 means this is a rebuild, not the first connection.)
    if (!initiator && resumableRef.current && generation > 0) {
      socket.emit("resume-request", { roomId });
    }

    // Cleanup on unmount or dependency change (including a generation bump).
    return () => {
      torndown = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket.off("signal", onSignal);
      socket.off("resume-request", onResumeRequest);
      if (!p.destroyed) p.destroy();
      peerRef.current = null;
    };
  }, [socket, roomId, initiator, ready, generation]);

  return { peer, connected, error, reconnecting };
}
