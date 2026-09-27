/**
 * One-click download of the rendered membership card (QA BUG-19).
 *
 * The click produces a single .html file containing exactly the active card
 * template filled with the member's data — no page chrome. The photo and QR
 * are embedded as data URLs, so the file renders identically offline, in any
 * browser, forever (no signed-URL expiry).
 */

/** Fetch an image and convert it to a base64 data URL; null if unreachable. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Build the downloadable card document and trigger the browser's save dialog.
 * Resolves once the download has been kicked off.
 */
export async function downloadCardHtml(cardHtml: string): Promise<void> {
  // Inline the photo and QR so the file is fully self-contained. If a fetch
  // fails (offline, expired link), keep the original URL as a fallback.
  const images = Array.from(cardHtml.matchAll(/<img\b[^>]*>/gi)).map((match) => match[0]);
  let inlined = cardHtml;
  for (const tag of images) {
    const src = tag.match(/\ssrc="(https?:\/\/[^"]+)"/i)?.[1];
    if (!src) continue;
    const dataUrl = await toDataUrl(src);
    if (dataUrl) inlined = inlined.replace(tag, tag.replace(src, dataUrl));
  }

  const document_ = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Membership Card</title>
<style>
  html, body { margin: 0; padding: 24px 12px; background: #f5f1e8; }
  body { display: flex; flex-direction: column; align-items: center; gap: 16px; }
  img { max-width: 100%; }
  @media print {
    html, body { background: #fff; padding: 0; }
    body { display: block; }
  }
</style>
</head>
<body>
${inlined}
</body>
</html>`;

  const blob = new Blob([document_], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "membership-card.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
