import imageCompression from "browser-image-compression";

const MAX_PX = Number(process.env.NEXT_PUBLIC_PHOTO_MAX_PX ?? 1600);

export function compressEnabled(): boolean {
  try {
    return localStorage.getItem("ceklis:compress") !== "0";
  } catch {
    return true;
  }
}

/** Kompres di browser sebelum disimpan/diunggah: maks ±1600px, JPEG 0.75 (PRD §2). */
export async function compressPhoto(file: File | Blob, maxPx = MAX_PX): Promise<Blob> {
  const input = file instanceof File ? file : new File([file], "foto.jpg", { type: file.type || "image/jpeg" });
  if (!compressEnabled() && maxPx === MAX_PX) {
    // Tetap JPEG supaya presigned URL (Content-Type image/jpeg) cocok
    if (input.type === "image/jpeg") return input;
  }
  return imageCompression(input, {
    maxWidthOrHeight: compressEnabled() ? maxPx : 4096,
    initialQuality: 0.75,
    fileType: "image/jpeg",
    useWebWorker: true,
  });
}
