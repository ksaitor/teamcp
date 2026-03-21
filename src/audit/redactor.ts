/**
 * Redact sensitive patterns from data before storing in audit logs.
 */

const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /(?:api[_-]?key|token|secret|password|auth|bearer)\s*[:=]\s*["']?([^\s"',}]+)/gi,
  // AWS keys
  /AKIA[A-Z0-9]{16}/g,
  // Generic long hex strings that look like secrets (32+ chars)
  /(?:sk|pk|key|secret|token)[-_][a-zA-Z0-9_-]{20,}/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  // SSN
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Email-like passwords in connection strings
  /(?<=:\/\/[^:]+:)[^@]+(?=@)/g,
];

export function redactSecrets(data: any): any {
  if (typeof data === "string") {
    let result = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact values of sensitive-looking keys
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key") ||
        lowerKey.includes("credential")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }

  return data;
}
