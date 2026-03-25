/**
 * Logs a message only when NODE_ENV is not 'production'.
 * Use this for debug/development logs that contain PII (emails, tokens, request bodies).
 */
export function debugLog(...args: any[]): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
}
