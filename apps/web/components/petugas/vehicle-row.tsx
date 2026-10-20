import Link from "next/link";
import { Badge, Plate } from "../ui";
import { clock } from "@/lib/format";
import type { ActiveItem } from "@/lib/petugas/data";

export function carLine(t: Pick<ActiveItem, "make_model" | "color" | "vehicle_type">) {
  return [t.make_model || t.vehicle_type, t.color].filter(Boolean).join(" · ") || "Kendaraan";
}

export function VehicleRow({ v }: { v: ActiveItem }) {
  return (
    <Link href={`/checkout/${v.client_id}`}
      className="flex min-h-16 items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3 active:bg-paper-2">
      <Plate>{v.plate}</Plate>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{carLine(v)}</span>
        <span className="text-xs text-muted">
          {v.slot ? `Slot ${v.slot} · ` : ""}masuk {clock(v.checkin_at)}
        </span>
      </span>
      {v.local ? <Badge tone="local">Belum terkirim</Badge>
        : v.status !== "parked" ? <Badge tone="pending">Insiden</Badge>
        : v.notes || v.has_issue ? <Badge tone="pending">Ada catatan</Badge> : null}
    </Link>
  );
}
