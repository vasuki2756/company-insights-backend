import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

const PROMPTS_DIR = process.env.PROMPTS_DIR ?? resolve(__dirname, "..", "prompts");

export function load(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), "utf-8");
}

export function render(name: string, tokens: Record<string, string> = {}): string {
  let text = load(name);
  for (const [key, value] of Object.entries(tokens)) {
    text = text.replace(`{{${key.toUpperCase()}}}`, value);
  }
  return text;
}
