import { useSyncExternalStore } from "react";

// The API keys typed in the page: kept in this browser only, sent with each request, never stored by the console.
export type Provider = "anthropic" | "openai";
export type ApiKeys = Partial<Record<Provider, string>>;
export const PROVIDERS: Provider[] = ["anthropic", "openai"];
const STORAGE = "whichtool.api-keys";
const HEADERS: Record<Provider, string> = { anthropic: "x-anthropic-key", openai: "x-openai-key" };

const clean = (keys: ApiKeys): ApiKeys => Object.fromEntries(
  PROVIDERS.map((provider) => [provider, keys[provider]?.trim()]).filter(([, key]) => key),
) as ApiKeys;

// A private window or blocked storage still keeps them for as long as the page is open.
function read(): ApiKeys {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
    return raw && typeof raw === "object" ? clean(raw as ApiKeys) : {};
  } catch {
    return {};
  }
}

let current = read();
const listeners = new Set<() => void>();

const apiKeys = () => current;

// Saved or forgotten in another tab: read again here, so this tab never sends or restores a stale key.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE && event.key !== null) return;
    current = read();
    for (const listener of listeners) listener();
  });
}

export function setApiKeys(next: ApiKeys) {
  current = clean(next);
  try {
    if (Object.keys(current).length) localStorage.setItem(STORAGE, JSON.stringify(current));
    else localStorage.removeItem(STORAGE);
  } catch { /* no storage: kept in memory */ }
  for (const listener of listeners) listener();
}

export function useApiKeys(): ApiKeys {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, apiKeys);
}

export function keyHeaders(): Record<string, string> {
  return Object.fromEntries(PROVIDERS.filter((provider) => current[provider]).map((provider) => [HEADERS[provider], current[provider]!]));
}
