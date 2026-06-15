const NAV_ITEMS = [
  { key: "send", label: "Send", icon: "upload_file" },
  { key: "receive", label: "Receive", icon: "download_for_offline" },
  { key: "history", label: "History", icon: "history" },
];

// Fixed bottom navigation shown on mobile widths. `active` highlights the
// current section; `onNavigate(key)` is called when a tab is tapped.
export default function BottomNav({ active = "send", onNavigate }) {
  return (
    <nav className="fixed bottom-0 z-50 flex h-16 w-full items-center justify-around border-t border-border bg-surface/80 px-4 shadow-lg backdrop-blur-xl md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate?.(item.key)}
            className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 font-label-sm text-label-sm transition-transform duration-200 active:scale-90 ${
              isActive
                ? "bg-primary-container/10 text-primary"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            <span className={`material-symbols-outlined mb-1 ${isActive ? "fill-icon" : ""}`}>
              {item.icon}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
