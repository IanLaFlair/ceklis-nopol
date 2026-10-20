import imageCompression from "browser-image-compression";

const MAX_PX = Number(process.env.NEXT_PUBLIC_PHOTO_MAX_PX ?? 1600);

/** Kompres di browser sebelum disimpan/diunggah: maks ±1600px, JPEG 0.75 (PRD §2). */
export async function compressPhoto(file: File | Blob, maxPx = MAX_PX): Promise<Blob> {
  const input = file instanceof File ? file : new File([file], "foto.jpg", { type: file.type || "image/jpeg" });
  return imageCompression(input, {
    maxWidthOrHeight: maxPx,
    initialQuality: 0.75,
    fileType: "image/jpeg",
    useWebWorker: true,
  });
}
