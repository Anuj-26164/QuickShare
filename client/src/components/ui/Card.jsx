const PADDING_CLASSES = {
  none: "",
  md: "p-stack-md",
  lg: "p-stack-lg",
};

// White, bordered, ambient-shadow surface used to wrap the
// Sender / Receiver / History interfaces ("Level 1 (Cards)").
export default function Card({ children, padding = "lg", className = "" }) {
  return (
    <div
      className={`bg-surface-container-lowest border border-border rounded-lg ambient-shadow ${PADDING_CLASSES[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
