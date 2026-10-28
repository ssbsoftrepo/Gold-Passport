import { describe, expect, it } from "vitest";
import { formatCoords, formatMoney, formatNumber, mapsUrl, shortHash, statusTone } from "../format";

describe("format", () => {
  it("shows a dash for missing values", () => {
    expect(formatNumber(null, "es")).toBe("—");
    expect(formatMoney(100, null, "es")).toBe("—");
    expect(shortHash(undefined)).toBe("—");
  });

  it("formats numbers the Peruvian way in Spanish", () => {
    expect(formatNumber(1234.567, "es")).toBe("1,234.57");
    expect(formatNumber(92.5, "en", 1)).toBe("92.5");
  });

  it("formats money with its currency", () => {
    expect(formatMoney(12500.5, "PEN", "es")).toMatch(/S\/\s?12,500\.50/);
    expect(formatMoney(100, "USD", "en")).toBe("US$100.00");
  });

  it("shortens hashes and coordinates for display", () => {
    expect(shortHash("0123456789abcdef0123456789abcdef")).toBe("01234567…abcdef");
    expect(formatCoords(-14.831234567, -70.1)).toBe("-14.83123, -70.10000");
    expect(mapsUrl(-14.8, -70.1)).toBe("https://www.openstreetmap.org/?mlat=-14.8&mlon=-70.1#map=15/-14.8/-70.1");
  });

  it.each([
    ["LAB_APPROVED", "good"],
    ["PAID", "good"],
    ["LAB_DISCREPANCY", "bad"],
    ["REJECTED", "bad"],
    ["SETTLED", "gold"],
    ["PENDING_REVIEW", "wait"],
    ["MINER_ACCEPTED", "wait"],
    ["IN_TRANSIT", "neutral"],
  ])("tones %s as %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});
