export const ACTION_LABEL: Record<string, string> = {
  checkin: "check in",
  checkout: "check out",
  incident_reported: "ditandai insiden",
  incident_no_damage: "insiden: tidak ada kerusakan",
  incident_damage_confirmed: "insiden: kerusakan baru",
  released: "diserahkan",
};

export const ACTION_DOT: Record<string, string> = {
  checkin: "bg-accent",
  checkout: "bg-[#2B2F2C]",
  incident_reported: "bg-danger",
  incident_no_damage: "bg-success",
  incident_damage_confirmed: "bg-danger",
  released: "bg-[#2B2F2C]",
};

export const INCIDENT_STATUS: Record<string, string> = {
  pending: "Menunggu",
  confirmed: "Kerusakan baru",
  dismissed: "Tidak ada kerusakan",
};

export function canManage(role: string | undefined): boolean {
  return role === "super_admin" || role === "client_admin";
}
