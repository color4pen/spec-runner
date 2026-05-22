import * as fs from "node:fs";
import * as path from "node:path";
import * as fsAsync from "node:fs/promises";
import * as store from "./store.js";
import * as generator from "./generator.js";
import * as reviewer from "./reviewer.js";
import type { OneShotQueryClient } from "../port/one-shot-query-client.js";
import type { RequestReviewResult } from "./reviewer.js";

export async function create(
  text: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<string> {
  const result = await generator.generate(text, cwd, client);
  return result.slug;
}

export async function review(
  slugOrPath: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<RequestReviewResult> {
  let filePath: string;
  if (fs.existsSync(path.resolve(cwd, slugOrPath))) {
    filePath = path.resolve(cwd, slugOrPath);
  } else {
    filePath = store.resolve(cwd, slugOrPath);
  }
  const content = await fsAsync.readFile(filePath, "utf-8");
  return reviewer.runReview(content, cwd, client);
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
  return store.resolve(cwd, slug);
}
