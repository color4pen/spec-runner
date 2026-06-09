import * as store from "./store.js";
import * as generator from "./generator.js";
import type { OneShotQueryClient } from "../port/one-shot-query-client.js";

export async function create(
  text: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<string> {
  const result = await generator.generate(text, cwd, client);
  return result.slug;
}

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

export function resolve(cwd: string, slug: string): string {
  return store.resolveWithFallback(cwd, slug);
}
