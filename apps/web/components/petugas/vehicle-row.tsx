import Link from "next/link";
import { Badge, Plate } from "../ui";
import { clock } from "@/lib/format";
import type { ActiveItem } from "@/lib/petugas/data";

export function VehicleRow({ v }: { v: ActiveItem }) {
  return (
    <Link href={`/checkout/${v.client_id}`}
      className="flex min-h-16 items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3 active:bg-paper-2">
      <Plate>{v.plate}</Plate>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">Masuk {clock(v.checkin_at)}</span>
        <span className="truncate text-xs text-muted">oleh {v.checkin_by?.name ?? "-"}</span>
      </span>
      {v.local ? <Badge tone="local">Belum terkirim</Badge>
        : v.status !== "parked" ? <Badge tone="pending">Insiden</Badge>
        : v.notes || v.has_issue ? <Badge tone="pending">Ada catatan</Badge> : null}
    </Link>
  );
}
