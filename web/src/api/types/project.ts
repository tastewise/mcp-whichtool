// What `GET /api/project` says: the project open, or the folder a new one would start from.
export type Project =
  | { configured: true; folder: string; file: string; uploaded: boolean; demo: boolean; name: string; server: string; routing: boolean; fingerprint: string }
  | { configured: false; folder: string; fingerprint: string };

// One tool a scan found. `path`: where the source declares it, empty when only the server knows it;
// `listed`: in the server's tools/list, so offered to the models.
export interface FoundTool { name: string; title: string; description: string; path: string; listed: boolean; params: string[] }

export interface Scanned {
  root: string; server: string; descriptions: string; tools: FoundTool[];
  // How many the models would be offered; `exists`: the folder has its own project file, opened as it is;
  // `uploaded`: a copy of files dropped in the page, not the user's own folder.
  offered: number; project: string; exists: boolean; uploaded: boolean;
}

// A file dropped in the page: a source as text, or a .zip as base64.
export type DroppedFile = { path: string; content: string } | { path: string; base64: string };
