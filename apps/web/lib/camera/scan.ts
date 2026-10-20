import { ApiError } from "../api/client";
import { compressPhoto } from "./compress";

export interface PlateScan {
  plate: string;
  confidence: number;
  needs_confirmation: boolean;
}

/** Satu foto kamera belakang → API Ceklis → engine Nopol (PRD §9). Gagal → petugas ketik manual. */
export async function scanPlate(file: File): Promise<PlateScan> {
  const small = await compressPhoto(file, 1280);
  const form = new FormData();
  form.append("image", small, "frame.jpg");
  let res: Response;
  try {
    res = await fetch((process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api") + "/plates/scan", {
      method: "POST",
      body: form,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Offline — ketik nomor polisi manual.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.detail ?? "Plat tidak terbaca. Ketik manual.");
  return body as PlateScan;
}
