import { keyHeaders } from "@/lib/api-keys";

export type Method = "GET" | "POST" | "PUT" | "DELETE";
export type ApiPayload = { detail?: unknown } & Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  payload: ApiPayload;
  constructor(path: string, status: number, payload: ApiPayload) {
    super(path);
    this.status = status;
    this.payload = payload;
  }
}

// console.js api(): JSON in, JSON out, {status, payload} thrown on a non-2xx.
export async function fetchJson<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  // x-whichtool: the console refuses any request that changes something without it,
  // which is what keeps a foreign page open in the same browser from driving it.
  // The page's API keys ride along: the console uses them for this request, and keeps nothing.
  const options: RequestInit = { method, headers: { "content-type": "application/json", "x-whichtool": "1", ...keyHeaders() } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(path, options);
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok) throw new ApiError(path, response.status, payload);
  return payload as T;
}

// A file the server hands over, as bytes; errors thrown as fetchJson throws them.
export async function fetchBlob(path: string): Promise<Blob> {
  const response = await fetch(path, { headers: { "x-whichtool": "1", ...keyHeaders() } });
  if (!response.ok) throw new ApiError(path, response.status, (await response.json().catch(() => ({}))) as ApiPayload);
  return response.blob();
}

// What the old toasts printed: `error.payload?.detail || error.status`.
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return String(error.payload.detail || error.status);
  return error instanceof Error ? error.message : String(error);
}
