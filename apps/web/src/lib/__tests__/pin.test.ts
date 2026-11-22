import { describe, expect, it } from "vitest";
import { checkNewSecret, isValidPin, isValidStaffPassword } from "../pin";

describe("PIN rules", () => {
  it.each(["135790", "246813", "902741", "112233"])("accepts %s", (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });

  it.each(["000000", "777777", "123456", "456789", "987654", "12345", "1234567", "12a456", ""])("refuses %s", (pin) => {
    expect(isValidPin(pin)).toBe(false);
  });

  it("asks PMD staff for 10 or more characters", () => {
    expect(isValidStaffPassword("pmd-demo-2026")).toBe(true);
    expect(isValidStaffPassword("short-pw")).toBe(false);
    expect(isValidStaffPassword("          ")).toBe(false);
  });

  it("checks a new secret and its confirmation", () => {
    expect(checkNewSecret("135790", "135790", false)).toBeNull();
    expect(checkNewSecret("123456", "123456", false)).toEqual({ code: "PIN_NOT_ALLOWED" });
    expect(checkNewSecret("135790", "135791", false)).toEqual({ code: "PIN_MISMATCH" });
    expect(checkNewSecret("135790", "135790", true)).toEqual({ code: "PASSWORD_TOO_SHORT" });
    expect(checkNewSecret("a long staff phrase", "a long staff phrase", true)).toBeNull();
  });
});
