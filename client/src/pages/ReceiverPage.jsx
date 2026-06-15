import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, whenConnected } from "../socket.js";
import usePeer from "../hooks/usePeer.js";
import useFileTransfer from "../hooks/useFileTransfer.js";
import AppLayout from "../components/layout/AppLayout.jsx";
import Card from "../components/ui/Card.jsx";
import StatusChip, { chipStatus } from "../components/ui/StatusChip.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import Avatar from "../components/ui/Avatar.jsx";
import Button from "../components/ui/Button.jsx";
import { formatBytes, formatSpeed, formatEta, splitBytes } from "../utils/format.js";
import { fileIcon, fileTypeLabel } from "../utils/fileMeta.js";
import { initialsFor } from "../utils/browser.js";
import { isStorageRestricted } from "../utils/fileSink.js";
import { OPFS_SAFE_LIMIT } from "../constants.js";
import { recordTransfer } from "../utils/history.js";

// Compact, copyable room-code pill (copies the full share link).
function RoomCodePill({ roomId }) {
  const [copied, setCopied] = useState(false);
  const code = roomId ? roomId.slice(0, 8).toUpperCase() : "—";

  const copy = async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-right">
      <div className="mb-1 font-label-sm text-label-sm text-muted">Room Code</div>
      <div className="flex items-center gap-2 rounded border border-border bg-surface-container-lowest px-2 py-1">
        <span className="font-label-md text-label-md tracking-widest">{code}</span>
        <button
          type="button"
          onClick={copy}
          title="Copy share link"
          className="text-muted transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[16px]">
            {copied ? "check" : "content_copy"}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function ReceiverPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const recordedRef = useRef(false);

  // Warn up front if storage looks restricted (Private/Incognito).
  useEffect(() => {
    let cancelled = false;
    isStorageRestricted().then((restricted) => {
      if (!cancelled) setStorageWarning(restricted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tracks the latest transfer status for the resume gate below. usePeer reads
  // it lazily (at drop time) so we don't attempt to resume after completion.
  const statusRef = useRef("idle");

  // Receiver is the non-initiator; create the peer once we've joined the room.
  const { peer, connected, reconnecting, error: peerError } = usePeer({
    socket,
    roomId,
    initiator: false,
    ready: joined,
    resumable: true,
    isActive: () =>
      statusRef.current !== "complete" && statusRef.current !== "error",
  });

  const {
    progress,
    speed,
    status,
    setStatus,
    receivedFile,
    metadata: meta,
    error,
    needsSaveLocation,
    chooseSaveLocation,
    peerName,
  } = useFileTransfer({ peer, mode: "receive" });

  statusRef.current = status;

  // Connect + attempt to join the room on mount.
  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const onRoomJoined = () => setJoined(true);
    const onRoomError = ({ message }) => setRoomError(message);
    const onPeerDisconnected = () => {
      // Read live status from the ref — this handler is registered once.
      setNotice("Sender disconnected");
      if (statusRef.current !== "complete") setStatus("disconnected");
    };

    s.on("room-joined", onRoomJoined);
    s.on("room-error", onRoomError);
    s.on("peer-disconnected", onPeerDisconnected);

    whenConnected(s, () => s.emit("join-room", roomId));

    return () => {
      s.off("room-joined", onRoomJoined);
      s.off("room-error", onRoomError);
      s.off("peer-disconnected", onPeerDisconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Record a one-time history entry on completion (or a fatal error mid-file).
  useEffect(() => {
    if (recordedRef.current || !meta) return;
    if (status === "complete" || status === "error") {
      recordedRef.current = true;
      recordTransfer({
        name: meta.fileName,
        size: meta.fileSize,
        mimeType: meta.mimeType,
        direction: "received",
        peer: peerName || "Sender",
        status: status === "complete" ? "complete" : "error",
      });
    }
  }, [status, meta, peerName]);

  const displayStatus = roomError
    ? "error"
    : peerError
    ? "error"
    : reconnecting
    ? "reconnecting"
    : status !== "idle"
    ? status
    : connected
    ? "connected"
    : joined
    ? "connecting"
    : "waiting";

  const isComplete = status === "complete";
  const isTransferring = status === "transferring";
  const senderLabel = peerName || "Sender";
  const total = meta ? splitBytes(meta.fileSize) : null;
  const transferred = meta ? Math.round((progress / 100) * meta.fileSize) : 0;
  const remaining = meta ? meta.fileSize - transferred : 0;
  const eta = formatEta(remaining, speed);

  // ---- Room not found / expired ----------------------------------------
  if (roomError) {
    return (
      <AppLayout>
        <div className="flex w-full max-w-[600px] flex-col gap-stack-lg">
          <Card className="text-center">
            <div className="flex flex-col items-center gap-stack-md p-stack-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
                <span className="material-symbols-outlined fill-icon text-error" style={{ fontSize: "32px" }}>
                  link_off
                </span>
              </div>
              <h1 className="font-headline-md text-headline-md text-on-surface">{roomError}</h1>
              <p className="font-body-md text-body-md text-muted">
                Ask the sender to generate a new link, or send a file yourself.
              </p>
              <Button variant="primary" icon="upload_file" onClick={() => navigate("/")}>
                Send a file instead
              </Button>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex w-full max-w-[600px] flex-col gap-stack-lg">
        <Card>
          <div className="flex flex-col gap-stack-lg">
            {/* Title + status */}
            <div className="flex items-center justify-between gap-stack-sm">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg">
                {isComplete ? "File Received" : "Receiving File"}
              </h1>
              <StatusChip status={chipStatus(displayStatus)} />
            </div>

            {storageWarning && !isComplete && (
              <div className="rounded border border-amber-200 bg-amber-50 p-stack-md font-label-sm text-label-sm text-amber-800">
                Large transfers may not work in Private/Incognito mode. For files
                larger than {Math.round(OPFS_SAFE_LIMIT / (1024 * 1024))} MB, use a
                normal Chrome, Edge, or Brave window.
              </div>
            )}

            {/* Sender info + room code */}
            <div className="flex flex-wrap items-center justify-between gap-stack-md rounded border border-border bg-surface-container-low p-stack-md">
              <div className="flex items-center gap-3">
                <Avatar initials={initialsFor(senderLabel)} />
                <div>
                  <div className="font-label-sm text-label-sm text-muted">Sender</div>
                  <div className="font-body-md text-body-md font-medium">{senderLabel}</div>
                </div>
              </div>
              <RoomCodePill roomId={roomId} />
            </div>

            {/* File metadata, or a connecting message */}
            {meta ? (
              <div className="grid grid-cols-1 gap-stack-sm md:grid-cols-3">
                <div className="col-span-1 flex items-start gap-3 rounded border border-border bg-surface-container-lowest p-stack-md md:col-span-2">
                  <span
                    className="material-symbols-outlined fill-icon mt-1 text-primary"
                    style={{ fontSize: "32px" }}
                  >
                    {fileIcon(meta.fileName, meta.mimeType)}
                  </span>
                  <div className="min-w-0 overflow-hidden">
                    <div className="truncate font-body-lg text-body-lg font-medium" title={meta.fileName}>
                      {meta.fileName}
                    </div>
                    <div className="mt-1 font-label-sm text-label-sm text-muted">
                      {fileTypeLabel(meta.fileName, meta.mimeType)}
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex flex-col justify-center rounded border border-border bg-surface-container-lowest p-stack-md">
                  <div className="mb-1 font-label-sm text-label-sm text-muted">Total Size</div>
                  <div className="font-headline-md text-headline-md">
                    {total.value}{" "}
                    <span className="font-body-md text-body-md text-muted">{total.unit}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-body-md text-body-md text-muted">
                {connected
                  ? "Connected. Waiting for the file…"
                  : joined
                  ? "Connecting to sender…"
                  : "Joining room…"}
              </p>
            )}

            {/* Save-location prompt (large files) */}
            {needsSaveLocation && (
              <div className="flex flex-col gap-stack-sm rounded border border-primary-container/20 bg-primary-container/5 p-stack-md">
                <p className="font-body-md text-body-md text-on-surface">
                  This file is large. Choose where to save it — it'll be written
                  straight to disk as it transfers.
                </p>
                <div>
                  <Button variant="primary" icon="save" onClick={chooseSaveLocation}>
                    Choose where to save
                  </Button>
                </div>
              </div>
            )}

            {/* Progress */}
            {(isTransferring || isComplete) && meta && (
              <div className="flex flex-col gap-2">
                <div className="flex items-end justify-between">
                  <div className="font-headline-lg-mobile text-headline-lg-mobile text-primary md:font-headline-lg md:text-headline-lg">
                    {progress}%
                  </div>
                  <div className="text-right">
                    <div className="font-label-md text-label-md text-on-surface">
                      {formatBytes(transferred)} / {formatBytes(meta.fileSize)}
                    </div>
                    <div className="mt-1 font-label-sm text-label-sm text-muted">
                      {isComplete
                        ? "Verified"
                        : `${formatSpeed(speed)}${eta ? ` • ${eta}` : ""}`}
                    </div>
                  </div>
                </div>
                <ProgressBar percent={progress} variant={isComplete ? "success" : "default"} />
              </div>
            )}

            {/* Reconnect / disconnect messaging */}
            {reconnecting && !isComplete && (
              <p className="font-label-sm text-label-sm text-primary-container">
                Connection dropped. Reconnecting and resuming from where it left off…
              </p>
            )}

            {/* Completion notes */}
            {isComplete && receivedFile?.savedToDisk && (
              <p className="font-label-sm text-label-sm text-success">
                Received, verified, and saved to your chosen location.
              </p>
            )}
            {isComplete && receivedFile && !receivedFile.savedToDisk && (
              <p className="font-label-sm text-label-sm text-success">
                Received and verified. Your download started automatically.
              </p>
            )}

            {/* Error + retry */}
            {error && (
              <div className="flex flex-col gap-stack-sm">
                <p className="whitespace-pre-line font-label-sm text-label-sm text-error">
                  {error}
                </p>
              </div>
            )}

            {peerError && (
              <p className="font-label-sm text-label-sm text-error">{peerError}</p>
            )}
            {notice && !isComplete && (
              <p className="font-label-sm text-label-sm text-error">{notice}</p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-stack-sm border-t border-border pt-stack-md">
              {error && (
                <Button variant="secondary" icon="refresh" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              )}
              {isComplete ? (
                <>
                  {receivedFile && !receivedFile.savedToDisk && (
                    <a
                      href={receivedFile.url}
                      download={receivedFile.name}
                      className="inline-flex items-center justify-center gap-2 rounded border border-primary-container/20 bg-primary-container px-6 py-2 font-label-md text-label-md text-on-primary shadow-sm transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      Download again
                    </a>
                  )}
                  <Button variant="secondary" icon="download_for_offline" onClick={() => navigate("/receive")}>
                    Receive another
                  </Button>
                </>
              ) : (
                !error && (
                  <Button variant="secondary" icon="close" onClick={() => navigate("/")}>
                    Cancel
                  </Button>
                )
              )}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-center gap-2 font-label-sm text-label-sm text-muted">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          Direct peer-to-peer · the server never sees your file
        </div>
      </div>
    </AppLayout>
  );
}
