"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Close } from "@/components/icons";
import { Spinner } from "@/components/ui";

type Facing = "environment" | "user";

/**
 * Kamera di dalam aplikasi (getUserMedia). Dipakai karena banyak HP Android (mis. Samsung) mengabaikan
 * `capture="environment"` dan membuka kamera depan. Kalau kamera tidak bisa dibuka (izin ditolak, browser lama),
 * otomatis jatuh ke kamera bawaan HP lewat <input type="file">.
 */
export function useCamera(onFile: (file: File) => void, opts: { guide?: "plate"; title?: string } = {}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const start = useCallback(() => {
    if (supported) setOpen(true);
    else fileRef.current?.click();
  }, [supported]);

  const fallback = useCallback(() => {
    setOpen(false);
    fileRef.current?.click();
  }, []);

  const ui = (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      {open && (
        <CameraSheet title={opts.title} guide={opts.guide} onClose={() => setOpen(false)} onFallback={fallback}
          onCapture={(f) => { setOpen(false); onFile(f); }} />
      )}
    </>
  );
  return { open: start, ui };
}

function CameraSheet({ title = "Ambil foto", guide, onClose, onFallback, onCapture }: {
  title?: string;
  guide?: "plate";
  onClose: () => void;
  onFallback: () => void;
  onCapture: (f: File) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    async function openStream() {
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      try {
        // `exact` dulu supaya HP yang "ngeyel" tetap pakai kamera belakang; kalau tidak ada, pakai `ideal`
        let s: MediaStream;
        try {
          s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: facing }, ...size } });
        } catch {
          s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, ...size } });
        }
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Izin kamera ditolak. Izinkan kamera untuk ceklis di pengaturan browser, atau pakai kamera bawaan HP.");
        } else {
          onFallback();
        }
      }
    }
    void openStream();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [facing, onFallback]);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (b) onCapture(new File([b], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3">
        <button onClick={onClose} aria-label="Tutup kamera" className="flex size-11 items-center justify-center rounded-xl bg-white/10"><Close /></button>
        <span className="flex-1 font-semibold">{title}</span>
        <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Ganti kamera depan/belakang"
          className="min-h-11 rounded-xl bg-white/10 px-3 text-sm font-semibold">Ganti kamera</button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        {guide === "plate" && ready && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="aspect-[3.2/1] w-[78%] max-w-[420px] rounded-xl border-[3px] border-accent shadow-[0_0_0_9999px_rgba(0,0,0,.45)]" />
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm">Dekatkan, plat tegak di dalam kotak</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm leading-normal">{error}</p>
            <button onClick={onFallback} className="min-h-12 rounded-[14px] bg-accent px-5 font-bold text-ink">Pakai kamera bawaan HP</button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]">
        <button onClick={onFallback} className="min-h-11 text-sm text-white/80 underline">Kamera HP</button>
        <button onClick={shoot} disabled={!ready} aria-label="Ambil foto"
          className="size-[72px] rounded-full border-4 border-white bg-white/90 disabled:opacity-40" />
        <span className="w-[72px]" />
      </div>
    </div>
  );
}
