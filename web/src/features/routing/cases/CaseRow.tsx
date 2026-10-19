import { memo } from "react";
import type { CaseRow as Row, CatalogTool } from "@/api/types/routing";
import { Button, CheckLabel, Inline, Mono } from "@/components/_ui";

interface Props {
  row: Row; tools: CatalogTool[]; ticked: boolean; onTick: (id: string) => void;
  onEdit: (row: Row) => void; onDelete: (row: Row) => void;
}

// One test in the library: ticked to export, with Edit and Delete.
function CaseRow({ row, tools, ticked, onTick, onEdit, onDelete }: Props) {
  return (
    <tr>
      <td className="casetick">
        <CheckLabel kind="caseTick" checked={ticked} onCheckedChange={() => onTick(row.id)}>
          <span className="sr-only">{`Export ${row.id}`}</span>
        </CheckLabel>
      </td>
      <td><Mono kind="cid">{row.id}</Mono><p>{row.prompt}</p></td>
      <td><span>{tools.find((t) => t.name === row.expect)?.title || row.expect}</span><code>{row.expect}</code></td>
      <Inline as="td" kind="caseActions">
        <Button variant="small" action="edit" glyph="edit" onClick={() => onEdit(row)}>Edit</Button>
        <Button variant="small" action="delete" glyph="delete" onClick={() => onDelete(row)}>Delete</Button>
      </Inline>
    </tr>
  );
}

export default memo(CaseRow);
