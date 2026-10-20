import type { IncidentBrief, User } from "@/lib/types";

export interface ScopeClient {
  id: number;
  name: string;
  sites: { id: number; name: string; posts: { id: number; name: string; active: boolean }[] }[];
}

export interface Stats {
  kpi: {
    parked: number;
    in_today: number;
    out_today: number;
    open_incidents: number;
    avg_duration_minutes: number | null;
  };
  hourly: { hour: number; in: number; out: number }[];
  activity: { action: string; at: string; plate: string | null; code: string | null; actor: string | null; post: string; site: string }[];
  rows: { kind: "site" | "post"; id: number; name: string; parked: number; in: number; out: number; incidents: number; staff: string[] }[];
}

export interface AdminIncident extends IncidentBrief {
  plate: string;
  transaction_id: number;
  post: string;
  site: string;
}

export interface ActivityEntry {
  action: string;
  at: string;
  actor: string | null;
  device: string | null;
  meta: Record<string, unknown> | null;
}

export interface SiteOut {
  id: number;
  client_id: number;
  name: string;
  address: string | null;
  template_id: number | null;
  posts: { id: number; name: string; active: boolean }[];
}

export interface AssignmentOut {
  id: number;
  user_id: number;
  user_name: string;
  post_id: number;
  post_name: string;
  role_on_post: "petugas" | "supervisor";
  shift_name: string | null;
  shift: string | null;
  shift_start: string | null;
  shift_end: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface SiteOverview {
  site: SiteOut & { client: { id: number; name: string }; template: { id: number; name: string } | null };
  posts: { id: number; name: string; active: boolean; parked: number; staff: string[]; supervisors: string[] }[];
  staff: {
    user: User;
    role: string;
    active: boolean;
    posts: string[];
    checks_today: number;
    last_active_at: string | null;
    assignments: AssignmentOut[];
  }[];
}

export interface AdminUserRow extends User {
  active: boolean;
  last_active_at: string | null;
}

export interface TemplateRow {
  id: number;
  name: string;
  client_id: number | null;
  version: number | null;
  version_id: number | null;
  updated_at: string | null;
  used_by: { id: number; name: string }[];
}

export interface TemplateFull extends TemplateRow {
  config: import("@/lib/types").TemplateConfig;
  versions: { id: number; version: number; created_at: string; created_by: number | null }[];
}
