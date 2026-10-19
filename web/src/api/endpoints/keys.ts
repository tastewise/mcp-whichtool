import { fetchJson } from "../client";

// Which providers have a key on this machine (its environment or the project's .env): never the key.
export const getMachineKeys = () => fetchJson<{ anthropic: boolean; openai: boolean }>("GET", "/api/keys");
