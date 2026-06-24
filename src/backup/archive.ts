/**
 * Backup archive encoding.
 *
 * A backup file is a small JSON envelope wrapping a {@link ConfigBundle}.
 * Two modes:
 *
 *   - INSTANCE_KEY (default): the bundle is stored as-is. It contains only
 *     at-rest ciphertext for secrets, so the file holds no plaintext, but
 *     restoring those secrets requires the same ENCRYPTION_KEY.
 *
 *   - PASSPHRASE: the bundle (built with plaintext secrets) is serialized and
 *     AES-256-GCM encrypted under a key derived from a user passphrase via
 *     scrypt. The file is fully self-contained and portable to an instance
 *     with a *different* ENCRYPTION_KEY. The passphrase is never stored.
 *
 * The envelope is independent of `src/lib/crypto.ts` (which is keyed on
 * ENCRYPTION_KEY) — it derives its own key from the passphrase.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";
import type { ConfigBundle } from "./bundle";

const MAGIC = "teamcp-backup";
const ALGORITHM = "aes-256-gcm";
// scrypt cost params — N=2^15 keeps key derivation ~50ms, well within a
// request while still being expensive to brute-force.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export type BackupMode = "INSTANCE_KEY" | "PASSPHRASE";

interface PlainEnvelope {
  magic: typeof MAGIC;
  mode: "INSTANCE_KEY";
  bundle: ConfigBundle;
}

interface SealedEnvelope {
  magic: typeof MAGIC;
  mode: "PASSPHRASE";
  kdf: { algo: "scrypt"; n: number; r: number; p: number; salt: string };
  iv: string;
  tag: string;
  ciphertext: string;
}

type Envelope = PlainEnvelope | SealedEnvelope;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt needs more memory than the default cap allows at this N.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
}

/** Serialize a bundle to a backup file (a JSON string). */
export function encodeBackup(
  bundle: ConfigBundle,
  passphrase?: string
): { data: string; mode: BackupMode } {
  if (!passphrase) {
    const env: PlainEnvelope = { magic: MAGIC, mode: "INSTANCE_KEY", bundle };
    return { data: JSON.stringify(env), mode: "INSTANCE_KEY" };
  }

  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(bundle), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const env: SealedEnvelope = {
    magic: MAGIC,
    mode: "PASSPHRASE",
    kdf: { algo: "scrypt", n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString("hex") },
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  return { data: JSON.stringify(env), mode: "PASSPHRASE" };
}

/**
 * Parse a backup file back into a bundle. `passphrase` is required iff the
 * file was sealed. Throws a friendly error on wrong/missing passphrase.
 */
export function decodeBackup(data: string, passphrase?: string): ConfigBundle {
  let env: Envelope;
  try {
    env = JSON.parse(data);
  } catch {
    throw new Error("Not a valid backup file (could not parse JSON).");
  }
  if (!env || env.magic !== MAGIC) {
    throw new Error("Not a recognized Teamcp backup file.");
  }

  if (env.mode === "INSTANCE_KEY") {
    return env.bundle;
  }

  if (env.mode === "PASSPHRASE") {
    if (!passphrase) {
      throw new Error("This backup is passphrase-protected. Enter the passphrase to restore.");
    }
    const salt = Buffer.from(env.kdf.salt, "hex");
    const key = scryptSync(passphrase, salt, KEY_LEN, {
      N: env.kdf.n,
      r: env.kdf.r,
      p: env.kdf.p,
      maxmem: 128 * env.kdf.n * env.kdf.r * 2,
    });
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(env.iv, "hex"));
    decipher.setAuthTag(Buffer.from(env.tag, "hex"));
    try {
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(env.ciphertext, "hex")),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8"));
    } catch {
      throw new Error("Incorrect passphrase, or the backup file is corrupted.");
    }
  }

  throw new Error("Unsupported backup mode.");
}

/** Whether a backup file requires a passphrase to decode. */
export function backupNeedsPassphrase(data: string): boolean {
  try {
    const env = JSON.parse(data);
    return env?.magic === MAGIC && env?.mode === "PASSPHRASE";
  } catch {
    return false;
  }
}
