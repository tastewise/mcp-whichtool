import { fetchJson } from "../client";
import type { DroppedFile, Project, Scanned } from "../types/project";
import type { Catalog } from "../types/routing";

interface ProjectAsk { folder: string; server: string }

export const getProject = () => fetchJson<Project>("GET", "/api/project");
// Dropped files, kept on the console's side in a folder of their own, then read with the server's tools.
// No files and a server: the server alone. Writes no project file.
export const uploadProject = (body: { name: string; server: string; files: DroppedFile[] }) => fetchJson<Scanned>("POST", "/api/project/upload", body);
// The bookshop demo, its tools and its cases ready.
export const openDemo = () => fetchJson<Opened>("POST", "/api/project/demo", {});
// Writes the project file for them, unless the folder has one, and opens it.
export const openProject = (ask: ProjectAsk) => fetchJson<Opened>("POST", "/api/project", ask);

// A project just opened, with its tests when they could be read: the page opens on them without asking again.
export type Opened = Project & { catalog?: Catalog | null };
