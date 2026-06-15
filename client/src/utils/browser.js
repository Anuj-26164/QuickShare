// Lightweight browser identification for capability-aware messaging.
// UA sniffing is imperfect (and Brave masquerades as Chrome), but it's only
// used to make error messages friendlier — never to gate behavior. Feature
// detection drives the actual storage decisions.
export function getBrowserInfo() {
  const ua =
    (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  let name = "your browser";
  if (/Edg\//.test(ua)) name = "Microsoft Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) name = "Opera";
  else if (/Firefox\//.test(ua)) name = "Firefox";
  else if (/Chrome\//.test(ua)) name = "Chrome";
  else if (/Safari\//.test(ua)) name = "Safari";

  return { name, isMobile, label: isMobile ? `${name} (mobile)` : name };
}

// Best-effort OS name from the UA string (presentational only).
function getOsName(ua) {
  if (/Windows/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  return "";
}

// A friendly device label exchanged with the peer so each side can show who
// it's transferring with, e.g. "Chrome on Windows". Purely cosmetic.
export function getDeviceLabel() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const { name } = getBrowserInfo();
  const os = getOsName(ua);
  if (name === "your browser") return os || "Unknown device";
  return os ? `${name} on ${os}` : name;
}

// Two-letter initials for an avatar, derived from a device/peer label.
export function initialsFor(label = "") {
  const parts = label.replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
