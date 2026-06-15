// Circular initials avatar (e.g. for the connected peer in the
// Receive / Connecting screens).
export default function Avatar({ initials, className = "" }) {
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container font-label-md text-label-md text-on-tertiary-container ${className}`}
    >
      {initials}
    </div>
  );
}
