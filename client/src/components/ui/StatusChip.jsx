const ACTIVE = "bg-primary-container/10 text-primary-container border border-primary-container/20";

const STATUS_CONFIG = {
  waiting: {
    label: "Waiting for receiver",
    dot: true,
    classes: "bg-surface-container-low text-muted border border-border",
  },
  connecting: { label: "Connecting…", dot: true, classes: ACTIVE },
  connected: { label: "Connected", dot: true, classes: ACTIVE },
  reconnecting: { label: "Reconnecting…", dot: true, classes: ACTIVE },
  transferring: { label: "Transferring", dot: true, classes: ACTIVE },
  "awaiting-save": { label: "Action needed", dot: true, classes: ACTIVE },
  complete: {
    label: "Complete",
    dot: false,
    icon: "check_circle",
    classes: "bg-success/10 text-success border border-success/20",
  },
  disconnected: {
    label: "Disconnected",
    dot: false,
    icon: "link_off",
    classes: "bg-error/10 text-error border border-error/20",
  },
  error: {
    label: "Error",
    dot: false,
    icon: "error",
    classes: "bg-error/10 text-error border border-error/20",
  },
};

// Maps an internal transfer status to a StatusChip preset. Anything unknown
// (e.g. "idle") falls back to the neutral "waiting" treatment.
export function chipStatus(appStatus) {
  switch (appStatus) {
    case "idle":
    case "awaiting-receiver":
    case "waiting":
      return "waiting";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "transferring":
      return "transferring";
    case "awaiting-save":
      return "awaiting-save";
    case "complete":
      return "complete";
    case "disconnected":
      return "disconnected";
    case "error":
      return "error";
    default:
      return "waiting";
  }
}

// Pill-shaped status indicator. `status` selects the preset color/icon
// treatment; `label` overrides the default text.
export default function StatusChip({ status = "waiting", label }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.waiting;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-label-sm text-label-sm uppercase tracking-wide ${config.classes}`}
    >
      {config.dot && <span className="pulse-dot" />}
      {config.icon && (
        <span className="material-symbols-outlined fill-icon text-[14px]">{config.icon}</span>
      )}
      <span>{label ?? config.label}</span>
    </div>
  );
}
