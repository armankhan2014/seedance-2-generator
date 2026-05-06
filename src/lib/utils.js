/**
 * Triggers a browser download of a remote media file.
 *
 * Routes through /api/download so the response carries
 *   Content-Disposition: attachment; filename="..."
 * which forces a save dialog on every browser — including iOS Safari,
 * which ignores the <a download> attribute and would otherwise just
 * open the video inline.
 */
export function downloadMedia(url, filename = "seedance-creation.mp4") {
  const proxy = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
  const link = document.createElement("a");
  link.href = proxy;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
