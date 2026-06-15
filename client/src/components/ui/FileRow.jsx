// Compact row showing a file's icon, name and metadata (type/size).
// Pass `onRemove` to render a trailing "remove" button.
export default function FileRow({ icon = "draft", name, meta, onRemove }) {
  return (
    <div className="flex items-center gap-stack-md rounded bg-surface-container-low p-stack-md">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-primary-container/10">
        <span className="material-symbols-outlined fill-icon text-primary-container">{icon}</span>
      </div>
      <div className="flex min-w-0 flex-grow flex-col">
        <span className="truncate font-label-md text-label-md text-on-surface">{name}</span>
        {meta && <span className="font-label-sm text-label-sm text-muted">{meta}</span>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      )}
    </div>
  );
}
