// Receiver-side storage sinks for incoming file chunks.
//
// Three strategies, picked by the transfer hook based on file size + browser:
//   1. "picker" — File System Access API (showSaveFilePicker). Streams straight
//      to a user-chosen file on the real filesystem. Not bound by any sandbox
//      quota, so this is the path for large files. Requires a user gesture.
//   2. "opfs"   — Origin Private File System. Disk-backed, no prompt, but
//      limited by the origin storage quota (can be too small for GB files).
//   3. "memory" — in-memory array. Last resort; only safe for small files.
//
// Sink interface:
//   await sink.write(chunk)     -> append bytes (chunks must arrive in order)
//   await sink.finish(mimeType) -> resolve to a Blob to download, or null when
//                                  the file is already written to disk (picker)
//   await sink.cleanup()        -> discard/remove partial output
//   sink.kind                   -> "picker" | "opfs" | "memory"

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------
export function supportsOpfs() {
  return (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    typeof FileSystemFileHandle.prototype.createWritable === "function"
  );
}

export function supportsFilePicker() {
  return (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function"
  );
}

// Bytes still available in the origin's storage quota, or null if unknown.
export async function opfsAvailableBytes() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      return Math.max(0, quota - usage);
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Heuristic for Private/Incognito (or otherwise heavily restricted) storage,
// where large transfers will likely fail. Private windows deny persistent
// storage AND report a much smaller quota, so we flag the combination. This is
// advisory only — it never blocks a transfer.
export async function isStorageRestricted() {
  try {
    if (!navigator.storage) return false;

    let persisted = false;
    if (navigator.storage.persisted) {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted && navigator.storage.persist) {
      persisted = await navigator.storage.persist();
    }

    let quota = null;
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      quota = typeof est.quota === "number" ? est.quota : null;
    }

    // Denied persistence + a small quota strongly suggests a private window.
    if (!persisted && quota != null && quota < 1024 * 1024 * 1024) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sink factories
// ---------------------------------------------------------------------------

// Stream to a user-chosen file. MUST be called from a user gesture (click).
export async function createPickerSink(fileName, mimeType) {
  const opts = { suggestedName: fileName || "download" };
  if (mimeType) {
    opts.types = [{ description: "File", accept: { [mimeType]: [] } }];
  }
  const handle = await window.showSaveFilePicker(opts);
  const writable = await handle.createWritable();
  return new FilePickerSink(handle, writable);
}

// Stream to OPFS, falling back to memory if OPFS setup fails at runtime.
export async function createOpfsSink(fileName) {
  try {
    // Persistent storage gets a larger, non-evictable quota.
    if (navigator.storage.persist) {
      try {
        await navigator.storage.persist();
      } catch {
        /* ignore */
      }
    }
    const root = await navigator.storage.getDirectory();
    const tmpName = `quickshare-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${sanitize(fileName)}`;
    const handle = await root.getFileHandle(tmpName, { create: true });
    const writable = await handle.createWritable();
    return new OpfsSink(root, handle, writable, tmpName);
  } catch (err) {
    console.warn("OPFS sink unavailable, falling back to memory", err);
    return new MemorySink();
  }
}

export function createMemorySink() {
  return new MemorySink();
}

// Strip characters that aren't safe in an OPFS entry name.
function sanitize(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

// ---------------------------------------------------------------------------
// Sink implementations
// ---------------------------------------------------------------------------

// Writes directly to a user-selected file on disk (no quota ceiling).
class FilePickerSink {
  constructor(handle, writable) {
    this.handle = handle;
    this.writable = writable;
    this.kind = "picker";
    this.closed = false;
  }

  async write(chunk) {
    await this.writable.write(chunk);
  }

  async finish() {
    if (!this.closed) {
      await this.writable.close(); // commits the file to disk
      this.closed = true;
    }
    // Already saved to the chosen location — no Blob/download needed.
    return null;
  }

  async cleanup() {
    // Abort discards the uncommitted data so a failed/corrupt transfer doesn't
    // leave a bad file behind.
    try {
      if (!this.closed) {
        await this.writable.abort();
        this.closed = true;
      }
    } catch {
      /* ignore */
    }
  }
}

// Streams chunks to a disk-backed OPFS file (quota-limited).
class OpfsSink {
  constructor(root, handle, writable, name) {
    this.root = root;
    this.handle = handle;
    this.writable = writable;
    this.name = name;
    this.kind = "opfs";
    this.closed = false;
  }

  async write(chunk) {
    await this.writable.write(chunk);
  }

  async finish(mimeType) {
    if (!this.closed) {
      await this.writable.close();
      this.closed = true;
    }
    const file = await this.handle.getFile();
    return mimeType ? file.slice(0, file.size, mimeType) : file;
  }

  async cleanup() {
    try {
      if (!this.closed) {
        await this.writable.close();
        this.closed = true;
      }
    } catch {
      /* ignore */
    }
    try {
      await this.root.removeEntry(this.name);
    } catch {
      /* ignore */
    }
  }
}

// Buffers chunks in memory (fallback). Only safe for small files.
class MemorySink {
  constructor() {
    this.chunks = [];
    this.kind = "memory";
  }

  async write(chunk) {
    this.chunks.push(chunk);
  }

  async finish(mimeType) {
    return new Blob(this.chunks, {
      type: mimeType || "application/octet-stream",
    });
  }

  async cleanup() {
    this.chunks = [];
  }
}
