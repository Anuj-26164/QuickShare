const NAV_ITEMS = [
  { key: "send", label: "Send" },
  { key: "receive", label: "Receive" },
  { key: "history", label: "History" },
];

// Sticky top app bar with logo and desktop nav. `active` highlights the current
// section; `onNavigate(key)` is called when the logo or a nav link is clicked.
export default function Header({ active = "send", onNavigate }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-container-max items-center justify-between px-margin-mobile md:px-margin-desktop">
        <button
          type="button"
          onClick={() => onNavigate?.("send")}
          className="flex items-center gap-2"
        >
          <span
            className="material-symbols-outlined fill-icon text-primary"
            style={{ fontSize: "28px" }}
          >
            speed
          </span>
          <span
            className="font-display-lg font-bold text-primary"
            style={{ fontSize: "24px", lineHeight: "32px" }}
          >
            QuickShare
          </span>
        </button>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate?.(item.key)}
              className={`py-5 font-label-md text-label-md transition-colors duration-200 ${
                active === item.key
                  ? "border-b-2 border-primary font-semibold text-primary"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-muted">
            <span className="material-symbols-outlined text-[16px]">lock</span>
            End-to-end
          </span>
        </div>
      </div>
    </header>
  );
}
