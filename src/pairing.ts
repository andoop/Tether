import crypto from "node:crypto";
import { nanoid } from "nanoid";

interface PinRecord {
  code: string;
  /** Host-side token (held only by the CLI process); never used for network auth. */
  token: string;
  expiresAt: number;
}

interface SourceState {
  fails: number;
  lockedUntil: number;
}

const PIN_TTL_MS = 10 * 60_000;
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60_000;
const DEFAULT_SOURCE = "default";

/**
 * Hardened pairing registry.
 * - 6-digit PIN generated with crypto.randomInt.
 * - claimByCode issues a BRAND-NEW durable device token (never reuses the PIN host token).
 * - Per-source failure counting; after MAX_FAILS the source is locked out (cooldown),
 *   during which even the correct code is rejected.
 */
export class PairingRegistry {
  private pins: PinRecord[] = [];
  private sources = new Map<string, SourceState>();

  createPin(): { code: string; token: string; expiresAt: number } {
    this.prune();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const token = `host_${nanoid(32)}`;
    const expiresAt = Date.now() + PIN_TTL_MS;
    this.pins.push({ code, token, expiresAt });
    return { code, token, expiresAt };
  }

  isLockedOut(sourceKey: string = DEFAULT_SOURCE): boolean {
    const state = this.sources.get(sourceKey);
    if (!state) return false;
    return state.fails >= MAX_FAILS && Date.now() < state.lockedUntil;
  }

  /**
   * Validate a pairing code for a given source. On success returns a fresh durable
   * device token string; on failure / lockout returns null.
   */
  claimByCode(code: string, sourceKey: string = DEFAULT_SOURCE): string | null {
    if (this.isLockedOut(sourceKey)) return null;
    this.prune();
    const idx = this.pins.findIndex((p) => p.code === code);
    if (idx === -1) {
      this.recordFailure(sourceKey);
      return null;
    }
    // one-time use: consume the pin and reset the source's failure state
    this.pins.splice(idx, 1);
    this.sources.delete(sourceKey);
    return `dev_${nanoid(40)}`;
  }

  clear(): void {
    this.pins = [];
    this.sources.clear();
  }

  private recordFailure(sourceKey: string): void {
    const state = this.sources.get(sourceKey) ?? { fails: 0, lockedUntil: 0 };
    state.fails += 1;
    if (state.fails >= MAX_FAILS) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    this.sources.set(sourceKey, state);
  }

  private prune(): void {
    const now = Date.now();
    this.pins = this.pins.filter((p) => p.expiresAt > now);
  }
}
