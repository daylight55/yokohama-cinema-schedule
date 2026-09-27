/** Only fixed categories leave the server; provider errors can contain PII. */
export function invitationFailureReason(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  // Use Cloudflare's documented codes, never an arbitrary provider-supplied value.
  const knownCodes = [
    "E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_SENDER_NOT_VERIFIED",
    "E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_SUPPRESSED",
    "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_CONTENT_TOO_LARGE", "E_DELIVERY_FAILED",
    "E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED", "E_INTERNAL_SERVER_ERROR",
  ];
  if (typeof code === "string" && knownCodes.includes(code)) return code;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/rate.?limit|too many|quota/.test(message)) return "rate_limited";
  if (/not verified|unverified|not authorized|unauthorized|not allowed/.test(message))
    return "not_authorized";
  if (/domain|dkim|spf/.test(message)) return "sender_domain";
  if (/recipient|destination|bounce|suppres/.test(message)) return "recipient_rejected";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (/constraint|d1_error|sqlite/.test(message)) return "database_error";
  return "unknown";
}
