import { describe, it, expect } from "vitest";
import { PairingRegistry } from "../src/pairing.js";

describe("PairingRegistry (TC2/TC16)", () => {
  it("createPin issues a 6-digit numeric code", () => {
    const reg = new PairingRegistry();
    const { code, token, expiresAt } = reg.createPin();
    expect(code).toMatch(/^\d{6}$/);
    expect(typeof token).toBe("string");
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("claimByCode issues a fresh durable dev_ token on success", () => {
    const reg = new PairingRegistry();
    const { code, token: hostToken } = reg.createPin();
    const devToken = reg.claimByCode(code);
    expect(devToken).toBeTruthy();
    expect(devToken!.startsWith("dev_")).toBe(true);
    // never reuses the host PIN token
    expect(devToken).not.toBe(hostToken);
  });

  it("a pin is one-time use", () => {
    const reg = new PairingRegistry();
    const { code } = reg.createPin();
    expect(reg.claimByCode(code)).toBeTruthy();
    expect(reg.claimByCode(code)).toBeNull();
  });

  it("wrong code returns null", () => {
    const reg = new PairingRegistry();
    reg.createPin();
    expect(reg.claimByCode("000000", "src-a")).toBeNull();
  });

  it("per-source lockout after 5 fails rejects even the correct code", () => {
    const reg = new PairingRegistry();
    const { code } = reg.createPin();
    const source = "192.0.2.1";
    for (let i = 0; i < 5; i += 1) {
      expect(reg.claimByCode("999999", source)).toBeNull();
    }
    expect(reg.isLockedOut(source)).toBe(true);
    // even the genuinely correct code is rejected while locked out
    expect(reg.claimByCode(code, source)).toBeNull();
  });

  it("lockout is per-source: another source can still pair", () => {
    const reg = new PairingRegistry();
    const { code } = reg.createPin();
    const bad = "10.0.0.9";
    for (let i = 0; i < 5; i += 1) reg.claimByCode("999999", bad);
    expect(reg.isLockedOut(bad)).toBe(true);
    expect(reg.isLockedOut("10.0.0.10")).toBe(false);
    expect(reg.claimByCode(code, "10.0.0.10")).toBeTruthy();
  });
});
