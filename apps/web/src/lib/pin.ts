/**
 * What a new PIN or password must look like. The backend checks the same in local mode; in Amazon
 * Cognito mode the pool only enforces a minimum length, so these rules are the check.
 */
export const PIN_LENGTH = 6;

/** PMD staff can approve people and see everyone's documents: they use a longer password. */
export const STAFF_PASSWORD_MIN_LENGTH = 10;

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

export function isValidStaffPassword(password: string): boolean {
  return password.trim().length > 0 && password.length >= STAFF_PASSWORD_MIN_LENGTH;
}

/**
 * Client-side check of a new secret typed twice; returns an error with a translatable `code`, or
 * null. Staff choose a password, everyone else a PIN.
 */
export function checkNewSecret(secret: string, confirmation: string, staff: boolean): { code: string } | null {
  if (staff ? !isValidStaffPassword(secret) : !isValidPin(secret)) {
    return { code: staff ? "PASSWORD_TOO_SHORT" : "PIN_NOT_ALLOWED" };
  }
  if (secret !== confirmation) return { code: "PIN_MISMATCH" };
  return null;
}
