const VARIANT_CLASSES = {
  primary:
    "bg-primary-container text-on-primary border border-primary-container/20 shadow-sm hover:brightness-95 disabled:opacity-50 disabled:hover:brightness-100",
  secondary:
    "bg-surface-container-lowest text-on-surface border border-border hover:bg-surface-container-low disabled:opacity-50",
  ghost:
    "bg-transparent text-primary-container border border-transparent hover:bg-surface-container-low disabled:opacity-50",
};

// Presentational button matching the QuickShare design system. Forwards any
// native button props (onClick, disabled, type, etc.).
export default function Button({
  children,
  variant = "primary",
  icon,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded px-6 py-2 font-label-md text-label-md transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
      {children}
    </button>
  );
}
