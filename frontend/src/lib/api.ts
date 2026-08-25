// Thin fetch wrapper around the Ledger API with JWT handling.

const TOKEN_KEY = "ledger-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Types -----------------------------------------------------------------

export interface Totals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost_notional_usd: number;
}
export interface Bucket extends Totals {
  key: string;
}
export interface TrendPoint extends Totals {
  date: string;
}
export interface Summary {
  start_date: string | null;
  end_date: string | null;
  totals: Totals;
  trend: TrendPoint[];
  by_model: Bucket[];
  by_device: Bucket[];
  by_source_tool: Bucket[];
}
export interface Device {
  id: number;
  hostname: string;
  os: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
  stale: boolean;
}
export interface EnrollmentToken {
  id: number;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
}
export interface EnrollmentCreated {
  id: number;
  token: string;
  label: string | null;
  expires_at: string | null;
  install_command: string;
}
export interface Meta {
  version: string;
  ccusage_version: string;
  base_url: string;
  device_stale_after_hours: number;
}
export interface User {
  id: number;
  email: string;
  created_at: string;
}

// --- Endpoints -------------------------------------------------------------

export const api = {
  register: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/api/auth/me"),
  meta: () => request<Meta>("/api/meta"),

  summary: (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return request<Summary>(`/api/usage/summary${qs ? `?${qs}` : ""}`);
  },

  devices: () => request<Device[]>("/api/devices"),
  revokeDevice: (id: number) =>
    request<Device>(`/api/devices/${id}/revoke`, { method: "POST" }),

  enrollmentTokens: () => request<EnrollmentToken[]>("/api/enrollment"),
  createEnrollment: (label?: string) =>
    request<EnrollmentCreated>("/api/enrollment/create", {
      method: "POST",
      body: JSON.stringify({ label: label || null }),
    }),
  revokeEnrollment: (id: number) =>
    request<EnrollmentToken>(`/api/enrollment/${id}/revoke`, { method: "POST" }),
};
