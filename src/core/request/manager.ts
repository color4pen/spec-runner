import * as store from "./store.js";

export async function list(
  cwd: string,
): Promise<Array<{ slug: string; type: string }>> {
  const slugs = await store.list(cwd);
  const results: Array<{ slug: string; type: string }> = [];
  for (const slug of slugs) {
    try {
      const parsed = await store.read(cwd, slug);
      results.push({ slug, type: parsed.type });
    } catch {
      // Skip slugs that can't be read
    }
  }
  return results;
}

