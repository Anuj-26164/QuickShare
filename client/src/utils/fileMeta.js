// Maps a file (name + MIME type) to a Material Symbols icon name and a short,
// human-readable type label for the UI. Best-effort and presentational only.

const EXT_ICON = {
  // images
  png: "image", jpg: "image", jpeg: "image", gif: "gif", webp: "image",
  svg: "image", bmp: "image", heic: "image", avif: "image",
  // video
  mp4: "video_file", mov: "video_file", mkv: "video_file", webm: "video_file",
  avi: "video_file", m4v: "video_file",
  // audio
  mp3: "audio_file", wav: "audio_file", flac: "audio_file", aac: "audio_file",
  ogg: "audio_file", m4a: "audio_file",
  // archives
  zip: "folder_zip", rar: "folder_zip", "7z": "folder_zip", gz: "archive",
  tar: "archive", tgz: "archive", bz2: "archive", xz: "archive",
  // docs
  pdf: "picture_as_pdf", doc: "description", docx: "description",
  txt: "description", rtf: "description", md: "description",
  xls: "table", xlsx: "table", csv: "table",
  ppt: "slideshow", pptx: "slideshow",
  // code
  js: "code", jsx: "code", ts: "code", tsx: "code", json: "data_object",
  html: "code", css: "code", py: "code", java: "code", c: "code",
  cpp: "code", go: "code", rs: "code", sh: "terminal",
  // misc
  exe: "terminal", dmg: "hard_drive", iso: "hard_drive", apk: "android",
};

function extOf(name = "") {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

// Pick an icon name from MIME type first, then file extension.
export function fileIcon(name = "", mime = "") {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video_file";
  if (m.startsWith("audio/")) return "audio_file";
  if (m === "application/pdf") return "picture_as_pdf";
  if (/zip|compressed|tar|gzip/.test(m)) return "folder_zip";

  return EXT_ICON[extOf(name)] || "draft";
}

// A short type label like "Video / MP4", "Image / PNG", "PDF Document".
export function fileTypeLabel(name = "", mime = "") {
  const ext = extOf(name).toUpperCase();
  const m = (mime || "").toLowerCase();

  if (m.startsWith("image/")) return ext ? `Image / ${ext}` : "Image";
  if (m.startsWith("video/")) return ext ? `Video / ${ext}` : "Video";
  if (m.startsWith("audio/")) return ext ? `Audio / ${ext}` : "Audio";
  if (m === "application/pdf") return "PDF Document";
  if (/zip|compressed|tar|gzip/.test(m)) return ext ? `Archive / ${ext}` : "Archive";
  if (/word|document/.test(m)) return "Document";
  if (/sheet|excel|csv/.test(m)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(m)) return "Presentation";

  return ext ? `${ext} File` : "File";
}
