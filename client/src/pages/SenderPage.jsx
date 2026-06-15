import { useEffect, useRef, useState } from "react";
import { getSocket, whenConnected } from "../socket.js";
import usePeer from "../hooks/usePeer.js";
import useFileTransfer from "../hooks/useFileTransfer.js";
import AppLayout from "../components/layout/AppLayout.jsx";
import Card from "../components/ui/Card.jsx";
import DropZone from "../components/ui/DropZone.jsx";
import PageHeading from "../components/ui/PageHeading.jsx";
import StatusChip, { chipStatus } from "../components/ui/StatusChip.jsx";
import FileRow from "../components/ui/FileRow.jsx";
import RoomCodeBox from "../components/ui/RoomCodeBox.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import Avatar from "../components/ui/Avatar.jsx";
import Button from "../components/ui/Button.jsx";
import { formatBytes, formatSpeed, formatEta } from "../utils/format.js";
import { fileIcon, fileTypeLabel } from "../utils/fileMeta.js";
import { initialsFor } from "../utils/browser.js";
import { recordTransfer } from "../utils/history.js";

// Thin wrapper: bumping `sessionKey` fully remounts <SenderSession/>, which is
// the most reliable way to start a brand-new transfer (fresh socket room,
// fresh peer, fresh transfer state) without reloading the page.
export default function SenderPage() {
  const [sessionKey, setSessionKey] = useState(0);
  return (
    <SenderSession
      key={sessionKey}
      onNewTransfer={() => setSessionKey((k) => k + 1)}
    />
  );
}

function EncryptedFooter() {
  return (
    <div className="flex items-center justify-center gap-2 font-label-sm text-label-sm text-muted">
      <span className="material-symbols-outlined text-[16px]">lock</span>
      Direct peer-to-peer · the server never sees your file
    </div>
  );
}

function SenderSession({ onNewTransfer }) {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [file, setFile] = useState(null);
  const [peerJoined, setPeerJoined] = useState(false);
  const [notice, setNotice] = useState(null); // graceful disconnect message
  const fileRef = useRef(null); // latest file for the transfer effect
  const createdRef = useRef(false); // guard so we only create one room
  const recordedRef = useRef(false); // guard so history is recorded once

  // Sender is the WebRTC initiator; only create the peer once a receiver joins.
  const { peer, connected, reconnecting, error: peerError } = usePeer({
    socket,
    roomId,
    initiator: true,
    ready: peerJoined,
    resumable: true,
    // The sender only rebuilds its peer when the receiver asks (resume-request),
    // and the receiver stops asking once its transfer is complete.
  });

  const { progress, speed, status, setStatus, startTransfer, peerName } =
    useFileTransfer({ peer, mode: "send" });

  const statusRef = useRef(status);
  statusRef.current = status;

  // Connect socket + create a room on mount.
  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const onRoomCreated = ({ roomId }) => setRoomId(roomId);
    const onPeerJoined = () => {
      setPeerJoined(true);
      setNotice(null);
    };
    const onPeerDisconnected = () => {
      setNotice("Receiver disconnected");
      if (statusRef.current !== "complete") setStatus("disconnected");
    };

    s.on("room-created", onRoomCreated);
    s.on("peer-joined", onPeerJoined);
    s.on("peer-disconnected", onPeerDisconnected);

    whenConnected(s, () => {
      if (!createdRef.current) {
        createdRef.current = true;
        s.emit("create-room");
      }
    });

    return () => {
      s.off("room-created", onRoomCreated);
      s.off("peer-joined", onPeerJoined);
      s.off("peer-disconnected", onPeerDisconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start (or resume) sending once the data channel is open. Re-runs on every
  // reconnect (startTransfer is a fresh fn per peer) and when a file is chosen
  // after the connection is already up.
  useEffect(() => {
    if (
      connected &&
      fileRef.current &&
      statusRef.current !== "complete" &&
      statusRef.current !== "error"
    ) {
      startTransfer(fileRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, startTransfer, file]);

  // Record a one-time history entry when the send completes.
  useEffect(() => {
    if (status === "complete" && file && !recordedRef.current) {
      recordedRef.current = true;
      recordTransfer({
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        direction: "sent",
        peer: peerName || "Receiver",
        status: "complete",
      });
    }
  }, [status, file, peerName]);

  const onFileSelected = (f) => {
    setFile(f);
    fileRef.current = f;
  };

  const shareLink = roomId ? `${window.location.origin}/room/${roomId}` : "";

  // High-level status for the chip.
  const displayStatus = peerError
    ? "error"
    : reconnecting
    ? "reconnecting"
    : status !== "idle"
    ? status
    : connected
    ? "connected"
    : peerJoined
    ? "connecting"
    : "waiting";

  const isTransferring = status === "transferring";
  const isComplete = status === "complete";
  const isDone = isComplete || status === "disconnected" || status === "error";
  const showShare =
    !!shareLink && !isTransferring && !isComplete && !connected;

  // Progress stats.
  const transferred = file ? Math.round((progress / 100) * file.size) : 0;
  const remaining = file ? file.size - transferred : 0;
  const eta = formatEta(remaining, speed);

  const heading = !file
    ? { title: "Send Files Securely", subtitle: "Drag & drop or select a file to generate a secure peer-to-peer link." }
    : isComplete
    ? { title: "Transfer Complete", subtitle: "Your file was delivered and verified end-to-end." }
    : isTransferring || reconnecting
    ? { title: "Sending File", subtitle: "Keep this tab open until the transfer finishes." }
    : { title: "Ready to Share", subtitle: "Keep this tab open — the transfer starts as soon as someone connects." };

  return (
    <AppLayout>
      <div className="flex w-full max-w-[600px] flex-col gap-stack-lg">
        <PageHeading title={heading.title} subtitle={heading.subtitle} />

        {!file ? (
          <Card>
            <DropZone onFileSelected={onFileSelected} />
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex flex-col gap-stack-lg">
                <div className="flex items-center justify-between gap-stack-sm">
                  <h2 className="font-headline-md text-headline-md text-on-surface">
                    {file.name.length > 22 ? "Your file" : file.name}
                  </h2>
                  <StatusChip status={chipStatus(displayStatus)} />
                </div>

                <FileRow
                  icon={fileIcon(file.name, file.type)}
                  name={file.name}
                  meta={`${fileTypeLabel(file.name, file.type)} · ${formatBytes(file.size)}`}
                  onRemove={isDone ? undefined : onNewTransfer}
                />

                {/* Peer identity once connected */}
                {connected && peerName && (
                  <div className="flex items-center gap-3 rounded border border-border bg-surface-container-low p-stack-md">
                    <Avatar initials={initialsFor(peerName)} />
                    <div>
                      <div className="font-label-sm text-label-sm text-muted">Connected to</div>
                      <div className="font-body-md text-body-md font-medium">{peerName}</div>
                    </div>
                  </div>
                )}

                {/* Waiting: share link */}
                {showShare && (
                  <RoomCodeBox
                    label="Secure share link"
                    value={shareLink}
                    helperText={
                      peerJoined
                        ? "Receiver found — connecting…"
                        : "Send this link to the receiver. It works until this tab closes."
                    }
                  />
                )}

                {/* Progress */}
                {(isTransferring || isComplete) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-end justify-between">
                      <div className="font-headline-lg-mobile text-headline-lg-mobile text-primary md:font-headline-lg md:text-headline-lg">
                        {progress}%
                      </div>
                      <div className="text-right">
                        <div className="font-label-md text-label-md text-on-surface">
                          {formatBytes(transferred)} / {formatBytes(file.size)}
                        </div>
                        <div className="mt-1 font-label-sm text-label-sm text-muted">
                          {isComplete
                            ? "Done"
                            : `${formatSpeed(speed)}${eta ? ` • ${eta}` : ""}`}
                        </div>
                      </div>
                    </div>
                    <ProgressBar percent={progress} variant={isComplete ? "success" : "default"} />
                  </div>
                )}

                {/* Reconnect / disconnect / error messaging */}
                {reconnecting && !isComplete && (
                  <p className="font-label-sm text-label-sm text-primary-container">
                    Connection dropped. Reconnecting and resuming…
                  </p>
                )}
                {peerError && (
                  <p className="font-label-sm text-label-sm text-error">{peerError}</p>
                )}
                {notice && !isComplete && (
                  <p className="font-label-sm text-label-sm text-error">{notice}</p>
                )}

                {/* Actions */}
                {isDone && (
                  <div className="flex justify-end border-t border-border pt-stack-md">
                    <Button variant="primary" icon="restart_alt" onClick={onNewTransfer}>
                      Start new transfer
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <EncryptedFooter />
          </>
        )}
      </div>
    </AppLayout>
  );
}
