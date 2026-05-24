# Tasks: request をフラットファイルからディレクトリ構造に変更

## Task 1: paths.ts のパス関数を更新 [x]

**ファイル**: `src/util/paths.ts`

### 1-1: `draftPath()` を新形式に変更

```typescript
// Before
export function draftPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}.md`;
}

// After
export function draftPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}/request.md`;
}
```

## Task 2: store.ts の 5 関数 + resolveWithFallback を更新 [x]

**ファイル**: `src/core/request/store.ts`

### 2-1: `resolve()` を新形式に変更

```typescript
// Before
export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, DRAFTS_SUBDIR, slug + ".md");
}

// After
export function resolve(cwd: string, slug: string): string {
  return path.join(cwd, DRAFTS_SUBDIR, slug, "request.md");
}
```

### 2-2: `resolveWithFallback()` を新設

新形式が存在すればそれを、なければ旧形式を返す。どちらも存在しなければ新形式を返す。

```typescript
export function resolveWithFallback(cwd: string, slug: string): string {
  const newPath = path.join(cwd, DRAFTS_SUBDIR, slug, "request.md");
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(cwd, DRAFTS_SUBDIR, slug + ".md");
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath; // default to new format
}
```

注意: `fs` は `node:fs` (sync) を新たに import する必要がある。既存は `node:fs/promises` のみ。

### 2-3: `list()` をディレクトリベースに変更

```typescript
export async function list(cwd: string): Promise<string[]> {
  const draftsDir = path.join(cwd, DRAFTS_SUBDIR);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsAsync.readdir(draftsDir, { withFileTypes: true });
  } catch (err: unknown) {
    if (err instanceof Object && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const slugs = new Set<string>();

  // 新形式: ディレクトリ内に request.md があるもの
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        await fsAsync.access(path.join(draftsDir, entry.name, "request.md"));
        slugs.add(entry.name);
      } catch {
        // request.md がなければスキップ
      }
    }
  }

  // 後方互換: フラットファイル .md (同名ディレクトリがなければ)
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
```

### 2-4: `read()` をフォールバック対応に変更

```typescript
export async function read(cwd: string, slug: string): Promise<ParsedRequest> {
  const filePath = resolveWithFallback(cwd, slug);
  const content = await fsAsync.readFile(filePath, "utf-8");
  return parseRequestMdContent(content, filePath);
}
```

### 2-5: `write()` をディレクトリ構造に変更

```typescript
export async function write(cwd: string, slug: string, content: string): Promise<void> {
  const slugDir = path.join(cwd, DRAFTS_SUBDIR, slug);
  await fsAsync.mkdir(slugDir, { recursive: true });
  const filePath = path.join(slugDir, "request.md");
  await fsAsync.writeFile(filePath, content, "utf-8");
}
```

### 2-6: `checkSlugCollision()` にディレクトリチェックを追加

drafts/ のチェックを拡張:
- 既存: `<slug>.md` ファイルの存在
- 追加: `<slug>/` ディレクトリの存在

```typescript
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
}
```

## Task 3: pipeline-run.ts の CANONICAL_PATTERN を更新 [x]

**ファイル**: `src/core/command/pipeline-run.ts`

新パターンを優先、旧パターンでフォールバック:

```typescript
// Before
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

// After
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/;
const CANONICAL_PATTERN_LEGACY = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;
```

`prepare()` 内:

```typescript
// Before
const canonicalMatch = CANONICAL_PATTERN.exec(this.absolutePath);

// After
const canonicalMatch =
  CANONICAL_PATTERN.exec(this.absolutePath) ??
  CANONICAL_PATTERN_LEGACY.exec(this.absolutePath);
```

## Task 4: command-registry.ts の slug 解決を更新 [x]

**ファイル**: `src/cli/command-registry.ts`

### 4-1: import を変更

```typescript
// Before
import { resolve as storeResolve } from "../core/request/store.js";

// After
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
```

これにより `validate` と `review` の slug 解決が後方互換付きになる。関数名を alias しているため、ハンドラ内のコードは変更不要。

## Task 5: run.ts の slug 解決を更新 [x]

**ファイル**: `src/cli/run.ts`

### 5-1: import を変更

```typescript
// Before
import { resolve as storeResolve } from "../core/request/store.js";

// After
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
```

## Task 6: manager.ts の slug 解決を更新 [x]

**ファイル**: `src/core/request/manager.ts`

`review()` と `resolve()` が `store.resolve()` を呼んでいるが、これらは後方互換が必要なため `store.resolveWithFallback()` に切り替える。

```typescript
// review() 内
filePath = store.resolveWithFallback(cwd, slugOrPath);

// resolve()
export function resolve(cwd: string, slug: string): string {
  return store.resolveWithFallback(cwd, slug);
}
```

## Task 7: テスト更新 [x]

### 7-1: store.test.ts の更新

**ファイル**: `tests/unit/core/request/store.test.ts`

- TC-ST-001: `resolve()` が `specrunner/drafts/<slug>/request.md` を返すことを検証
- TC-ST-002: `list()` がディレクトリベースの slug を返す + フラットファイルのフォールバック
- TC-ST-004: `write()` が `<slug>/request.md` に書くことを検証
- TC-ST-005: `checkSlugCollision()` がディレクトリの存在でも衝突検出
- TC-ST-008: `read()` がディレクトリ内の `request.md` を読む

追加テスト:
- `resolveWithFallback()` が新形式を優先すること
- `resolveWithFallback()` が旧形式にフォールバックすること
- `resolveWithFallback()` がどちらも存在しない場合に新形式を返すこと
- `list()` がディレクトリとフラットファイルの混在を正しく処理すること
- `list()` がディレクトリ内に `request.md` がない場合にスキップすること
- `checkSlugCollision()` がフラットファイル・ディレクトリ両方を検出すること

### 7-2: pipeline-run-canonical.test.ts の更新

**ファイル**: `tests/unit/core/command/pipeline-run-canonical.test.ts`

- TC-PIPELINE-001: 新形式 `specrunner/drafts/<slug>/request.md` からの slug 抽出
- TC-PIPELINE-003: 新形式でのハイフン入り slug
- 追加: 旧形式 `specrunner/drafts/<slug>.md` からのフォールバック slug 抽出
- TC-PIPELINE-002: 引き続き `requests/active/` パターンを拒否

### 7-3: request-new.test.ts の更新

**ファイル**: `tests/unit/core/command/request-new.test.ts`

- TC-NEW-001: `specrunner/drafts/<slug>/request.md` が作成されることを検証 (パス変更)

## Task 8: typecheck & test 実行 [x]

`bun run typecheck && bun run test` が green であることを確認。

## 依存関係

```
Task 1 (paths.ts)
  ↓
Task 2 (store.ts) ← store.ts 内で直接パスを組む
  ↓
Task 3 (pipeline-run.ts) ← 独立
Task 4 (command-registry.ts) ← Task 2 の resolveWithFallback に依存
Task 5 (run.ts) ← Task 2 の resolveWithFallback に依存
Task 6 (manager.ts) ← Task 2 の resolveWithFallback に依存
  ↓
Task 7 (テスト) ← すべての実装完了後
  ↓
Task 8 (検証)
```
