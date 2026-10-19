// Tool titles as the server declares them (the catalogue's `title`), registered when the catalogue loads.
const titles = new Map<string, string>();

export function registerToolTitles(tools: { name: string; title?: string }[]) {
  for (const tool of tools) {
    if (tool.title && tool.title !== tool.name) titles.set(tool.name, tool.title);
  }
}

export function toolTitle(name?: string | null): string {
  if (!name) return "";
  return titles.get(name) || name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

// Tools as dropdown options, in the order the server lists them.
export function toolOptions<T>(tools: T[], name: (tool: T) => string, label: (tool: T) => string, hint?: (tool: T) => string | undefined) {
  return tools.map((tool) => ({ value: name(tool), label: label(tool), hint: hint?.(tool) }));
}
