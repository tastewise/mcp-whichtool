import { memo, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { useNavigate } from "react-router";
import { errorText, fetchBlob } from "@/api/client";
import { useProject } from "@/api/queries/project";
import { Button } from "@/components/_ui";
import { notify } from "@/lib/notify";
import { pickSaveTarget, saveFile } from "@/lib/save-file";

// The two forms an export takes: a kit whichtool runs in CI, or the tests alone for one's own code.
const FORMATS = [
  { format: "kit", extension: "zip", label: "Kit for your CI (.zip)", hint: "The tests, a project file and a GitHub Actions workflow" },
  { format: "json", extension: "json", label: "Tests only (.json)", hint: "To run them in your own code" },
] as const;

// The tests, out of the library: the ticked tests when some are ticked, else every one.
function ExportTests({ ticked, total }: { ticked: string[]; total: number }) {
  const project = useProject().data;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const label = ticked.length ? `Export ${ticked.length} test${ticked.length === 1 ? "" : "s"}` : `Export all ${total} tests`;
  const save = async ({ format, extension }: (typeof FORMATS)[number]) => {
    const name = `routing-tests-${project?.configured ? project.name : "project"}.${extension}`;
    // The save dialog needs the click itself: asked before the file is built.
    const target = await pickSaveTarget(name);
    if (!target) return;
    setBusy(true);
    try {
      const query = [`format=${format}`, ...ticked.map((id) => `cases=${encodeURIComponent(id)}`)].join("&");
      await saveFile(target, await fetchBlob(`/api/routing/export?${query}`), name);
    } catch (error) {
      notify.warn(`Could not export the tests: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="small" tone="primary" glyph="download" id="case-export" disabled={busy}>{busy ? "Exporting…" : label}</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="rowmenu export-menu" align="end" sideOffset={6}>
          {FORMATS.map((option) => (
            <DropdownMenu.Item key={option.format} className="rowmenu-item export-option" onSelect={() => void save(option)}>
              <span><strong>{option.label}</strong><small>{option.hint}</small></span>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="export-sep" />
          <DropdownMenu.Item className="rowmenu-item export-help" onSelect={() => void navigate("/docs/exporting-your-tests")}>
            Which one, and how to use it
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default memo(ExportTests);
