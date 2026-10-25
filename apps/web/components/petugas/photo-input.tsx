"use client";

import { useEffect, useState } from "react";
import { useCamera } from "@/components/petugas/camera";
import { compressPhoto } from "@/lib/camera/compress";
import { clock } from "@/lib/format";

export interface Shot {
  id: string;
  blob: Blob;
  at: Date;
}

/** Tombol kamera: kamera di dalam aplikasi (selalu kamera belakang) + kompres di browser. */
export function useCapture(onShot: (shot: Shot) => void) {
  const [busy, setBusy] = useState(false);
  const cam = useCamera(async (file) => {
    setBusy(true);
    try {
      onShot({ id: crypto.randomUUID(), blob: await compressPhoto(file), at: new Date() });
    } finally {
      setBusy(false);
    }
  });
  return { input: cam.ui, open: cam.open, busy };
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function Thumb({ blob, src, alt, className = "" }: { blob?: Blob | null; src?: string | null; alt: string; className?: string }) {
  const local = useObjectUrl(blob);
  const url = local ?? src;
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={`absolute inset-0 size-full object-cover ${className}`} />;
}

export function shotLabel(shot: Shot | undefined) {
  return shot ? `Terfoto ${clock(shot.at)} · ulangi` : "Ketuk untuk foto";
}
