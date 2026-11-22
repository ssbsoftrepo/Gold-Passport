/**
 * What a new PIN must look like (the backend checks the same in local mode; in Amazon Cognito mode
 * the pool only enforces a minimum length, so these rules are the check).
 */
export const PIN_LENGTH = 6;

/** 6 digits, not all the same and not a run like 123456 or 987654. */
export function isValidPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  let same = true;
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i++) {
    const step = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    same &&= step === 0;
    up &&= step === 1;
    down &&= step === -1;
  }
  return !(same || up || down);
}

/** Client-side check before sending a new PIN; returns an error with a translatable `code`, or null. */
export function checkNewPin(pin: string, confirmation: string): { code: string } | null {
  if (!isValidPin(pin)) return { code: "PIN_NOT_ALLOWED" };
  if (pin !== confirmation) return { code: "PIN_MISMATCH" };
  return null;
}
