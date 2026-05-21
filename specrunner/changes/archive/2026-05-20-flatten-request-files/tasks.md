# Tasks: flatten-request-files

## Task 1: store.ts の path 解決ロジックを flat 化

**ファイル**: `src/core/request/store.ts`

### 1.1 `resolve()` を flat path に変更

```typescript
// Before
export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, ACTIVE_SUBDIR, slug, "request.md");
}

// After
export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, ACTIVE_SUBDIR, slug + ".md");
}
```

### 1.2 `list()` を `.md` ファイル列挙に変更

```typescript
// Before: readdir → entry dir 内の request.md 存在チェック
// After: readdir → *.md ファイルを列挙し、拡張子 strip して slug 返却

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
```

### 1.3 `write()` を flat ファイル書き込みに変更

```typescript
// Before: mkdir(slug/) → writeFile(slug/request.md)
// After: mkdir(ACTIVE_SUBDIR) → writeFile(slug.md)

export async function write(cwd: string, slug: string, content: string): Promise<void> {
  const dir = path.join(cwd, ACTIVE_SUBDIR);
  await fs.mkdir(dir, { recursive: true });
  const filePath = resolve(cwd, slug);
  await fs.writeFile(filePath, content, "utf-8");
}
```

### 1.4 `checkSlugCollision()` を `.md` ファイル存在チェックに変更

```typescript
// Before: entries.includes(slug)
// After: entries.includes(slug + ".md")

// 各 dir の readdir 結果に対して:
if (entries.includes(slug + ".md")) {
  throw new SpecRunnerError(
    "SLUG_COLLISION",
    `Use a different description or pass --slug to specify a unique slug.`,
    `Slug '${slug}' already exists in ${path.relative(cwd, dir)}.`,
  );
}
```

**検証**: `bun run typecheck`

- [x] 完了

---

## Task 2: CANONICAL_PATTERN 正規表現を flat 形式に更新

**ファイル**: `src/core/command/pipeline-run.ts`

```typescript
// Before (line 23)
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/;

// After
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\.md$/;
```

コメント (line 22) も更新:
```typescript
// Before: // Canonical path pattern: specrunner/requests/active/<slug>/request.md
// After:  // Canonical path pattern: specrunner/requests/active/<slug>.md
```

line 50-51 のコメントも更新:
```typescript
// Before: // Canonical pattern: specrunner/requests/active/<slug>/request.md
// After:  // Canonical pattern: specrunner/requests/active/<slug>.md
```

**検証**: `bun run typecheck`

- [x] 完了

---

## Task 3: CLI コマンドを flat 形式に対応

### 3.1 `request-new.ts` の出力メッセージ更新

**ファイル**: `src/core/command/request-new.ts`

```typescript
// Before (line 52)
const relPath = path.join("specrunner", "requests", "active", slug, "request.md");

// After
const relPath = path.join("specrunner", "requests", "active", slug + ".md");
```

コメント (line 4-5, 15) も更新:
- `in specrunner/requests/active/<slug>/` → `at specrunner/requests/active/<slug>.md`
- `Creates specrunner/requests/active/<slug>/request.md` → `Creates specrunner/requests/active/<slug>.md`

### 3.2 `request-rm.ts` を dir 削除からファイル削除に変更

**ファイル**: `src/core/command/request-rm.ts`

```typescript
// Before: dir 存在チェック + fs.rm(dir, { recursive: true })
// After: ファイル存在チェック + fs.unlink(filePath)

export async function executeRm(slug: string, cwd: string): Promise<number> {
  if (!SLUG_REGEX.test(slug)) {
    process.stderr.write(
      `Error: Invalid slug '${slug}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
    );
    return 2;
  }

  const filePath = path.join(cwd, ACTIVE_SUBDIR, slug + ".md");
  try {
    await fs.access(filePath);
  } catch {
    process.stderr.write(`Request not found: ${slug}\n`);
    return 1;
  }

  await fs.unlink(filePath);
  process.stderr.write(`Removed: specrunner/requests/active/${slug}.md\n`);
  return 0;
}
```

コメント (line 2-4, 14) も更新:
- `Removes specrunner/requests/active/<slug>/ directory recursively` → `Removes specrunner/requests/active/<slug>.md`
- `Deletes specrunner/requests/active/<slug>/ recursively` → `Deletes specrunner/requests/active/<slug>.md`

### 3.3 `request-show.ts` のコメント更新

**ファイル**: `src/core/command/request-show.ts`

`resolve()` 経由で path が自動的に flat になるため実装変更不要。コメントのみ更新:
- line 4: `specrunner/requests/active/<slug>/request.md` → `specrunner/requests/active/<slug>.md`
- line 13: 同上

**検証**: `bun run typecheck`

- [x] 完了

---

## Task 4: finish 系を flat ファイル操作に変更

### 4.1 `move-requests-dir.ts` をファイル単位 mv に変更

**ファイル**: `src/core/finish/move-requests-dir.ts`

```typescript
// Before
const activePath = path.join("specrunner", "requests", "active", slug);
const mergedPath = path.join("specrunner", "requests", "merged", slug);

// After
const activePath = path.join("specrunner", "requests", "active", slug + ".md");
const mergedPath = path.join("specrunner", "requests", "merged", slug + ".md");
```

idempotent check (`activeExists` / `mergedExists`) は `.md` ファイルの存在チェックになる (path が変わるだけで fs.exists ロジックは同じ)。

コメント・message 文字列も更新:
- `Move active/<slug> to merged/<slug>` → `Move active/<slug>.md to merged/<slug>.md`
- `git mv active/<slug> → merged/<slug>` → `git mv active/<slug>.md → merged/<slug>.md`
- `Moved active/${slug} to merged/${slug}` → `Moved active/${slug}.md to merged/${slug}.md`
- `requests dir already moved to merged/${slug}` → `request file already moved to merged/${slug}.md`

### 4.2 `resolve-target.ts` の auto-detect をファイル列挙に変更

**ファイル**: `src/core/finish/resolve-target.ts`

`resolveByAutoDetect()` (lines 163-211):

```typescript
// Before (lines 179-180)
const dirents = await readdir(activeDir, { withFileTypes: true });
entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

// After
const dirents = await readdir(activeDir, { withFileTypes: true });
entries = dirents
  .filter((d) => d.isFile() && d.name.endsWith(".md"))
  .map((d) => d.name.slice(0, -3));
```

`detectSlugFromCwd()` (lines 216-220): cwd が `active/<slug>/` 配下にいるケースの検出。flat 化後は `active/<slug>/` dir は存在しないため、この pattern は基本的に使われなくなるが、互換性のため残す（harm なし）。

**検証**: `bun run typecheck`

- [x] 完了

---

## Task 5: migration 関数の実装

**ファイル**: `src/core/command/request-migrate-flat.ts` (新規)

```typescript
/**
 * Migration: dir形式 → flat形式
 *
 * specrunner/requests/{active,merged}/<slug>/request.md
 * → specrunner/requests/{active,merged}/<slug>.md
 *
 * Extra files がある dir は request.md だけ move し、dir は残す (partial migration)。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface MigrateResult {
  migrated: string[];
  partial: string[];
  skipped: string[];
}

export async function migrateRequestsFlat(cwd: string): Promise<MigrateResult> {
  const result: MigrateResult = { migrated: [], partial: [], skipped: [] };

  for (const subdir of ["active", "merged"]) {
    const dir = path.join(cwd, "specrunner", "requests", subdir);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stat = await fs.stat(entryPath);
      if (!stat.isDirectory()) continue;

      const requestMdPath = path.join(entryPath, "request.md");
      try {
        await fs.access(requestMdPath);
      } catch {
        result.skipped.push(`${subdir}/${entry}`);
        continue;
      }

      // Read request.md content
      const content = await fs.readFile(requestMdPath, "utf-8");

      // Write flat file
      const flatPath = path.join(dir, entry + ".md");
      await fs.writeFile(flatPath, content, "utf-8");

      // Remove request.md from dir
      await fs.unlink(requestMdPath);

      // Check for extra files
      const remaining = await fs.readdir(entryPath);
      if (remaining.length === 0) {
        await fs.rmdir(entryPath);
        result.migrated.push(`${subdir}/${entry}`);
      } else {
        result.partial.push(`${subdir}/${entry}`);
        // Log warning: partial migration
      }
    }
  }

  return result;
}
```

**検証**: `bun run typecheck`

- [x] 完了

---

## Task 6: テスト更新

### 6.1 `tests/unit/core/request/store.test.ts` を flat 形式に更新

全 TC を flat path 前提に書き換え:

- **TC-ST-001**: `resolve()` の expected path を `active/<slug>.md` に
- **TC-ST-002**: `list()` のセットアップを `<slug>.md` ファイル作成に変更、`no-request-md` dir の代わりに `.txt` ファイル等を配置して filter テスト
- **TC-ST-004**: `write()` の expected path を flat ファイルに
- **TC-ST-005/006**: `checkSlugCollision()` のセットアップを `<slug>.md` ファイル作成に

### 6.2 `tests/unit/core/command/request-new.test.ts` を flat 形式に更新

- **TC-NEW-001**: expected path を `active/my-feature.md` に、stderr 出力の期待値も更新
- **TC-NEW-002**: collision 用の setup を `.md` ファイル作成に
- **TC-NEW-005/006**: expected path を flat に

### 6.3 `tests/unit/core/command/request-rm.test.ts` を flat 形式に更新

- **TC-RM-001**: `createRequest()` を flat ファイル作成に変更、削除後のチェックをファイル存在チェックに、stderr 出力の期待値を `.md` に
- **TC-RM-002**: 変更なし (ファイルが存在しないケース)
- **TC-RM-005**: `createRequest()` を flat に

### 6.4 `tests/finish-move-requests-dir.test.ts` を flat 形式に更新

- **TC-027**: `git mv` の args 検証を `active/my-feature.md` / `merged/my-feature.md` に
- **TC-028**: `fs.exists` の path 検証を `.md` ファイルに
- **TC-063**: commit message はそのまま (`chore: archive <slug>`)

### 6.5 `tests/unit/core/command/request-migrate-flat.test.ts` (新規)

migration 関数のテスト:
- 正常 migration: dir 形式 → flat 形式変換 + 空 dir 削除
- partial migration: extra files がある dir は request.md だけ move、dir は残す
- request.md がない dir はスキップ
- active/ / merged/ が存在しない場合はスキップ

**検証**: `bun run test`

- [x] 完了

---

## Task 7: delta spec の作成

**ファイル**: `specrunner/changes/flatten-request-files/specs/cli-commands/delta.md` (新規)

以下の Requirement を flat 形式に更新する delta:

### Requirement 更新: `request new`

- path 表記: `specrunner/requests/active/<slug>/request.md` → `specrunner/requests/active/<slug>.md`
- Scenario の THEN 句: path + stderr 出力を flat 形式に

### Requirement 更新: `request show`

- path 表記: `specrunner/requests/active/<slug>/request.md` → `specrunner/requests/active/<slug>.md`
- Scenario の THEN 句: `active 配下に my-feature/request.md が存在する` → `active 配下に my-feature.md が存在する`

### Requirement 更新: `request rm`

- 削除対象: `specrunner/requests/active/<slug>/` ディレクトリ再帰削除 → `specrunner/requests/active/<slug>.md` ファイル削除
- Scenario の THEN 句: `ディレクトリが削除され` → `ファイルが削除され`
- Scenario の WHEN 句: `active 配下に my-feature/ が存在する` → `active 配下に my-feature.md が存在する`

**検証**: delta spec の format が正しいこと

- [x] 完了 (spec.md として既存)

---

## Task 8: ADR 作成

**ファイル**: `docs/adr/flatten-request-files.md` (新規)

記録する判断:

1. **flat 化の判断**: requests/ 配下は文書 1 個で dir 構造が冗長。flat 化により操作が軽量に
2. **changes/ 側を固定名 `request.md` で維持する判断**: artifact 集合の semantic を保持
3. **migration 方針**: extra files がある dir は partial migration (request.md だけ move、dir は残す)
4. **worktree setup のファイル名変換**: `<slug>.md` → `request.md` のコピー時変換ロジック

- [x] 完了

---

## Task 9: migration の実行

migration 関数を使って既存の dir 形式 request を flat 形式に変換する。

対象:
- `specrunner/requests/active/` 配下の全 dir
- `specrunner/requests/merged/` 配下の全 dir

実行後、`agent-tool-constraints-research` のような extra files を持つ dir は partial migration として残る。

**検証**: `bun run typecheck && bun run test` が green

- [x] 完了

---

## 実行順序

```
Task 1 (store.ts) → Task 2 (CANONICAL_PATTERN) → Task 3 (CLI commands)
                  → Task 4 (finish)
                  → Task 5 (migration)
→ Task 6 (tests) — Task 1-5 完了後にまとめて
→ Task 7 (delta spec)
→ Task 8 (ADR)
→ Task 9 (migration 実行)
→ 最終検証: bun run typecheck && bun run test
```
