"use client";

export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function openBlobInNewTab(blob: Blob) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    return false;
  }

  const objectUrl = URL.createObjectURL(blob);
  popup.location.replace(objectUrl);
  popup.focus();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return true;
}
