// Bentuk data dari API Ceklis (apps/api/app/services/serialize.py & routers).

export type Role = "super_admin" | "client_admin" | "supervisor" | "petugas";
export type TxStatus = "parked" | "incident_pending" | "incident_confirmed" | "released";
export type Side = "depan" | "belakang" | "kiri" | "kanan" | "detail";
export type PhotoMode = "required_4_sides" | "only_when_unchecked" | "off";

export interface User {
  id: number;
  name: string;
  role: Role;
  staff_code: string | null;
  phone: string | null;
  email: string | null;
  client_id: number | null;
  has_pin: boolean;
}

export interface TemplateItem {
  id: string;
  label: string;
  kind: "exterior" | "inside_item";
  requires_photo_if_unchecked: boolean;
  free_text: boolean;
  /** Barang di dalam: kalau dicentang wajib difoto */
  requires_photo_if_present?: boolean;
}

export interface ConditionOption {
  id: string;
  label: string;
  /** dihitung baik (mis. Mulus) */
  ok: boolean;
}

export interface TemplateGroup {
  id: string;
  title: string;
  items: TemplateItem[];
}

export interface SummaryLine {
  label: string;
  item_ids: string[];
}

export interface TemplateConfig {
  photo_mode: PhotoMode;
  required_sides: Exclude<Side, "detail">[];
  groups: TemplateGroup[];
  /** Kosong = mode centang lama. Terisi = tiap bagian luar wajib dipilih kondisinya. */
  conditions?: ConditionOption[];
  summary_title: string;
  summary_lines: SummaryLine[];
}

export interface AssignmentInfo {
  id: number;
  role_on_post: "petugas" | "supervisor";
  shift: string | null;
  post: { id: number; name: string };
  site: { id: number; name: string; address: string | null };
  client: { id: number; name: string };
}

export interface MyAssignment {
  assignments: AssignmentInfo[];
  active: AssignmentInfo | null;
  template: { template_id: number; name: string; version_id: number; version: number; config: TemplateConfig } | null;
  supervisors: { id: number; name: string; phone: string | null }[];
}

export interface UserBrief {
  id: number;
  name: string;
}

export interface TxListItem {
  id: number;
  client_id: string;
  ticket_code: string;
  status: TxStatus;
  plate: string;
  vehicle_type: string | null;
  color: string | null;
  make_model: string | null;
  slot: string | null;
  key_tag: string | null;
  vip: boolean;
  notes: string | null;
  has_issue: boolean;
  post: { id: number; name: string };
  site: { id: number; name: string };
  checkin_at: string;
  checkin_by: UserBrief | null;
  checkout_at: string | null;
  checkout_by: UserBrief | null;
  released_at: string | null;
  duration_minutes: number;
}

export interface TxCheck {
  phase: "in" | "out";
  item_id: string;
  label: string;
  group: string;
  checked: boolean;
  condition?: string | null;
  note: string | null;
}

export interface TxInside {
  phase: "in" | "out";
  item_id: string;
  label: string;
  present: boolean;
  extra_text: string | null;
}

export interface TxPhoto {
  id: number;
  client_id: string;
  phase: "in" | "out";
  side: Side;
  item_id: string | null;
  incident_id: number | null;
  taken_at: string;
  uploaded: boolean;
  deleted: boolean;
  url: string | null;
  thumb_url: string | null;
}

export interface IncidentBrief {
  id: number;
  code: string;
  status: "pending" | "confirmed" | "dismissed";
  parts: string[];
  note: string | null;
  created_at: string;
  reported_by: UserBrief | null;
  decision: "no_damage" | "damage_confirmed" | null;
  decision_note: string | null;
  decided_at: string | null;
  decided_by: UserBrief | null;
}

export interface TxDetail extends TxListItem {
  owner_phone: string | null;
  checkout_notes: string | null;
  summary_text: string;
  template_version_id: number;
  template: TemplateConfig;
  checks: TxCheck[];
  inside_items: TxInside[];
  photos: TxPhoto[];
  photos_complete: boolean;
  incidents: IncidentBrief[];
}

export interface IncidentDetail extends IncidentBrief {
  transaction: TxDetail;
}
