import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { messages, translate } from "../i18n";

/** Texts that read the same in both languages, so English falls back to the Spanish text. */
const SAME_IN_BOTH = new Set(["common.grams", "common.percent", "role.ADMIN"]);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const { es, en } = messages;

it("translates every Spanish text into English", () => {
  const missing = Object.keys(es).filter((k) => !(k in en) && !SAME_IN_BOTH.has(k));
  expect(missing).toEqual([]);
});

it("has no English text without a Spanish one", () => {
  expect(Object.keys(en).filter((k) => !(k in es))).toEqual([]);
});

it("uses the same placeholders in both languages", () => {
  const mismatched = Object.entries(en)
    .filter(([key, text]) => placeholders(text ?? "").join() !== placeholders(es[key as keyof typeof es]).join())
    .map(([key]) => key);
  expect(mismatched).toEqual([]);
});

it("defines every key the screens ask for", () => {
  const src = join(__dirname, "..", "..");
  const used = new Set(sourceFiles(src).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1])));
  expect(used.size).toBeGreaterThan(50);
  expect([...used].filter((k) => !(k in es))).toEqual([]);
});

it("fills placeholders and falls back to Spanish, then to the key", () => {
  expect(translate("en", "common.grams", { value: 150 })).toBe("150 g");
  expect(translate("es", "common.showingSaved", { time: "07:00" })).toContain("07:00");
  expect(translate("en", "no.such.key")).toBe("no.such.key");
});
