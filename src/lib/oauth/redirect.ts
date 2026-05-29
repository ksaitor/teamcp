// Validate an OAuth redirect URI. Allows https://, http://localhost (loopback
// dev), and native client custom schemes (e.g. claude://, cursor://, vscode://).
export function isValidRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;
  if (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  )
    return true;

  // Native app custom schemes: scheme://... (not http/https). Require a scheme
  // and reject obviously dangerous ones.
  const scheme = parsed.protocol.replace(/:$/, "");
  if (scheme && !["http", "javascript", "data", "file"].includes(scheme)) {
    return true;
  }

  return false;
}
