import { base64urlSha256 } from "@/lib/crypto";

// Verify a PKCE code_verifier against a stored S256 code_challenge.
// We only support S256 (plain is rejected at the authorize endpoint).
export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string
): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  return base64urlSha256(codeVerifier) === codeChallenge;
}
