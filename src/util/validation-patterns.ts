/** Slug format: lowercase alphanumeric + hyphens, 1-64 chars, must start with alphanumeric. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Base branch format: alphanumeric, dots, underscores, slashes, hyphens. No leading dash. */
export const BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;
