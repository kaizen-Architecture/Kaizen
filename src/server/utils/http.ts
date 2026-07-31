import { logger } from '../../utils/logging';

/**
 * Safely parses JSON from a fetch Response object.
 * If the response body is HTML or invalid JSON, it throws an informative error
 * instead of unhandled SyntaxError: Unexpected token < in JSON at position 0.
 */
export async function safeJsonParse<T = any>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text || !text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const cleanSnippet = text.replace(/\s+/g, ' ').slice(0, 120);
    logger.error(`[HTTP] JSON parse error from URL (${response.url}) [HTTP ${response.status}]: ${cleanSnippet}`);
    throw new Error(
      `Invalid JSON response from server (HTTP ${response.status}): ${cleanSnippet}`
    );
  }
}
