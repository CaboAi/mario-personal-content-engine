import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const mobileRules = css.slice(css.indexOf("@media (max-width: 767px)"));

describe("mobile layout contract", () => {
  it("keeps the primary navigation reachable above the phone safe area", () => {
    expect(mobileRules).toMatch(/\.side-rail\s*\{[\s\S]*?position:\s*fixed;/);
    expect(mobileRules).toMatch(/\.side-rail\s*\{[\s\S]*?top:\s*auto;/);
    expect(mobileRules).toContain("env(safe-area-inset-bottom)");
    expect(mobileRules).toMatch(/\.workspace\s*\{[\s\S]*?padding:[^;]*safe-area-inset-bottom/);
  });

  it("turns experiment tables into labeled mobile rows", () => {
    expect(mobileRules).toContain(".metric-table-head { display: none; }");
    expect(mobileRules).toContain("content: attr(data-label)");
    expect(mobileRules).toContain(".metric-table-row .metric-signal { grid-column: 1 / -1; }");
  });

  it("prevents iOS form zoom and preserves touch-sized controls", () => {
    expect(mobileRules).toMatch(/input, select, textarea \{ font-size: 1rem !important; \}/);
    expect(mobileRules).toMatch(/\.primary-action,[\s\S]*?min-height:\s*2\.75rem;/);
  });
});
