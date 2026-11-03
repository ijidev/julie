import fs from "node:fs";
import path from "node:path";

export function findProjectRoot(start = process.cwd()): string {
  let candidate = path.resolve(start);
  while (true) {
    const manifest = path.join(candidate, "package.json");
    try {
      const parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string };
      if (parsed.name === "fintech-banking-platform") return candidate;
    } catch { /* keep walking toward the filesystem root */ }
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error("Could not locate fintech project root");
    candidate = parent;
  }
}
