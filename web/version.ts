import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// The Python package's version, the one `pip` installs: the page shows it, so it is read, not repeated.
export function packageVersion(): string {
  const project = readFileSync(fileURLToPath(new URL("../pyproject.toml", import.meta.url)), "utf8");
  const found = /^version\s*=\s*"([^"]+)"/m.exec(project);
  if (!found) throw new Error("no version in pyproject.toml");
  return found[1];
}
