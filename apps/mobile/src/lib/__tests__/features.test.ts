import { FEATURE_PHASE, isEnabled, releasePhase, type Feature } from "../features";

describe("releasePhase", () => {
  it("reads the release from 1 to 5", () => {
    expect(releasePhase("1")).toBe(1);
    expect(releasePhase("5")).toBe(5);
  });

  it("shows everything when unset or not a release number", () => {
    for (const raw of [undefined, "", "0", "6", "1.5", "phase1"]) expect(releasePhase(raw)).toBe(Infinity);
  });
});

describe("isEnabled", () => {
  const shown = (phase: number) => (Object.keys(FEATURE_PHASE) as Feature[]).filter((f) => isEnabled(f, phase));

  it("releases sign-up and approval alone in phase 1", () => {
    expect(shown(1)).toEqual(["onboarding"]);
  });

  it("adds each phase's features in order, and keeps the extras out of the MVP", () => {
    expect(shown(2)).toEqual(["onboarding", "batches"]);
    expect(shown(3)).toEqual(["onboarding", "batches", "transport"]);
    expect(shown(5)).toEqual(["onboarding", "batches", "transport", "plantFlow"]);
  });

  it("shows everything in development builds", () => {
    expect(shown(Infinity)).toEqual(Object.keys(FEATURE_PHASE));
  });
});
