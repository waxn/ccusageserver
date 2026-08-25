// WebCrypto helpers for end-to-end encryption. Parameters are chosen to match
// the agent's Node crypto exactly (PBKDF2-HMAC-SHA256, 200k iters, AES-256-GCM
// with a 12-byte IV and the 16-byte tag appended to the ciphertext), so blobs
// encrypted by either side decrypt on the other.

export const KDF_ITERATIONS = 200_000;
const VERIFY_TEXT = "ledger-verify";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// WebCrypto wants a BufferSource backed by a plain ArrayBuffer. slice() gives a
// fresh ArrayBuffer-backed copy, sidestepping the ArrayBufferLike/Shared typing.
function ab(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer as ArrayBuffer;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", ab(enc.encode(password)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: ab(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the key never leaves memory
    ["encrypt", "decrypt"],
  );
}

async function aesEncrypt(key: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(enc.encode(plaintext))),
  );
  return { nonce: b64encode(iv), ciphertext: b64encode(ct) };
}

export async function aesDecrypt(
  key: CryptoKey,
  nonceB64: string,
  ciphertextB64: string,
): Promise<string> {
  const iv = b64decode(nonceB64);
  const data = b64decode(ciphertextB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(data));
  return dec.decode(pt);
}

export interface CryptoSetupParams {
  salt: string;
  iterations: number;
  verifier_nonce: string;
  verifier_ct: string;
}

/** Create fresh KDF params + verifier for a new encryption password. */
export async function setupCrypto(
  password: string,
): Promise<{ params: CryptoSetupParams; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const v = await aesEncrypt(key, VERIFY_TEXT);
  return {
    key,
    params: {
      salt: b64encode(salt),
      iterations: KDF_ITERATIONS,
      verifier_nonce: v.nonce,
      verifier_ct: v.ciphertext,
    },
  };
}

/** Derive the key from a password + stored params, verifying correctness. */
export async function unlockCrypto(
  password: string,
  params: { salt: string; iterations: number; verifier_nonce: string; verifier_ct: string },
): Promise<CryptoKey> {
  const key = await deriveKey(password, b64decode(params.salt), params.iterations);
  let text: string;
  try {
    text = await aesDecrypt(key, params.verifier_nonce, params.verifier_ct);
  } catch {
    throw new Error("Incorrect encryption password.");
  }
  if (text !== VERIFY_TEXT) throw new Error("Incorrect encryption password.");
  return key;
}
