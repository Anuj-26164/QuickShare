// 8px, fully-rounded progress track. `percent` (0–100) sets the fill width.
// `variant="success"` swaps the animated indigo gradient for a solid success
// color (completed transfer).
export default function ProgressBar({ percent = 0, variant = "default" }) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-surface-container-high">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${
          variant === "success" ? "bg-success" : "progress-gradient"
        }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
