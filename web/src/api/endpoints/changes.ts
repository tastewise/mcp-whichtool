import { fetchJson } from "../client";
import type { Saved, Sources } from "../types/changes";
// The tool descriptions the console can edit, as the source holds them now.
export const getDescriptions = () => fetchJson<Sources>("GET", "/api/routing/descriptions");
// Writes one description into the source, if the source has not moved since `revision`.
export const saveDescription = (body: { tool: string; revision: string; original_description: string; suggested_description: string }) =>
  fetchJson<Saved>("POST", "/api/routing/descriptions/apply", body);
