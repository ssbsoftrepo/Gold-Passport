/**
 * What this build shows. Every feature belongs to the delivery phase that ships it (the MVP's
 * phases 1 to 5, docs/releases.md); features outside the MVP belong to LATER.
 *
 * A build for a release sets NEXT_PUBLIC_RELEASE_PHASE (1 to 5): features of that phase or
 * an earlier one show, the rest are hidden. Without it (development, demos, field trials)
 * everything shows. Hidden features keep their code and their server endpoints, so releasing the
 * next phase is a new build with a higher number.
 */
const LATER = 6;

export const FEATURE_PHASE = {
  /** Sign-in, role choice, sign-up forms and documents, PMD approval. */
  onboarding: 1,
  /** Miner: batches, extraction photos with GPS, weight and purity, lab report. */
  batches: 2,
  /** Partners, trips, pickup and delivery. */
  transport: 3,
  /** Plant receipt, lab check, payments; their back-office pages. */
  plantFlow: 4,
  /** Public Gold Passport page (later: a QR code on each batch). */
  publicPassport: LATER,
  /** English alongside Spanish. */
  english: LATER,
  /** Back-office overview counts and statistics. */
  adminOverview: 5,
  /** Automatic identity check results next to PMD's manual review. */
  automaticIdCheck: LATER,
} as const;

export type Feature = keyof typeof FEATURE_PHASE;

/** The release this build is for; Infinity (everything) when unset or not a number from 1 to 5. */
export function releasePhase(raw: string | undefined = process.env.NEXT_PUBLIC_RELEASE_PHASE): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : Infinity;
}

export function isEnabled(feature: Feature, phase: number = releasePhase()): boolean {
  return FEATURE_PHASE[feature] <= phase;
}
