import type { Advice } from "@/api/types/routing";

// routing-advice.js `requests`: one request per (run, case), kept so a reopened drawer shows the same proposal.
const requests = new Map<string, Promise<Advice>>();

export function adviceRequest(key: string, start: () => Promise<Advice>): Promise<Advice> {
  let pending = requests.get(key);
  if (!pending) { pending = start(); requests.set(key, pending); }
  return pending;
}
export const hasAdvice = (key: string) => requests.has(key);
export const forgetAdvice = (key: string) => requests.delete(key);
