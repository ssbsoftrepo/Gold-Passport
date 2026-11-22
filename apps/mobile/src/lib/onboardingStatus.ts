import type { Schemas } from "./api";

type OnboardingStatus = Schemas["OnboardingStatus"];

/** Every status an application can have. The check below fails to compile if the API adds one. */
export const ONBOARDING_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "CORRECTIONS_REQUESTED",
  "APPROVED",
  "REJECTED",
] as const satisfies readonly OnboardingStatus[];

type Unlisted = Exclude<OnboardingStatus, (typeof ONBOARDING_STATUSES)[number]>;
const allListed: [Unlisted] extends [never] ? true : never = true;
void allListed;

/** The status tag shown for an application; each value has a `status.*` text. */
export function onboardingTag(status: OnboardingStatus): string {
  switch (status) {
    case "SUBMITTED":
      return "PENDING_REVIEW";
    case "CORRECTIONS_REQUESTED":
      return "CLARIFICATION_REQUESTED";
    default:
      return status;
  }
}
