import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt parameters from OWASP's Password Storage Cheat Sheet: N=2^15, r=8, p=3 (32 MiB, ~225 ms
// locally). The stronger N=2^17 option needs 128 MiB per hash, so four concurrent logins would
// exhaust a 512 MB free-tier instance. All OWASP options give equivalent resistance.
const LOG_N = 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

interface ScryptParams {
  logN: number;
  r: number;
  p: number;
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.logN;
  return new Promise((resolve, reject) => {
    // maxmem must exceed 128 * N * r bytes or Node refuses to run the hash.
    scrypt(password, salt, KEY_LENGTH, { N, r: params.r, p: params.p, maxmem: 256 * N * params.r }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// NFKC normalization so the same password typed on different keyboards/OSes hashes identically.
function normalize(password: string): string {
  return password.normalize("NFKC");
}

// Stored as "scrypt$logN$r$p$salt$hash" so the parameters travel with each hash and can be
// raised later without breaking existing users.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(normalize(password), salt, { logN: LOG_N, r: R, p: P });
  return ["scrypt", LOG_N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, logN, r, p, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !logN || !r || !p || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64");
  const actual = await deriveKey(normalize(password), Buffer.from(salt, "base64"), {
    logN: Number(logN),
    r: Number(r),
    p: Number(p),
  });
  // Constant-time comparison: how long it takes must not reveal how many bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used when a login names an email that has no account. Verifying against this dummy hash makes
// "no such user" take as long as "wrong password", so response timing cannot reveal which
// emails are registered. Computed once, on first use.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
