// Local, device-only transfer history backed by localStorage. No history ever
// leaves the browser — it's purely a convenience record of what this device has
// sent or received. Capped to a sane number of entries.

const KEY = "quickshare:history";
const MAX_ITEMS = 50;

// Notify same-tab listeners (the storage event only fires in *other* tabs).
const EVENT = "quickshare:history-changed";

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Record a transfer. `entry` shape:
//   { name, size, mimeType, direction: "sent" | "received", peer, status }
// `id` and `date` are filled in automatically.
export function recordTransfer(entry) {
  try {
    const items = getHistory();
    const record = {
      id:
        (crypto.randomUUID && crypto.randomUUID()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: Date.now(),
      ...entry,
    };
    const next = [record, ...items].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
    return record;
  } catch {
    return null;
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

// Subscribe to changes (returns an unsubscribe fn). Fires for both same-tab
// writes (custom event) and other-tab writes (storage event).
export function onHistoryChange(fn) {
  const handler = () => fn();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// Friendly relative-ish date label for the history list.
export function formatHistoryDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;

  const withinWeek = now - d < 7 * 24 * 60 * 60 * 1000;
  if (withinWeek) {
    return `${d.toLocaleDateString([], { weekday: "short" })}, ${time}`;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
