import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * PIN hashing helpers used by the VTC room private-PIN flow.
 *
 * Format on disk: `scrypt$N$r$p$saltB64$hashB64`
 *   N  : scrypt cost parameter (power of two; 16384 ≈ Node default)
 *   r  : block size (8 — Node default)
 *   p  : parallelism (1 — single-threaded; avoids resource contention on serverless)
 *   saltB64 : 16-byte random salt (base64)
 *   hashB64 : 64-byte derived key (base64)
 *
 * Uses only Node's built-in `crypto` module — no new dependency.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashPin(pin: string): string {
    if (typeof pin !== "string" || pin.length < 4 || pin.length > 32) {
        throw new Error("[pin-hash] PIN must be a 4-32 character string.");
    }
    const salt = randomBytes(SALT_LEN);
    const derived = scryptSync(pin.normalize("NFKC"), salt, KEY_LEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
    if (typeof pin !== "string" || typeof stored !== "string") return false;
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const n = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = safeFromB64(parts[4]);
    const expected = safeFromB64(parts[5]);
    if (!salt || !expected || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
        return false;
    }
    let derived;
    try {
        derived = scryptSync(pin.normalize("NFKC"), salt, expected.length, { N: n, r, p });
    } catch {
        return false;
    }
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
}

function safeFromB64(s: string): Buffer | null {
    try {
        const buf = Buffer.from(s, "base64");
        // Re-encode and compare to reject garbage that survives base64 decode.
        if (buf.toString("base64").replace(/=+$/, "") !== s.replace(/=+$/, "")) {
            return null;
        }
        return buf;
    } catch {
        return null;
    }
}