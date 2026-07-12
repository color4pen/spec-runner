# Tasks: job stats のコスト集計で usage.json を jobId / change-dir から解決する

## T-01: `JobStateStore` に `ListedJobEntry` 型と `listWithSourceDirs()` を追加する

**File**: `src/store/job-state-store.ts`

### 実装内容

**1. `ListedJobEntry` インターフェースを export する**

```typescript
/**
 * An entry returned by JobStateStore.listWithSourceDirs().
 * Pairs each job state with the change directory it was loaded from,
 * so callers can resolve per-job artifacts (e.g. usage.json) without slug re-lookup.
 */
export interface ListedJobEntry {
  state: JobState;
  /**
   * Absolute path to the change directory that contains state.json (and usage.json)
   * for this job. Derived from the scan source: active slug dir, archive dir,
   * worktree slug dir, or sidecar worktree slug dir.
   * For managed-marker entries (section 4), this is the slug-based change dir
   * in the main checkout.
   */
  sourceChangeDir: string;
}
```

**2. `list()` のロジックを `listWithSourceDirs()` に移動する**

- 新静的メソッド `static async listWithSourceDirs(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<ListedJobEntry[]>` を追加する
- 内部の `stateMap: Map<string, JobState>` を `entryMap: Map<string, ListedJobEntry>` に変える
- `tryMerge(state)` を `tryMerge(state: JobState, sourceChangeDir: string)` に変える。比較キーは引き続き `updatedAt`
- 各スキャンセクションの sourceChangeDir:
  - **Section 1（active slug）**: `path.join(repoRoot, "specrunner", "changes", slug)` — `stateJsonPath` の親と同じ
  - **Section 1b（archive slug）**: `path.join(archiveDir, datedSlug)` — `stateJsonPath` の親と同じ
  - **Section 2（worktree slug）**: `path.join(worktreePath, "specrunner", "changes", slug)` — `stateJsonPath` の親と同じ
  - **Section 3（sidecar supplement）**: `path.join(sidecarEntry.worktreePath, slugStateJsonPath(sidecarEntry.slug), "..", "..")` — または直接 `path.join(sidecarEntry.worktreePath, "specrunner", "changes", sidecarEntry.slug)` で構成する
  - **Section 4（managed marker）**: `path.join(repoRoot, changeFolderPath(slug))` — managed job の usage.json は慣例としてメイン checkout の slug dir に置かれるため

**3. `list()` を `listWithSourceDirs()` に委譲するよう書き換える**

```typescript
static async list(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<JobState[]> {
  const entries = await JobStateStore.listWithSourceDirs(repoRoot, opts);
  return entries.map((e) => e.state);
}
```

これにより既存 caller は変更不要。

- [x] `ListedJobEntry` インターフェースを `job-state-store.ts` 内でファイルトップ付近（`NormalizedJobState` の次あたり）に export として追加する
- [x] `list()` の全スキャンロジックを `listWithSourceDirs()` に移動し、`tryMerge` に `sourceChangeDir: string` 引数を追加する
- [x] 各セクションで上記の sourceChangeDir 計算を追加する（path.join で直接算出）
- [x] `list()` を `listWithSourceDirs().then(entries => entries.map(e => e.state))` の形に書き換える
- [x] `changeFolderPath` を `src/util/paths.ts` からインポートする（Section 4 の managed marker で使用）

**Acceptance Criteria**:
- `ListedJobEntry` が `src/store/job-state-store.ts` から export される
- `listWithSourceDirs()` が active slug dir、archive dir、worktree dir に対して正しい sourceChangeDir を返す（T-04 のテストで担保）
- `list()` の返り値が従来と同一の `JobState[]` で、既存テストが全て green になる

---

## T-02: `runJobStats` を `listWithSourceDirs()` に切り替える

**File**: `src/core/command/job-stats.ts`

### 実装内容

**1. import を更新する**

- `ListedJobEntry` を `../../store/job-state-store.js` からインポートする（型として使用する場合は `type` import）
- `resolveChangeDir` import を削除する（`job-stats.ts` で他に使っていないため）
- `getJobSlug` import はループ内で不要になるが `deriveRunStat` が内部で使うため、`runJobStats` の呼び出し側コードから `getJobSlug` 呼び出しを消す（`deriveRunStat` は内部で呼ぶ）

**2. `runJobStats` のループを書き換える**

現在:
```typescript
const states = await JobStateStore.list(cwd, { includeArchived: true });
for (const state of states) {
  const slug = getJobSlug(normalizedState);
  let usageFile: UsageFile | null = null;
  try {
    const changeDir = await resolveChangeDir(slug, cwd);
    if (changeDir) {
      const usagePath = path.join(changeDir, "usage.json");
      ...
    }
  } catch { ... }
  ...
}
```

変更後:
```typescript
const entries = await JobStateStore.listWithSourceDirs(cwd, { includeArchived: true });
for (const { state, sourceChangeDir } of entries) {
  let usageFile: UsageFile | null = null;
  try {
    const usagePath = path.join(sourceChangeDir, "usage.json");
    const read = await readUsageFile(usagePath);
    if (read.commandInvocations.length > 0) {
      usageFile = read;
    }
  } catch { ... }
  ...
}
```

`resolveChangeDir` の呼び出し（非同期 await）がなくなるため、usage ファイル読み取りのエラーハンドリング（try/catch）はそのまま維持する。

- [x] `import { resolveChangeDir }` を削除する
- [x] `JobStateStore.list(...)` を `JobStateStore.listWithSourceDirs(...)` に変える
- [x] ループの destructuring を `{ state, sourceChangeDir }` に変える
- [x] `const slug = getJobSlug(normalizedState)` と `const changeDir = await resolveChangeDir(slug, cwd)` を削除する
- [x] `usagePath` を `path.join(sourceChangeDir, "usage.json")` で直接構成する
- [x] `if (changeDir)` ガードを削除する（sourceChangeDir は常に文字列、null チェック不要）

**Acceptance Criteria**:
- `resolveChangeDir` の import と呼び出しが `job-stats.ts` から消えている
- 同一 base-slug の 2 run が別々の usage.json を読む（T-03 の IO fixture で確認）
- 既存の TC-JSTATS-026〜030 の IO fixture テストが引き続き green

---

## T-03: IO fixture テスト — 同一 base-slug の cost 誤配なし

**File**: `tests/unit/core/command/job-stats-cross-slug.test.ts`（新規作成）

### テストシナリオ

#### TC-CROSS-001: 同一 base-slug・別 jobId の 2 run が各自の cost を計上する

- Archive fixture: `specrunner/changes/archive/2026-05-01-foo/`
  - state.json: jobId=`job-uuid-archived`, slug=`foo`
  - usage.json: jobId=`job-uuid-archived` のみ、1M input tokens (`claude-haiku-4-5`) → ~$0.80
- Active fixture: `specrunner/changes/foo/`
  - state.json: jobId=`job-uuid-active`, slug=`foo`
  - usage.json: jobId=`job-uuid-active` のみ、2M input tokens (`claude-haiku-4-5`) → ~$1.60

`runJobStats({ cwd: tmpDir, json: true })` を実行し:
- slug=`foo` の行が 2 行存在する（jobId 別）
- archived 行の costUsd ≈ $0.80
- active 行の costUsd ≈ $1.60
- costUsdTotal ≈ $2.40（重複計上なし）

#### TC-CROSS-002: legacy (jobId なし) invocation が別 dir の行に混入しない

- Archive fixture: `specrunner/changes/archive/2026-05-01-bar/`
  - state.json: jobId=`job-uuid-bar-old`
  - usage.json: legacy invocation（jobId なし）1M input → ~$0.80
- Active fixture: `specrunner/changes/bar/`
  - state.json: jobId=`job-uuid-bar-new`
  - usage.json: legacy invocation（jobId なし）2M input → ~$1.60

各行は自分の usage.json の legacy invocation だけを加算する:
- archived 行: costUsd ≈ $0.80
- active 行: costUsd ≈ $1.60
- costUsdTotal ≈ $2.40

#### TC-CROSS-003: usage.json がない行の cost は null になり行は drop されない

- Active fixture: `specrunner/changes/baz/`
  - state.json のみ（usage.json なし）

`runJobStats` 後の runs に slug=`baz` の行が 1 行存在し、costUsd が null である。

### フィクスチャ構成のヒント

state.json は `_journal` なし形式で作成し（legacy migration パス）、`history: []`, `steps: {}` を含める。
usage.json は `{ commandInvocations: [...] }` の標準フォーマット。
events.jsonl は不要（steps: {} で convergence/duration = null になるが cost テストには影響しない）。

- [x] `tests/unit/core/command/job-stats-cross-slug.test.ts` を新規作成する
- [x] `createArchiveFixture(slug, opts)` と `createActiveFixture(slug, opts)` ヘルパーを実装する
- [x] TC-CROSS-001: 2 fixture セットアップ → `runJobStats` 実行 → runs 配列の cost を検証する
- [x] TC-CROSS-002: legacy invocation の cross-dir 混入なしを検証する
- [x] TC-CROSS-003: usage.json 欠落行が null / drop なしを検証する

**Acceptance Criteria**:
- TC-CROSS-001〜003 の 3 ケースが全て green
- テストは `bun test tests/unit/core/command/job-stats-cross-slug.test.ts` で単独実行できる

---

## T-04: `listWithSourceDirs` の store 単体テスト（補強）

**File**: `src/store/__tests__/job-state-store-list-with-source-dirs.test.ts`（新規作成）

### テストシナリオ

- active slug → `sourceChangeDir` が `specrunner/changes/<slug>` と一致する
- archive slug → `sourceChangeDir` が `specrunner/changes/archive/<date>-<slug>` と一致する
- 同一 jobId の active・archive 両エントリが存在する場合、`updatedAt` が新しい方の sourceChangeDir が採用される

既存の `job-state-store-archive-skip.test.ts` のフィクスチャ構成を参考にする。

- [x] `src/store/__tests__/job-state-store-list-with-source-dirs.test.ts` を新規作成する
- [x] active fixture → sourceChangeDir が active slug dir と一致することを確認するテストを書く
- [x] archive fixture → sourceChangeDir が archive slug dir と一致することを確認するテストを書く

**Acceptance Criteria**:
- 上記 2 ケースが green
- `bun test src/store/__tests__/job-state-store-list-with-source-dirs.test.ts` で単独実行できる

---

## T-05: `bun run typecheck && bun test` で全体 green を確認する

- [x] `bun run typecheck` が exit 0
- [x] `bun test` が全体 green（`job-stats.test.ts`、`job-stats-jobid-filter.test.ts`、`job-stats-cross-slug.test.ts`、`job-state-store-list-with-source-dirs.test.ts` を含む）

**Acceptance Criteria**:
- 型エラー 0 件
- テスト失敗 0 件

---

## タスク依存関係

```
T-01（listWithSourceDirs 追加）
  ↓
T-02（runJobStats 切り替え）   T-04（store 単体テスト）
  ↓
T-03（IO fixture テスト）
  ↓
T-05（typecheck + test）
```

T-01 が T-02, T-03, T-04 の前提。T-02 と T-04 は並行実施可。
T-05 は最後に一括検証。
