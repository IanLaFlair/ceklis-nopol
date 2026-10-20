const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
  /** Gagal karena jaringan (offline / server tak terjangkau), bukan ditolak server. */
  get isNetwork() {
    return this.status === 0;
  }
}

let deviceId: string | null = null;
function device(): string {
  if (deviceId) return deviceId;
  try {
    deviceId = localStorage.getItem("ceklis:device") ?? crypto.randomUUID();
    localStorage.setItem("ceklis:device", deviceId);
  } catch {
    deviceId = "unknown";
  }
  return deviceId;
}

function detail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((e) => (e as { msg?: string }).msg ?? "").filter(Boolean).join("; ");
  }
  return fallback;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      credentials: "include",
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(typeof window !== "undefined" ? { "X-Device": device() } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "Tidak ada koneksi");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 502/503/504 dari proxy = server belum terjangkau, perlakukan seperti offline
    const status = res.status >= 502 && res.status <= 504 && !body?.detail ? 0 : res.status;
    throw new ApiError(status, detail(body, `Gagal (${res.status})`));
  }
  return body as T;
}

export const fetcher = <T>(path: string) => api<T>(path);
