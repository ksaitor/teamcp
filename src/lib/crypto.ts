import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertext] = encoded.split(":");

  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Hex SHA-256 — used to hash opaque secrets (access/refresh tokens, auth codes)
// before storing them at rest.
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Base64url SHA-256 — used to verify PKCE S256 challenges
// (BASE64URL(SHA256(code_verifier)) === code_challenge).
export function base64urlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
