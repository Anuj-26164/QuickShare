import { useRef, useState } from "react";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "../../constants.js";
import Button from "./Button.jsx";

// Large dashed drop target from the Send screen. Handles drag-and-drop, the
// file picker, and size validation, then hands the chosen file to
// `onFileSelected`. Visual states (default vs active-drag) follow the design's
// `dropzone-dash` / `dropzone-dash-active` treatments.
export default function DropZone({ onFileSelected }) {
  const inputRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = (selected) => {
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError(`File exceeds the ${MAX_FILE_SIZE_LABEL} limit.`);
      return;
    }
    setError(null);
    onFileSelected(selected);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="flex flex-col gap-stack-sm">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-stack-md p-stack-lg text-center outline-none transition-colors duration-200 ${
          active ? "dropzone-dash-active" : "dropzone-dash hover:bg-surface-container-low"
        }`}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-container/10">
          <span
            className="material-symbols-outlined fill-icon text-primary-container"
            style={{ fontSize: "40px" }}
          >
            cloud_upload
          </span>
        </div>
        <div className="flex flex-col gap-stack-xs">
          <span className="font-headline-md text-headline-md text-on-surface">Select a file</span>
          <span className="font-body-md text-body-md text-muted">or drag it here</span>
        </div>
        <Button variant="primary" className="mt-stack-sm" onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}>
          Browse Files
        </Button>
        <span className="font-label-sm text-label-sm text-muted">
          Any file type · up to {MAX_FILE_SIZE_LABEL}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="flex items-center justify-center gap-1.5 font-label-sm text-label-sm text-error">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}
