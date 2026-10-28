import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages, translate } from "../i18n";

/** Texts that read the same in both languages (Spanish falls back to the English text). */
const SAME_IN_BOTH = new Set(["app.name", "common.grams", "common.percent", "lot.accuracy", "passport.lookupPlaceholder"]);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const { en, es } = messages;

describe("translations", () => {
  it("translates every English text into Spanish", () => {
    expect(Object.keys(en).filter((k) => !(k in es) && !SAME_IN_BOTH.has(k))).toEqual([]);
  });

  it("has no Spanish text without an English one", () => {
    expect(Object.keys(es).filter((k) => !(k in en))).toEqual([]);
  });

  it("uses the same placeholders in both languages", () => {
    const mismatched = Object.entries(es)
      .filter(([key, text]) => placeholders(text ?? "").join() !== placeholders(en[key as keyof typeof en]).join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("defines every key the pages ask for", () => {
    const src = join(__dirname, "..", "..");
    const used = new Set(
      sourceFiles(src).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1])),
    );
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter((k) => !(k in en))).toEqual([]);
  });

  it("fills placeholders and falls back to English, then to the key", () => {
    expect(translate("es", "common.grams", { value: "150" })).toBe("150 g");
    expect(translate("es", "no.such.key")).toBe("no.such.key");
  });
});
