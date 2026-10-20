const TZ = "Asia/Jakarta";

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function displayPlate(raw: string): string {
  const n = normalizePlate(raw);
  const m = n.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  if (!m) return raw.toUpperCase().trim().replace(/\s+/g, " ");
  return m.slice(1).filter(Boolean).join(" ");
}

/** "12.41" */
export function clock(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", ".");
}

/** "Sel, 20 Okt · 12.41" */
export function dateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const day = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return `${day} · ${clock(d)}`;
}

export function longDate(d = new Date()): string {
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

/** 154 → "2 jam 34 menit"; short: "2j 34m" */
export function duration(minutes: number | null | undefined, short = false): string {
  if (minutes == null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (short) return h ? `${h}j ${m}m` : `${m}m`;
  if (!h) return `${m} menit`;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
}

export function minutesSince(iso: string, until?: string | null): number {
  return Math.max(0, Math.floor(((until ? new Date(until) : new Date()).getTime() - new Date(iso).getTime()) / 60000));
}

export function initial(name: string | null | undefined): string {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}

export const STATUS_LABEL: Record<string, string> = {
  parked: "Masih parkir",
  incident_pending: "Menunggu supervisor",
  incident_confirmed: "Kerusakan dicatat",
  released: "Selesai",
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  client_admin: "Admin klien",
  supervisor: "Supervisor",
  petugas: "Petugas",
};

export const SIDE_LABEL: Record<string, string> = {
  depan: "Depan",
  belakang: "Belakang",
  kiri: "Kiri",
  kanan: "Kanan",
  detail: "Close-up",
};
