// Pure utility functions for bootstrap logic — no server actions here

export type BootstrapStatus = 'uninitialized' | 'bootstrapping' | 'pr_pending' | 'ready';

// Allowed state transitions for bootstrap_status
export const ALLOWED_BOOTSTRAP_TRANSITIONS: Record<BootstrapStatus, BootstrapStatus[]> = {
  uninitialized: ['bootstrapping'],
  bootstrapping: ['pr_pending', 'uninitialized'],
  pr_pending: ['ready', 'uninitialized'],
  ready: [],
};

// Non-anchored: used for extraction from free text
const PR_URL_REGEX = /https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+/;

// Anchored: used for strict validation of a full URL string
const PR_URL_STRICT_REGEX = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;

/**
 * Validate if a bootstrap status transition is allowed.
 * Pure function — no DB access.
 */
export function validateBootstrapTransition(
  currentStatus: BootstrapStatus,
  newStatus: BootstrapStatus
): boolean {
  const allowed = ALLOWED_BOOTSTRAP_TRANSITIONS[currentStatus];
  return allowed.includes(newStatus);
}

/**
 * Extract PR URL from session event text.
 * Returns null if not found.
 */
export function extractPrUrl(text: string): string | null {
  const match = text.match(PR_URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Validate PR URL format: https://github.com/{owner}/{repo}/pull/{number}
 * Uses anchored regex to reject URLs with extra prefixes or suffixes.
 */
export function isValidPrUrl(url: string): boolean {
  return PR_URL_STRICT_REGEX.test(url);
}
