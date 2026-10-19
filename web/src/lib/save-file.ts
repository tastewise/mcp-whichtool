// Where a download lands: the browser's save dialog when it has one, else its Downloads folder.
interface SavePicker { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> }

export type SaveTarget = FileSystemFileHandle | "downloads";

// Asked on the click itself: the dialog needs the gesture, which a build would outlast. null: cancelled.
export async function pickSaveTarget(name: string): Promise<SaveTarget | null> {
  const picker = (window as unknown as SavePicker).showSaveFilePicker;
  if (!picker) return "downloads";
  try {
    return await picker({ suggestedName: name, startIn: "downloads", types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }] });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return "downloads";
  }
}

export async function saveFile(target: SaveTarget, blob: Blob, name: string): Promise<void> {
  if (target !== "downloads") {
    const writable = await target.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
