import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHUNK_SIZE,
  BUFFER_THRESHOLD,
  MEMORY_SINK_LIMIT,
  OPFS_SAFE_LIMIT,
} from "../constants.js";
import { createSha256 } from "../utils/crypto.js";
import { getDeviceLabel } from "../utils/browser.js";
import {
  supportsOpfs,
  supportsFilePicker,
  opfsAvailableBytes,
  createOpfsSink,
  createMemorySink,
  createPickerSink,
} from "../utils/fileSink.js";
import { getBrowserInfo } from "../utils/browser.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read a Blob/File slice as a Uint8Array. Prefers Blob.arrayBuffer() and falls
// back to FileReader for older browsers.
async function readSlice(blob) {
  if (blob.arrayBuffer) {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// ---------------------------------------------------------------------------
// Wire protocol — 1-byte tag framing
// ---------------------------------------------------------------------------
// simple-peer delivers data through a stream that normalizes everything to
// binary on the receiving end, so we CANNOT rely on `typeof data === "string"`
// to tell control messages from file chunks. Instead, every message is sent as
// a Uint8Array whose first byte is a tag:
//   TAG_CONTROL (1) -> rest is UTF-8 JSON (metadata / done)
//   TAG_CHUNK   (2) -> rest is raw file bytes
const TAG_CONTROL = 1;
const TAG_CHUNK = 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Frame a JSON control object: [TAG_CONTROL, ...json bytes].
function encodeControl(obj) {
  const json = encoder.encode(JSON.stringify(obj));
  const out = new Uint8Array(json.length + 1);
  out[0] = TAG_CONTROL;
  out.set(json, 1);
  return out;
}

// Frame a file chunk: [TAG_CHUNK, ...chunk bytes].
function encodeChunk(chunk) {
  const out = new Uint8Array(chunk.byteLength + 1);
  out[0] = TAG_CHUNK;
  out.set(chunk, 1);
  return out;
}

// Decode an incoming message into a control object, or null if it's a file
// chunk / unparseable. Handles every shape simple-peer might hand us.
function decodeControlFrame(data) {
  try {
    if (typeof data === "string") return JSON.parse(data);
    let bytes;
    if (data instanceof Uint8Array) bytes = data;
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else return null;
    if (bytes[0] !== TAG_CONTROL) return null;
    return JSON.parse(decoder.decode(bytes.subarray(1)));
  } catch {
    return null;
  }
}

// Drives the file transfer over an established peer connection.
//   peer - connected simple-peer instance (or null)
//   mode - "send" | "receive"
export default function useFileTransfer({ peer, mode }) {
  const [progress, setProgress] = useState(0); // 0-100
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [status, setStatus] = useState("idle");
  const [receivedFile, setReceivedFile] = useState(null); // { name, blob, url, savedToDisk }
  const [metadata, setMetadata] = useState(null); // receiver-visible file info
  const [error, setError] = useState(null);
  const [needsSaveLocation, setNeedsSaveLocation] = useState(false);
  const [peerName, setPeerName] = useState(null); // friendly label of the other device

  // Receiver-side accumulation state (refs so listeners always see latest).
  const metaRef = useRef(null);
  const pendingMetaRef = useRef(null); // metadata awaiting a save-location pick
  const sinkRef = useRef(null); // disk/memory sink for incoming chunks
  const hasherRef = useRef(null); // incremental SHA-256 over received bytes
  const receivedBytesRef = useRef(0);
  const receivedChunksRef = useRef(0);
  const procChainRef = useRef(Promise.resolve()); // serializes ALL incoming messages
  const lastPctRef = useRef(-1); // throttle progress re-renders
  const pickerCtlRef = useRef(null); // bridge to effect-local picker handler

  // Speed tracking.
  const speedStartRef = useRef(0);
  // Bytes already received when the current speed window opened. Speed is
  // measured over (received - base) / elapsed so a resume (which resets the
  // timer but not the cumulative byte count) doesn't report an inflated rate.
  const speedBaseBytesRef = useRef(0);

  // Sender-side resume state.
  const fileHashRef = useRef(null); // full-file SHA-256 digest, computed once
  const sendHasherRef = useRef(null); // incremental hasher (persists across resume)
  const sendHashedRef = useRef(0); // # of chunks folded into the hash so far
  const sendTokenRef = useRef(0); // cancels a stale send loop after a reconnect

  const reset = useCallback(() => {
    setProgress(0);
    setSpeed(0);
    setStatus("idle");
    setReceivedFile(null);
    setMetadata(null);
    setError(null);
    setNeedsSaveLocation(false);
    setPeerName(null);
    metaRef.current = null;
    pendingMetaRef.current = null;
    if (sinkRef.current) {
      sinkRef.current.cleanup();
      sinkRef.current = null;
    }
    hasherRef.current = null;
    receivedBytesRef.current = 0;
    receivedChunksRef.current = 0;
    procChainRef.current = Promise.resolve();
    lastPctRef.current = -1;
    speedBaseBytesRef.current = 0;
    fileHashRef.current = null;
    sendHasherRef.current = null;
    sendHashedRef.current = 0;
    sendTokenRef.current += 1;
  }, []);

  // ----------------------------------------------------------------------
  // SENDER: metadata -> chunks (with backpressure) -> done, all tag-framed
  // ----------------------------------------------------------------------
  // Resume-aware: this runs once on the initial connection and again after
  // every successful reconnect (the sender page re-invokes it whenever the
  // data channel comes back). The receiver replies to our metadata with a
  // `ready` message carrying `resumeFrom` — the next chunk index it still
  // needs — so we simply start the send loop there instead of at 0.
  const startTransfer = useCallback(
    async (file) => {
      if (!peer || peer.destroyed) return;

      // Each invocation gets a token. If a reconnect kicks off a newer run,
      // older loops see the token change and bail, so we never have two loops
      // pushing chunks into the same (or a dead) channel.
      const myToken = ++sendTokenRef.current;

      try {
        setStatus("transferring");
        setError(null);

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 0;

        // Send metadata first so the receiver can show the file info and start
        // preparing (or resuming) its sink right away — no need to wait for the
        // hash, which can take a while to compute on large files.
        peer.send(
          encodeControl({
            type: "metadata",
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            totalChunks,
            senderName: getDeviceLabel(),
          })
        );

        // Start listening for the receiver's "ready" reply IMMEDIATELY — it can
        // arrive while we're still hashing below, and we must not miss it.
        // `ready` carries `resumeFrom`: the next chunk index the receiver still
        // needs (0 for a fresh transfer, >0 when resuming after a reconnect).
        // The receiver may also need a user gesture first (choosing a save
        // location for large files), so we don't start sending until it replies.
        setStatus("awaiting-receiver");
        let readyResolve;
        let readyReject;
        const readyPromise = new Promise((resolve, reject) => {
          readyResolve = resolve;
          readyReject = reject;
        });
        // Mark the promise as handled so an early bail-out below (e.g. the peer
        // drops mid-hash) doesn't surface as an unhandled rejection; the real
        // `await` later still throws and is caught by the outer try/catch.
        readyPromise.catch(() => {});
        const onReadyData = (data) => {
          const msg = decodeControlFrame(data);
          if (msg && msg.type === "ready") {
            cleanupReady();
            if (msg.receiverName) setPeerName(msg.receiverName);
            const from = Number.isFinite(msg.resumeFrom)
              ? Math.min(Math.max(0, msg.resumeFrom | 0), totalChunks)
              : 0;
            readyResolve(from);
          }
        };
        const onReadyClose = () => {
          cleanupReady();
          readyReject(new Error("peer closed before ready"));
        };
        const cleanupReady = () => {
          peer.off("data", onReadyData);
          peer.off("close", onReadyClose);
        };
        peer.on("data", onReadyData);
        peer.on("close", onReadyClose);

        // The full-file SHA-256 is computed incrementally as we send (see the
        // loop below), so there's NO upfront full-file read — large transfers
        // start immediately instead of stalling while we hash gigabytes.
        if (!sendHasherRef.current) {
          sendHasherRef.current = createSha256();
          sendHashedRef.current = 0;
        }

        // Block until the receiver is ready (it may already be — the promise
        // resolves as soon as the "ready" reply arrives).
        const resumeFrom = await readyPromise;

        if (peer.destroyed || myToken !== sendTokenRef.current) {
          return;
        }

        setStatus("transferring");
        speedStartRef.current = performance.now();
        const resumeBytes = resumeFrom * CHUNK_SIZE; // bytes already delivered
        let lastPct = -1;

        for (let i = resumeFrom; i < totalChunks; i++) {
          // Backpressure: pause while the send buffer is too full to avoid
          // overflowing the WebRTC data channel on slower networks.
          // NOTE: `peer._channel` is a simple-peer PRIVATE API — fragile across
          // versions, acceptable for the MVP.
          while (
            peer._channel &&
            peer._channel.bufferedAmount > BUFFER_THRESHOLD
          ) {
            if (peer.destroyed || myToken !== sendTokenRef.current) return;
            await wait(50);
          }

          if (peer.destroyed || myToken !== sendTokenRef.current) {
            return;
          }

          // Read only this chunk's slice from disk — memory stays at ~one
          // chunk regardless of total file size.
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = await readSlice(file.slice(start, end));

          // Fold each chunk into the running hash EXACTLY ONCE, in order. On a
          // resume we re-send already-delivered chunks (i < sendHashedRef), and
          // those must NOT be hashed again — only newly-reached chunks advance
          // the digest, so it always covers bytes 0..end once and matches the
          // receiver's continuously-computed hash.
          if (i === sendHashedRef.current) {
            sendHasherRef.current.update(chunk);
            sendHashedRef.current += 1;
          }

          peer.send(encodeChunk(chunk));

          // Update progress + speed (only on whole-percent changes to avoid
          // thousands of redundant re-renders on large files).
          const pct = file.size ? Math.round((end / file.size) * 100) : 100;
          if (pct !== lastPct) {
            lastPct = pct;
            setProgress(pct);
            const elapsed =
              (performance.now() - speedStartRef.current) / 1000;
            // Speed reflects bytes moved since this (re)start, not the whole file.
            if (elapsed > 0) setSpeed((end - resumeBytes) / elapsed);
          }
        }

        if (peer.destroyed || myToken !== sendTokenRef.current) {
          return;
        }

        // All chunks have been hashed in order — finalize the digest once.
        if (!fileHashRef.current) {
          fileHashRef.current = sendHasherRef.current.hexDigest();
        }
        const hash = fileHashRef.current;

        // Final completion message with the hash for integrity verification.
        peer.send(
          encodeControl({
            type: "done",
            hash,
            totalChunks,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
          })
        );

        setProgress(100);
        setStatus("complete");
      } catch (err) {
        // A peer drop while sending isn't fatal — a resume may recover it.
        // Only surface a hard error if this is still the live transfer.
        if (peer.destroyed || myToken !== sendTokenRef.current) return;
        console.error("send error", err);
        setError("Transfer failed while sending the file.");
        setStatus("error");
      }
    },
    [peer]
  );

  // ----------------------------------------------------------------------
  // RECEIVER: decode tag -> stream chunks to sink -> verify -> download
  // ----------------------------------------------------------------------
  // Every incoming message is pushed onto a single promise chain so they are
  // processed strictly in arrival order. This is essential: setting up the sink
  // (metadata) is async, and without serialization the chunk events that fire
  // during that setup would race ahead of it and be lost.
  useEffect(() => {
    if (!peer || mode !== "receive") return;

    let fatal = false;

    // Map a low-level failure to a user-facing message.
    const describe = (err) => {
      const name = err && err.name;
      const msg = (err && err.message) || "";
      if (name === "QuotaExceededError" || /quota|storage/i.test(msg)) {
        return "Not enough storage space to save this file.";
      }
      if (name === "RangeError" || /allocation failed|out of memory/i.test(msg)) {
        return "File is too large for this browser's memory.";
      }
      return "Transfer failed while verifying the file.";
    };

    const fail = async (message) => {
      if (fatal) return;
      fatal = true;
      setError(message);
      setStatus("error");
      if (sinkRef.current) {
        try {
          await sinkRef.current.cleanup();
        } catch {
          /* ignore */
        }
        sinkRef.current = null;
      }
    };

    // Tell the sender we're ready to receive chunks, starting at `resumeFrom`
    // (the next chunk index we still need). 0 means a fresh transfer.
    const sendReady = (resumeFrom = 0) => {
      try {
        if (peer && !peer.destroyed) {
          peer.send(
            encodeControl({
              type: "ready",
              resumeFrom,
              receiverName: getDeviceLabel(),
            })
          );
        }
      } catch (err) {
        console.error("failed to send ready", err);
      }
    };

    // Activate a prepared sink and start receiving.
    const beginWithSink = (sink) => {
      sinkRef.current = sink;
      hasherRef.current = createSha256();
      receivedBytesRef.current = 0;
      receivedChunksRef.current = 0;
      lastPctRef.current = -1;
      speedStartRef.current = performance.now();
      speedBaseBytesRef.current = 0;
      pendingMetaRef.current = null;
      setNeedsSaveLocation(false);
      setMetadata(metaRef.current);
      setStatus("transferring");
      setProgress(0);
      sendReady();
    };

    // Called from the UI (user gesture) to pick a save location for large
    // files. Exposed to the component via pickerCtlRef.
    const chooseWithPicker = async () => {
      const msg = pendingMetaRef.current;
      if (!msg || fatal || sinkRef.current) return;
      try {
        const sink = await createPickerSink(msg.fileName, msg.mimeType);
        beginWithSink(sink);
      } catch (err) {
        // User dismissed the dialog — stay on the prompt so they can retry.
        if (err && err.name === "AbortError") return;
        console.error("save picker error", err);
        await fail(describe(err));
      }
    };
    pickerCtlRef.current = chooseWithPicker;

    const onMetadata = async (msg) => {
      if (msg.senderName) setPeerName(msg.senderName);
      // ---- Resume path -----------------------------------------------------
      // A reconnect rebuilds the peer, so this effect re-runs and the sender
      // re-sends metadata. If we already hold an open sink for this exact file,
      // keep the partial data + the running hasher and just tell the sender to
      // continue from the next chunk we still need. Crucially we do NOT touch
      // the sink here — closing/recreating it would discard the bytes already
      // written to disk and the in-progress SHA-256.
      const prev = metaRef.current;
      if (
        sinkRef.current &&
        prev &&
        prev.fileName === msg.fileName &&
        prev.fileSize === msg.fileSize &&
        prev.totalChunks === msg.totalChunks
      ) {
        speedStartRef.current = performance.now(); // reset the speed window
        speedBaseBytesRef.current = receivedBytesRef.current; // measure new bytes only
        lastPctRef.current = -1;
        setStatus("transferring");
        sendReady(receivedChunksRef.current);
        return;
      }

      metaRef.current = msg;

      // Fresh sink + hasher for this transfer.
      if (sinkRef.current) {
        try {
          await sinkRef.current.cleanup();
        } catch {
          /* ignore */
        }
        sinkRef.current = null;
      }

      const size = msg.fileSize;
      const canPicker = supportsFilePicker();
      const canOpfs = supportsOpfs();

      const promptSave = () => {
        pendingMetaRef.current = msg;
        setMetadata(msg);
        setNeedsSaveLocation(true);
        setStatus("awaiting-save");
      };

      // Choose a storage strategy based on size + browser capabilities.
      // 1) Large files prefer the picker when available (desktop Chrome/Edge):
      //    it writes to a real disk location, free of the OPFS quota.
      if (canPicker && size > OPFS_SAFE_LIMIT) {
        promptSave();
        return;
      }

      // 2) OPFS: the frictionless default for small files, and the only
      //    streaming sink on browsers without a picker (Firefox, mobile),
      //    so attempt it rather than refuse. Reroute to the picker only if the
      //    quota estimate clearly says it won't fit and a picker exists.
      if (canOpfs) {
        const avail = await opfsAvailableBytes();
        if (canPicker && avail != null && size > avail * 0.95) {
          promptSave();
          return;
        }
        beginWithSink(await createOpfsSink(msg.fileName));
        return;
      }

      // 3) No OPFS but a picker exists -> use it for any size.
      if (canPicker) {
        promptSave();
        return;
      }

      // 4) Last resort: in-memory, only if small enough to be safe.
      if (size <= MEMORY_SINK_LIMIT) {
        beginWithSink(createMemorySink());
        return;
      }

      // Nothing in this browser can store a file this large.
      const { label } = getBrowserInfo();
      await fail(
        "Large files aren't supported in this browser.\n\n" +
        "Direct-to-disk downloads work in desktop Chrome, Edge, or Brave. " +
        "Other modern browsers can receive files up to " +
        `${Math.round(MEMORY_SINK_LIMIT / (1024 * 1024))}MB.\n\n` +
        `Current browser: ${label}\n` +
        "Try desktop Chrome/Edge, or send a smaller file."
      );
    };

    const onChunk = async (chunk) => {
      if (fatal || !sinkRef.current) return;

      await sinkRef.current.write(chunk);
      hasherRef.current.update(chunk);
      receivedBytesRef.current += chunk.byteLength;
      receivedChunksRef.current += 1;

      // Throttle React updates: only re-render when the whole-number percent
      // changes (a 1GB file is ~16k chunks — updating every chunk is wasteful).
      const meta = metaRef.current;
      if (meta && meta.fileSize) {
        const pct = Math.round(
          (receivedBytesRef.current / meta.fileSize) * 100
        );
        if (pct !== lastPctRef.current) {
          lastPctRef.current = pct;
          setProgress(pct);
          const elapsed = (performance.now() - speedStartRef.current) / 1000;
          // Only count bytes received since this speed window opened, so a
          // resume (timer reset, byte count preserved) reports a real rate.
          const windowBytes =
            receivedBytesRef.current - speedBaseBytesRef.current;
          if (elapsed > 0) setSpeed(windowBytes / elapsed);
        }
      }
    };

    const onDone = async (doneMsg) => {
      if (fatal) return;

      // Step 1: verify chunk count.
      if (receivedChunksRef.current !== doneMsg.totalChunks) {
        await fail("Transfer incomplete");
        return;
      }

      // Step 2: compare the incremental SHA-256 computed as bytes streamed in.
      const receivedHash = hasherRef.current
        ? hasherRef.current.hexDigest()
        : null;
      if (receivedHash !== doneMsg.hash) {
        await fail("Transfer failed — file corrupted");
        return;
      }

      // Step 3: commit the file. OPFS/memory sinks return a Blob to download;
      // the picker sink writes straight to the user's disk and returns null.
      const blob = await sinkRef.current.finish(doneMsg.mimeType);
      setProgress(100);
      setStatus("complete");

      if (!blob) {
        // Already saved to the chosen location — nothing to download.
        setReceivedFile({ name: doneMsg.fileName, savedToDisk: true });
        return;
      }

      // Prepare + trigger an automatic download.
      const url = URL.createObjectURL(blob);
      setReceivedFile({ name: doneMsg.fileName, blob, url });

      const a = document.createElement("a");
      a.href = url;
      a.download = doneMsg.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    // Append a unit of work to the ordered processing chain, routing any
    // failure to the single `fail` handler so we never lose the real cause.
    const enqueue = (work) => {
      procChainRef.current = procChainRef.current.then(work).catch((err) => {
        console.error("receive error", err);
        return fail(describe(err));
      });
    };

    const handleControl = (msg) => {
      if (msg.type === "metadata") enqueue(() => onMetadata(msg));
      else if (msg.type === "done") enqueue(() => onDone(msg));
    };

    const handleData = (data) => {
      // Decode framing + copy bytes SYNCHRONOUSLY (the underlying receive
      // buffer may be reused before queued async work runs), then enqueue.
      let bytes;
      if (typeof data === "string") {
        // Defensive: if a raw string ever arrives, treat it as JSON control.
        try {
          handleControl(JSON.parse(data));
        } catch {
          /* ignore */
        }
        return;
      } else if (data instanceof Uint8Array) {
        bytes = data;
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else {
        return;
      }

      const tag = bytes[0];
      const payload = bytes.subarray(1);

      if (tag === TAG_CONTROL) {
        let msg;
        try {
          msg = JSON.parse(decoder.decode(payload));
        } catch {
          return;
        }
        handleControl(msg);
      } else if (tag === TAG_CHUNK) {
        const chunk = payload.slice(); // own a clean copy for the async write
        enqueue(() => onChunk(chunk));
      }
    };

    peer.on("data", handleData);
    return () => {
      peer.off("data", handleData);
    };
  }, [peer, mode]);

  // Invoked by the receiver UI (from a click) to pick a save location for a
  // large file. Delegates to the effect-local handler bound to the live peer.
  const chooseSaveLocation = useCallback(() => {
    return pickerCtlRef.current ? pickerCtlRef.current() : undefined;
  }, []);

  return {
    progress,
    speed,
    status,
    setStatus,
    startTransfer,
    receivedFile,
    metadata,
    error,
    reset,
    needsSaveLocation,
    chooseSaveLocation,
    peerName,
  };
}
