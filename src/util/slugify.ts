/**
 * slugify: Convert a description string to a kebab-case slug.
 * Used for deriving request slugs from natural-language descriptions.
 */

/**
 * Convert a description string to a kebab-case slug.
 *
 * Rules:
 * - Consecutive non-ASCII characters are replaced with a space (word boundary)
 * - Non-alphanumeric characters are replaced with hyphens
 * - Consecutive hyphens are collapsed to one
 * - Leading and trailing hyphens are removed
 * - Truncated to maxLength characters (no trailing hyphen after truncation)
 * - Returns "untitled" if the result is empty
 */
export function slugify(description: string, maxLength = 50): string {
  // Replace consecutive non-ASCII characters (Japanese, Chinese, etc.) with a space (word boundary)
  let slug = description.replace(/[^\x00-\x7F]+/g, " ");

  // Convert to lowercase
  slug = slug.toLowerCase();

  // Replace non-alphanumeric characters with hyphens
  slug = slug.replace(/[^a-z0-9]+/g, "-");

  // Remove leading and trailing hyphens
  slug = slug.replace(/^-+|-+$/g, "");

  // Truncate to maxLength
  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    // Remove trailing hyphen after truncation
    slug = slug.replace(/-+$/, "");
  }

  return slug.length > 0 ? slug : "untitled";
}

