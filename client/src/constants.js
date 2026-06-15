// Shared constants used across sender + receiver logic.

// 64KB chunk size for file transfer. Used by both peers so the receiver can
// compute totalChunks the same way the sender does.
export const CHUNK_SIZE = 64 * 1024; // 64KB

// Hard cap on file size. Transfers are now streamed on both ends (the sender
// reads the file slice-by-slice and the receiver writes chunks straight to
// OPFS), so this is a sanity ceiling rather than a memory limit.
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_FILE_SIZE_LABEL = "2GB";

// Backpressure threshold: pause sending while the data channel's buffered
// bytes exceed this, so we don't overflow the WebRTC send buffer.
export const BUFFER_THRESHOLD = 1024 * 1024; // 1MB

// Largest file we'll accept into the in-memory fallback sink (browsers without
// OPFS). Beyond this we refuse rather than risk an out-of-memory crash; OPFS
// browsers stream to disk and aren't bound by this.
export const MEMORY_SINK_LIMIT = 256 * 1024 * 1024; // 256MB

// Largest file we'll attempt to store in OPFS. OPFS is bound by the origin
// storage quota (and real free disk), and quota estimates are unreliable, so
// for anything larger we prefer the File System Access picker (writes straight
// to a user-chosen location on disk) when it's available.
export const OPFS_SAFE_LIMIT = 512 * 1024 * 1024; // 512MB

// Resume support: if the WebRTC data channel drops mid-transfer while the
// signaling socket is still alive, we re-establish the peer connection and
// continue from the last verified chunk instead of restarting from zero.
// Number of reconnection attempts before giving up.
export const MAX_RECONNECT_ATTEMPTS = 5;
// Delay between a detected drop and the reconnection attempt (ms). Gives ICE a
// moment to settle and avoids hammering the signaling server.
export const RECONNECT_DELAY_MS = 1500;

// WebRTC ICE configuration. STUN-only for the MVP (see README known limitations).
export const peerConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
