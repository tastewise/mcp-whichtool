import { memo, useRef, useState, type DragEvent, type SubmitEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { errorText } from "@/api/client";
import { uploadProject } from "@/api/endpoints/project";
import type { Project, Scanned } from "@/api/types/project";
import { Button, ErrLine, Field, ICON, Icon, Input, Mono, Muted, SecHead, Table, TableScroll, Waiting } from "@/components/_ui";
import { ACCEPT, collect, type Drop } from "./drop";
import { useOpenProject, useOpening } from "./use-open-project";

// What a scan reads: files dropped in the page, the server's URL, or both.
type Ask = { drop: Drop | null; server: string };

const scanned = ({ drop, server }: Ask) => uploadProject({ name: drop?.name ?? "", server, files: drop?.files ?? [] });

// The home page: the server's code dropped in, or its URL, then its tools, then the tests.
// Nothing is kept until "Test these tools", and a folder's own project file is opened as it is.
function ProjectSetup({ project }: { project: Project }) {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [server, setServer] = useState(project.configured ? project.server : "");
  const scan = useMutation({ mutationFn: scanned });
  const open = useOpenProject();
  const opening = useOpening();
  const run = (ask: Ask) => { open.reset(); scan.mutate(ask); };
  // Files dropped are scanned on their own: the URL is the other way in, not an extra.
  const dropped = (next: Drop) => { setDrop(next); run({ drop: next, server: "" }); };
  const [missing, setMissing] = useState(false);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMissing(!server.trim());
    if (server.trim()) run({ drop, server: server.trim() });
  };

  return (
    <>
      <section id="project-setup" className="card">
        <SecHead>Scan your server's tools</SecHead>
        <p className="setup-lead">Drop your MCP server's code, or give its URL.</p>
        <Muted as="p" kind="dim" className="setup-privacy" id="setup-privacy">
          Read on your machine: your code and your tools are never sent to us, and stored nowhere but on your computer.{" "}
          <Link to="/docs/your-keys-and-your-tools">What goes where</Link>
        </Muted>
        <DropZone drop={drop} busy={scan.isPending} onDrop={dropped} onClear={() => { setDrop(null); scan.reset(); }} />
        {drop ? null : <>
          <div className="setup-or" aria-hidden="true"><span>or</span></div>
          <form id="setup-form" onSubmit={submit}>
            <Field label="Server URL">
              <Input id="setup-server" type="url" value={server} onChange={(e) => { setServer(e.target.value); if (!drop) scan.reset(); }} placeholder="https://your-server.example.com/mcp" spellCheck={false} />
            </Field>
            <Button type="submit" tone="primary" glyph="scan" id="setup-scan" disabled={scan.isPending}>Scan</Button>
          </form>
          {missing && !server.trim() ? <ErrLine className="setup-missing">Type the server's URL first, or drop its files above.</ErrLine> : null}
        </>}
        {scan.isPending ? <Waiting label="Reading the tools…" /> : null}
        {scan.isError ? (
          <div id="setup-error" className="setup-alert" role="alert">
            <strong>Couldn't read the tools</strong>
            <span>{errorText(scan.error)}</span>
          </div>
        ) : null}
        {scan.data && !scan.isPending ? <Found found={scan.data} source={drop ? dropLabel(drop) : ""} opening={opening} onOpen={() => { if (!opening) open.mutate({ folder: scan.data.root, server: scan.data.server }); }} /> : null}
        {open.isError ? <p id="setup-open-error"><ErrLine>{errorText(open.error)}</ErrLine></p> : null}
      </section>
    </>
  );
}

function DropZone({ drop, busy, onDrop, onClear }: { drop: Drop | null; busy: boolean; onDrop: (drop: Drop) => void; onClear: () => void }) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = async (source: DataTransfer | FileList | null) => {
    if (!source || ("length" in source && !source.length)) return;  // a picker closed without a choice
    onDrop(await collect(source));
  };
  const onDropped = (event: DragEvent) => { event.preventDefault(); setOver(false); void take(event.dataTransfer); };
  // Files in hand: the zone steps aside, and Clear brings it back.
  if (drop) {
    return <p id="setup-dropped"><Button variant="small" glyph="clear" id="setup-clear" disabled={busy} onClick={onClear}>Clear</Button></p>;
  }
  return (
    <div id="setup-drop" className="dropzone" data-over={over ? "yes" : undefined} aria-busy={busy}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDropped}>
      <span className="dropzone-icon"><Icon html={ICON.upload} size={22} /></span>
      <p>
        Drag your files or project folder here, or{" "}
        <button type="button" className="linklike" onClick={() => files.current?.click()}>browse your files</button>
        {" / "}
        <button type="button" className="linklike" onClick={() => folder.current?.click()}>a folder</button>.
      </p>
      <Muted as="p" kind="dim" className="dropzone-types">Python (.py), TypeScript (.ts) or JavaScript (.js): files, a folder, or a .zip</Muted>
      <input ref={files} type="file" multiple accept={ACCEPT} hidden aria-label="Browse your files" onChange={(event) => void take(event.target.files)} />
      <input ref={folder} type="file" hidden aria-label="Browse a folder" {...{ webkitdirectory: "" }} onChange={(event) => void take(event.target.files)} />
    </div>
  );
}

const dropLabel = (drop: Drop) => drop.files.length === 1 ? drop.files[0]!.path : `${drop.files.length} files${drop.name ? ` from ${drop.name}` : ""}`;

// `source`: what was dropped, named as the user knows it.
function Found({ found, source, opening, onOpen }: { found: Scanned; source: string; opening: boolean; onOpen: () => void }) {
  const origin = found.server ? `from ${found.server}` : source ? `in ${source}` : found.uploaded ? "in your files" : `in ${found.root}`;
  return (
    <div id="setup-found">
      <p role="status" id="setup-count"><strong>{`${found.offered} tool${found.offered === 1 ? "" : "s"}`}</strong>{` found ${origin}`}</p>
      {found.server ? null : (
        <Muted as="p" kind="desc" id="setup-no-server">From the code, the models see each tool's description, not its arguments.</Muted>
      )}
      <TableScroll>
        <Table head={["Tool", "Description", "Declared in"]} bodyId="setup-tools">
          {found.tools.map((tool) => {
            const offered = tool.listed || !found.server;
            return (
              <tr key={tool.name} data-offered={offered ? "yes" : "no"}>
                <td><Mono>{tool.name}</Mono>{tool.title !== tool.name ? <Muted kind="dim" as="div">{tool.title}</Muted> : null}
                  {offered ? null : <Muted kind="dim" as="div">not listed by the server: not offered</Muted>}</td>
                <td>{tool.description || <Muted kind="dim">no description</Muted>}</td>
                <td>{tool.path ? <Mono>{tool.path}</Mono> : <Muted kind="dim">the server only</Muted>}</td>
              </tr>
            );
          })}
        </Table>
      </TableScroll>
      <div className="setup-actions">
        <Button tone="primary" id="setup-open" disabled={opening || !found.offered} onClick={onOpen}>
          Test these tools →
        </Button>
      </div>
    </div>
  );
}

export default memo(ProjectSetup);
