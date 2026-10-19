import type { DroppedFile } from "@/api/types/project";

// What the console reads: a server's source, or a .zip of it. Everything else stays on the user's disk.
const SOURCE = [".py", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
export const ACCEPT = [...SOURCE, ".zip"].join(",");
// Folders that are never the server's own code: not even opened.
const SKIPPED = new Set(["node_modules", "site-packages", "__pycache__", "venv", "build", "dist", "tests"]);

const skipped = (name: string) => SKIPPED.has(name) || name.startsWith(".");
const wanted = (name: string) => !name.endsWith(".d.ts") && [...SOURCE, ".zip"].some((ext) => name.toLowerCase().endsWith(ext));

async function read(file: File, path: string): Promise<DroppedFile> {
  if (!path.toLowerCase().endsWith(".zip")) return { path, content: await file.text() };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { path, base64: btoa(binary) };
}

// A folder's entries come in batches: read until one comes back empty.
async function children(folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = folder.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, into: { file: File; path: string }[]): Promise<void> {
  if (entry.isFile) {
    if (!wanted(entry.name)) return;
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    into.push({ file, path: entry.fullPath.replace(/^\/+/, "") });
  } else if (entry.isDirectory && !skipped(entry.name)) {
    for (const child of await children(entry as FileSystemDirectoryEntry)) await walk(child, into);
  }
}

export interface Drop { name: string; files: DroppedFile[] }

// The sources in what was dropped or picked: files, folders (walked), .zip archives (sent whole).
export async function collect(source: DataTransfer | FileList): Promise<Drop> {
  const found: { file: File; path: string }[] = [];
  const dragged = "items" in source;
  if (dragged && source.items.length && typeof source.items[0]!.webkitGetAsEntry === "function") {
    const entries = [...source.items].map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
    for (const entry of entries) await walk(entry, found);
  } else {
    for (const file of dragged ? [...source.files] : [...source]) {
      const path = file.webkitRelativePath || file.name;
      if (wanted(file.name) && !path.split("/").slice(0, -1).some(skipped)) found.push({ file, path });
    }
  }
  const first = found[0]?.path ?? "";
  const name = first.includes("/") ? first.split("/")[0]! : first.replace(/\.[^.]+$/, "");
  return { name, files: await Promise.all(found.map(({ file, path }) => read(file, path))) };
}
