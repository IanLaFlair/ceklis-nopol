"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { Close } from "../icons";

/** Scan QR tiket cek list dengan kamera belakang (BarcodeDetector kalau ada, fallback jsQR). */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = Native ? new Native({ formats: ["qr_code"] }) : null;

    async function tick() {
      const v = video.current;
      if (stopped || !v || v.readyState < 2 || !ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }
      let text: string | null = null;
      if (detector) {
        const found = await detector.detect(v).catch(() => []);
        text = found[0]?.rawValue ?? null;
      } else {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        text = jsQR(img.data, img.width, img.height)?.data ?? null;
      }
      if (text) {
        stopped = true;
        onResult(text.trim());
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("Kamera tidak bisa dibuka. Cari dengan plat atau slot."));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan QR tiket cek list" className="fixed inset-0 z-50 flex flex-col bg-ink text-on-ink">
      <div className="flex items-center gap-3 px-5 pb-3 pt-[max(env(safe-area-inset-top),20px)]">
        <button onClick={onClose} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-xl bg-ink-2"><Close /></button>
        <span className="font-display text-xl font-bold">Scan QR tiket cek list</span>
      </div>
      <div className="relative m-5 flex-1 overflow-hidden rounded-2xl bg-ink-2">
        <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
        {["left-3 top-3 border-l-[3px] border-t-[3px]", "right-3 top-3 border-r-[3px] border-t-[3px]",
          "bottom-3 left-3 border-b-[3px] border-l-[3px]", "bottom-3 right-3 border-b-[3px] border-r-[3px]"].map((c) => (
          <span key={c} aria-hidden="true" className={`absolute size-6 border-accent ${c}`} />
        ))}
        <div className="scanline" aria-hidden="true" />
        {error && <p className="absolute inset-x-4 bottom-4 rounded-xl bg-ink/90 p-3 text-sm">{error}</p>}
      </div>
      <p className="safe-bottom px-5 text-center text-sm text-on-ink-muted">Arahkan kamera ke QR di tiket cek list pemilik.</p>
    </div>
  );
}
