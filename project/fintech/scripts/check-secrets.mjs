import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const ignoredFiles = new Set(["package-lock.json"]);
const textExtensions = new Set([
  ".css", ".env", ".example", ".html", ".js", ".json", ".md", ".mjs",
  ".prisma", ".sql", ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);

const patterns = [
  { name: "private key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", expression: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "seed phrase assignment", expression: /(?:seed[_ -]?phrase|mnemonic)\s*[:=]\s*["'][^"']{20,}["']/i },
  { name: "credential assignment", expression: /(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|private[_ -]?key)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i },
];

function collect(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target, output);
    else if (!ignoredFiles.has(entry.name) && textExtensions.has(path.extname(entry.name))) output.push(target);
  }
  return output;
}

const findings = [];
for (const file of collect(root)) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.expression.test(text)) findings.push(`${path.relative(root, file)}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error(`Potential committed secrets found:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
  process.exit(1);
}

console.log(`Secret-pattern check passed (${collect(root).length} text files scanned).`);
