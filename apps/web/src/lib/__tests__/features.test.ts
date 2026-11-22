import { describe, expect, it } from "vitest";
import { FEATURE_PHASE, isEnabled, releasePhase, type Feature } from "../features";

describe("release switch", () => {
  const shown = (phase: number) => (Object.keys(FEATURE_PHASE) as Feature[]).filter((f) => isEnabled(f, phase));

  it("reads the release from 1 to 5, and shows everything otherwise", () => {
    expect(releasePhase("1")).toBe(1);
    for (const raw of [undefined, "", "0", "6", "x"]) expect(releasePhase(raw)).toBe(Infinity);
  });

  it("releases sign-up and approval alone in phase 1", () => {
    expect(shown(1)).toEqual(["onboarding"]);
  });

  it("keeps the public passport, English and automatic ID checks out of the MVP", () => {
    expect(shown(5)).toEqual(["onboarding", "batches", "transport", "plantFlow", "adminOverview"]);
    expect(shown(Infinity)).toEqual(Object.keys(FEATURE_PHASE));
  });
});
