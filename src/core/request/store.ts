import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SpecRunnerError } from "../../errors.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import type { ParsedRequest } from "./types.js";

const DRAFTS_SUBDIR = path.join("specrunner", "drafts");
const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive");

export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, DRAFTS_SUBDIR, slug + ".md");
}

export async function list(cwd: string): Promise<string[]> {
  const draftsDir = path.join(cwd, DRAFTS_SUBDIR);
  let entries: string[];
  try {
    entries = await fs.readdir(draftsDir);
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
  const dir = path.join(cwd, DRAFTS_SUBDIR);
  await fs.mkdir(dir, { recursive: true });
  const filePath = resolve(cwd, slug);
  await fs.writeFile(filePath, content, "utf-8");
}

export async function checkSlugCollision(cwd: string, slug: string): Promise<void> {
  // Check 1: drafts/ (flat .md files)
  const draftsDir = path.join(cwd, DRAFTS_SUBDIR);
  try {
    const entries = await fs.readdir(draftsDir);
    if (entries.includes(slug + ".md")) {
      throw new SpecRunnerError(
        "SLUG_COLLISION",
        `Use a different description or pass --slug to specify a unique slug.`,
        `Slug '${slug}' already exists in ${path.relative(cwd, draftsDir)}.`,
      );
    }
  } catch (err) {
    if (err instanceof SpecRunnerError) throw err;
    // ENOENT: dir doesn't exist yet, not a collision
  }

  // Check 2: changes/archive/ (directory per slug — 151+ entries)
  const archiveDir = path.join(cwd, ARCHIVE_SUBDIR);
  try {
    const entries = await fs.readdir(archiveDir);
    if (entries.includes(slug)) {
      // Check it's actually a directory
      const stat = await fs.stat(path.join(archiveDir, slug));
      if (stat.isDirectory()) {
        throw new SpecRunnerError(
          "SLUG_COLLISION",
          `Use a different description or pass --slug to specify a unique slug.`,
          `Slug '${slug}' already exists in ${path.relative(cwd, archiveDir)}.`,
        );
      }
    }
  } catch (err) {
    if (err instanceof SpecRunnerError) throw err;
  }
}
