/**
 * Membership card download (QA BUG-19).
 *
 * The button converts the rendered card (the active admin template, exactly
 * as it looks on screen) into a single-page PDF and saves it — no print
 * dialog. Rendering happens client-side:
 *
 *   1. html-to-image rasterizes the card DOM into a high-resolution PNG
 *      (pixel-perfect: webfonts, embedded base64 artwork, photo, QR —
 *      everything visible on screen is captured).
 *   2. jsPDF places that image on a page sized exactly to the card, so the
 *      output has no margins and no blank second page.
 *
 * html-to-image and jsPDF are big; they are loaded on first use only, so
 * visitors who never download don't pay for them.
 */

/** Export the card element as a crisp PNG (2× device pixels, white matte). */
async function rasterizeCard(card: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(card, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    // Reset transforms so the capture isn't offset by page-level centering.
    style: { transform: "none" },
  });
}

/**
 * Render `card` into a one-page PDF sized to the card and trigger the
 * browser's save dialog. Throws if the card can't be captured.
 */
export async function downloadCardPdf(card: HTMLElement): Promise<void> {
  const [{ jsPDF }, dataUrl] = await Promise.all([
    import("jspdf"),
    rasterizeCard(card),
  ]);

  // Natural (unzoomed) card size in CSS pixels → page size in millimetres
  // at 96 dpi, so the PDF has exactly the card's proportions.
  const widthPx = card.offsetWidth;
  const heightPx = card.offsetHeight;
  const pxToMm = 25.4 / 96;
  const widthMm = Math.max(widthPx * pxToMm, 1);
  const heightMm = Math.max(heightPx * pxToMm, 1);

  const pdf = new jsPDF({
    orientation: widthMm >= heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMm, heightMm],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
  pdf.save("membership-card.pdf");
}
