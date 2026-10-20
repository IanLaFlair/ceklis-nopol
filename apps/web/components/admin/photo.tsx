import type { TxPhoto } from "@/lib/types";
import { CarOutline } from "../icons";

/** Foto dari storage (thumb dulu), atau placeholder siluet mobil. */
export function PhotoBox({ photo, label, className = "h-[76px]", marker = false }: {
  photo?: TxPhoto | null;
  label: string;
  className?: string;
  marker?: boolean;
}) {
  const src = photo?.thumb_url ?? photo?.url;
  const note = !photo ? "Belum ada" : photo.deleted ? "Dihapus (retensi)" : !photo.uploaded ? "Belum terunggah" : null;
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-[10px] bg-ink-2 text-[#6F746E] ${className}`}>
      {src ? (
        <a href={photo?.url ?? src} target="_blank" rel="noreferrer" className="absolute inset-0" aria-label={`Buka foto ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Foto ${label}`} className="size-full object-cover" />
        </a>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <CarOutline />
          {note && <span className="text-[11px] text-[#A3A8A3]">{note}</span>}
        </div>
      )}
      {marker && src && (
        <span aria-hidden="true" className="pointer-events-none absolute left-[44%] top-[46%] h-[30px] w-11 rounded-md border-[2.5px] border-[#F2A07B]" />
      )}
    </div>
  );
}
