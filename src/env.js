
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../.env", import.meta.url));

function parseValue(raw) {
  const value = raw.trim();

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, "").trim();
}

if (existsSync(file)) {
  const contents = readFileSync(file, "utf8");

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
    );

    if (!match) {
      throw new Error(`Invalid .env syntax on line ${index + 1}.`);
    }

    const [, key, rawValue] = match;

    // Existing deployment environment variables take precedence.
    if (Object.hasOwn(process.env, key)) continue;

    process.env[key] = parseValue(rawValue);
  }
}
