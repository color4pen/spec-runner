import * as fs from "node:fs";
import * as fsAsync from "node:fs/promises";
import * as path from "node:path";
import { SpecRunnerError } from "../../errors.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import type { ParsedRequest } from "./types.js";
import { parseArchiveDirName, archivedChangesDirRel } from "../../util/paths.js";

const DRAFTS_SUBDIR = path.join("specrunner", "drafts");
const ARCHIVE_SUBDIR = archivedChangesDirRel();

/**
 * Returns the new-format path for a draft request.
 * Example: resolve(cwd, "my-feature") → "<cwd>/specrunner/drafts/my-feature/request.md"
 */
export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, DRAFTS_SUBDIR, slug, "request.md");
}

/**
 * Returns the path for a draft request, preferring the new directory format
 * and falling back to the legacy flat-file format.
 * If neither exists, returns the new-format path (for error messages).
 */
export function resolveWithFallback(cwd: string, slug: string): string {
  const newPath = path.join(cwd, DRAFTS_SUBDIR, slug, "request.md");
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(cwd, DRAFTS_SUBDIR, slug + ".md");
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath; // default to new format
}

export async function list(cwd: string): Promise<string[]> {
  const draftsDir = path.join(cwd, DRAFTS_SUBDIR);
  let entries: fs.Dirent[];
  try {
    entries = await fsAsync.readdir(draftsDir, { withFileTypes: true });
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

  const slugs = new Set<string>();

  // New format: directories containing request.md
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        await fsAsync.access(path.join(draftsDir, entry.name, "request.md"));
        slugs.add(entry.name);
      } catch {
        // no request.md in this directory — skip
      }
    }
  }

  // Legacy format: flat .md files (only if no directory with that slug already found)
  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name.endsWith(".md")) {
      const slug = entry.name.slice(0, -3);
      if (!slugs.has(slug)) {
        slugs.add(slug);
      }
    }
  }

  return [...slugs];
}

export async function read(cwd: string, slug: string): Promise<ParsedRequest> {
  const filePath = resolveWithFallback(cwd, slug);
  const content = await fsAsync.readFile(filePath, "utf-8");
  return parseRequestMdContent(content, filePath);
}

export async function write(cwd: string, slug: string, content: string): Promise<void> {
  const slugDir = path.join(cwd, DRAFTS_SUBDIR, slug);
  await fsAsync.mkdir(slugDir, { recursive: true });
  const filePath = path.join(slugDir, "request.md");
  await fsAsync.writeFile(filePath, content, "utf-8");
}

export async function checkSlugCollision(cwd: string, slug: string): Promise<void> {
  // Check 1: drafts/ (directory with request.md OR flat .md file)
  const draftsDir = path.join(cwd, DRAFTS_SUBDIR);
  try {
    const entries = await fsAsync.readdir(draftsDir);
    // New format: directory
    if (entries.includes(slug)) {
      const stat = await fsAsync.stat(path.join(draftsDir, slug));
      if (stat.isDirectory()) {
        throw new SpecRunnerError(
          "SLUG_COLLISION",
          `Use a different description or pass --slug to specify a unique slug.`,
          `Slug '${slug}' already exists in ${path.relative(cwd, draftsDir)}.`,
        );
      }
    }
    // Legacy format: flat file
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
  // Supports both dated (YYYY-MM-DD-<slug>) and legacy (plain <slug>) dir names.
  const archiveDir = path.join(cwd, ARCHIVE_SUBDIR);
  try {
    const entries = await fsAsync.readdir(archiveDir);
    const match = entries.find((e) => parseArchiveDirName(e).slug === slug);
    if (match) {
      // Check it's actually a directory
      const stat = await fsAsync.stat(path.join(archiveDir, match));
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
