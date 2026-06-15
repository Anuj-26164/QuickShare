// Human-readable byte size formatter shared across the UI. Scales from bytes
// up to GB so large transfers read naturally (e.g. "1.42 GB" not "1454.2 MB").
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Human-readable transfer speed (bytes/sec -> "12.4 MB/s" / "840 KB/s").
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 MB/s";
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps < 0.1) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${mbps.toFixed(1)} MB/s`;
}

// Rough "time remaining" from bytes left + current speed (e.g. "8s remaining",
// "2m 14s remaining"). Returns null when it can't be estimated yet.
export function formatEta(bytesRemaining, bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0 || bytesRemaining <= 0) return null;
  const secs = Math.round(bytesRemaining / bytesPerSec);
  if (secs < 60) return `${secs}s remaining`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s remaining`;
}

// Split a byte size into a number + unit for the design's "1.2 GB" treatment
// where the unit is rendered smaller. Returns { value, unit }.
export function splitBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return { value: "0", unit: "B" };
  if (bytes < 1024) return { value: `${bytes}`, unit: "B" };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(1), unit: "KB" };
  if (bytes < 1024 * 1024 * 1024)
    return { value: (bytes / (1024 * 1024)).toFixed(1), unit: "MB" };
  return { value: (bytes / (1024 * 1024 * 1024)).toFixed(2), unit: "GB" };
}
