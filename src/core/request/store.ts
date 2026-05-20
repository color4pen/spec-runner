import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SpecRunnerError } from "../../errors.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import type { ParsedRequest } from "./types.js";

const ACTIVE_SUBDIR = path.join("specrunner", "requests", "active");
const MERGED_SUBDIR = path.join("specrunner", "requests", "merged");

export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, ACTIVE_SUBDIR, slug + ".md");
}

export async function list(cwd: string): Promise<string[]> {
  const activeDir = path.join(cwd, ACTIVE_SUBDIR);
  let entries: string[];
  try {
    entries = await fs.readdir(activeDir);
  } catch (err: unknown) {
    if (
      err instanceof Object &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
  return entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => e.slice(0, -3));
}

export async function read(cwd: string, slug: string): Promise<ParsedRequest> {
  const filePath = resolve(cwd, slug);
  const content = await fs.readFile(filePath, "utf-8");
  return parseRequestMdContent(content, filePath);
}

export async function write(cwd: string, slug: string, content: string): Promise<void> {
  const dir = path.join(cwd, ACTIVE_SUBDIR);
  await fs.mkdir(dir, { recursive: true });
  const filePath = resolve(cwd, slug);
  await fs.writeFile(filePath, content, "utf-8");
}

export async function checkSlugCollision(cwd: string, slug: string): Promise<void> {
  const dirs = [
    path.join(cwd, ACTIVE_SUBDIR),
    path.join(cwd, MERGED_SUBDIR),
  ];

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    if (entries.includes(slug + ".md")) {
      throw new SpecRunnerError(
        "SLUG_COLLISION",
        `Use a different description or pass --slug to specify a unique slug.`,
        `Slug '${slug}' already exists in ${path.relative(cwd, dir)}.`,
      );
    }
  }
}
