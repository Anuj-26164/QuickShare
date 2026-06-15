import { useState } from "react";

// Read-only "RoomLink" input group: monospaced value with an integrated copy
// action. Clipboard handling (with a graceful fallback) is built in, plus a
// transient "Copied!" confirmation state.
export default function RoomCodeBox({ label, value, helperText }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const tmp = document.createElement("textarea");
      tmp.value = value;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-stack-xs">
      {label && (
        <label className="ml-1 font-label-sm text-label-sm text-on-surface-variant">{label}</label>
      )}
      <div className="flex items-center overflow-hidden rounded border border-border bg-surface-container-lowest shadow-sm focus-within:border-primary-container focus-within:ring-1 focus-within:ring-primary-container">
        <input
          readOnly
          type="text"
          value={value}
          onFocus={(e) => e.target.select()}
          className="w-full border-none bg-transparent px-4 py-3 font-label-md text-label-md text-on-surface outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-2 border-l border-border bg-surface-container-low px-4 py-3 font-label-md text-label-md text-primary-container transition-colors hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[18px]">
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {helperText && (
        <p className="mt-1 text-center font-label-sm text-label-sm text-muted">{helperText}</p>
      )}
    </div>
  );
}
