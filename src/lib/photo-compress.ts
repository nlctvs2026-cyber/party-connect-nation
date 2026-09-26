/**
 * Client-side photo compression for enrollment photos.
 *
 * Every photo is resized into a 600×750 px box (the 4:5 ratio the membership
 * card uses) and re-encoded as JPEG, hard-capped at 100 KB — roughly 10k
 * photos per GB of Supabase Storage. Runs entirely in the browser, so the
 * original multi-MB file is never uploaded.
 */

/** Hard size cap for the processed photo. */
export const MAX_PHOTO_OUTPUT_BYTES = 100 * 1024;

/** Bounding box (px) the photo is fitted into before encoding. */
const MAX_WIDTH = 600;
const MAX_HEIGHT = 750;

/** JPEG quality at the start of the descent. */
const START_QUALITY = 0.85;
/** JPEG quality floor — below this artifacts outweigh the savings. */
const MIN_QUALITY = 0.5;
/** Quality decrement per pass. */
const QUALITY_STEP = 0.1;

/**
 * Compress an image file: decode, fit into the bounding box (never upscaled),
 * re-encode as JPEG, lowering quality until the blob is within the cap.
 * Returns a File so it can slot into the existing upload path unchanged.
 * Falls back to the original file if the browser cannot process the image —
 * the server-side 5 MB limit remains the guard.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (file.type === "image/gif") return file; // never animated sources

  try {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    // White matte so transparent PNGs do not turn black under JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    for (let quality = START_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", quality);
      });
      if (blob && blob.size <= MAX_PHOTO_OUTPUT_BYTES) {
        return toFile(blob, file.name);
      }
    }

    // Even minimum quality exceeds 100 KB: encode once more at the floor with
    // a smaller box (75%), which reliably lands under the cap.
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(width * 0.75));
    small.height = Math.max(1, Math.round(height * 0.75));
    const smallContext = small.getContext("2d");
    if (!smallContext) return file;
    smallContext.fillStyle = "#ffffff";
    smallContext.fillRect(0, 0, small.width, small.height);
    smallContext.drawImage(canvas, 0, 0, small.width, small.height);
    const smallBlob = await new Promise<Blob | null>((resolve) => {
      small.toBlob((result) => resolve(result), "image/jpeg", MIN_QUALITY);
    });
    if (smallBlob && smallBlob.size <= MAX_PHOTO_OUTPUT_BYTES) {
      return toFile(smallBlob, file.name);
    }
    // Last resort: use the best attempt (still far smaller than the original)
    // rather than failing the enrollment over a few KB.
    return smallBlob ? toFile(smallBlob, file.name) : file;
  } catch {
    // Undecodable image (or an exotic browser): upload as-is and let the
    // server-side checks decide.
    return file;
  }
}

function toFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
