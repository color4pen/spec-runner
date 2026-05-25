# Tasks: cost-efficiency-pipeline

## T-01: path utilities に usage.json パスを追加

**File**: `src/util/paths.ts`

`draftPath` / `changeFolderPath` と同型の pure function を 2 つ追加する。

```typescript
export function draftUsageJsonPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}/usage.json`;
}

export function usageJsonPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/usage.json`;
}
```

`DRAFTS_DIR`, `CHANGES_DIR` は既存の module-level 定数を使用。

**Acceptance**:
- [x] `draftUsageJsonPath("foo")` → `"specrunner/drafts/foo/usage.json"`
- [x] `usageJsonPath("foo")` → `"specrunner/changes/foo/usage.json"`
- [x] 既存 export に影響なし
- [x] `bun run typecheck` が green

---

## T-02: usage.json の型定義と store module を作成

**File**: `src/core/usage/types.ts` (新規), `src/core/usage/store.ts` (新規)

### types.ts

```typescript
import type { ModelUsage } from "../port/model-usage.js";

export interface CommandInvocation {
  command: "request-review" | "request-generate" | "job";
  timestamp: string;
  modelUsage: Record<string, ModelUsage> | null;
  jobId?: string;
  stepName?: string;
}

export interface UsageFile {
  commandInvocations: CommandInvocation[];
}
```

### store.ts

3 つの関数を実装する:

```typescript
import type { UsageFile, CommandInvocation } from "./types.js";
import type { JobState } from "../../state/schema.js";
import { atomicWriteJson } from "../../util/atomic-write.js";

/**
 * usage.json を読み込む。file 不在時は空構造を返す。
 */
export async function readUsageFile(filePath: string): Promise<UsageFile>

/**
 * entry を 1 件 append して atomic write する。
 */
export async function appendInvocation(filePath: string, entry: CommandInvocation): Promise<void>

/**
 * JobState.steps から CommandInvocation[] を derive する。
 * 各 StepRun の modelUsage / endedAt を使用。
 * modelUsage が undefined の StepRun は modelUsage: null で記録。
 */
export async function deriveFromJobState(state: JobState): Promise<CommandInvocation[]>
```

`appendInvocation` の実装:
1. `readUsageFile(filePath)` で現在の内容を取得
2. `file.commandInvocations.push(entry)`
3. `atomicWriteJson(filePath, file)` で書き込み

`deriveFromJobState` の実装:
1. `state.steps` を iterate
2. 各 step の全 attempt を走査
3. 各 `StepRun` → `CommandInvocation { command: "job", timestamp: run.endedAt, modelUsage: run.modelUsage ?? null, jobId: state.jobId, stepName }` を生成
4. timestamp 昇順でソート

**Acceptance**:
- [x] `readUsageFile` が存在しないファイルに対して `{ commandInvocations: [] }` を返す
- [x] `appendInvocation` が既存 entries を維持しつつ新 entry を追加する
- [x] `appendInvocation` を 2 回呼ぶと `commandInvocations` array に 2 entry 蓄積される
- [x] `deriveFromJobState` が各 step の全 attempt を entry 化する
- [x] `deriveFromJobState` が modelUsage undefined の step で `modelUsage: null` を設定する
- [x] `bun run typecheck` が green

---

## T-03: OneShotQueryResult に modelUsage を追加

**File**: `src/core/port/one-shot-query-client.ts`, `src/adapter/claude-code/query-one-shot.ts`

### port interface

`OneShotQueryResult` に field を追加:

```typescript
import type { ModelUsage } from "./model-usage.js";

export interface OneShotQueryResult {
  text: string;
  sessionId?: string;
  turnCount?: number;
  stopReason?: string;
  modelUsage?: Record<string, ModelUsage>;  // ← 追加
}
```

### adapter 実装

`queryOneShot()` の Step 6 (result assembly、L155-161) で `SDKResultSuccess.modelUsage` を抽出する。extraction パターンは `ClaudeCodeRunner.run()` (L240-254) と同型:

```typescript
const successResult = lastResult as SDKResultSuccess;

// Extract modelUsage (same pattern as ClaudeCodeRunner)
let modelUsage: Record<string, ModelUsage> | undefined;
const rawUsage = (successResult as Record<string, unknown>).modelUsage;
if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage as object).length > 0) {
  modelUsage = {};
  for (const [model, usage] of Object.entries(rawUsage as Record<string, Record<string, number>>)) {
    modelUsage[model] = {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
    };
  }
}

return {
  text: successResult.result,
  sessionId: successResult.session_id,
  stopReason: lastResult.subtype,
  modelUsage,
};
```

adapter 内の `QueryOneShotResult` interface にも同様に `modelUsage` field を追加する。

**Acceptance**:
- [x] `OneShotQueryResult.modelUsage` が `Record<string, ModelUsage> | undefined` である
- [x] `queryOneShot` が SDK result から modelUsage を正しく抽出する
- [x] modelUsage が空 or 不在の場合 undefined を返す
- [x] 既存の `request review` / `request generate` の動作に影響なし (field 追加のみ)
- [x] `bun run typecheck` が green

---

## T-04: request review / generate に usage.json 追記を実装

**File**: `src/core/command/request-review.ts`, `src/core/request/generator.ts`, `src/cli/command-registry.ts`

### request review

`executeReview` のシグネチャに optional `slug` パラメータを追加:

```typescript
export async function executeReview(
  filePath: string,
  opts: { json: boolean },
  client: OneShotQueryClient,
  slug?: string,  // ← 追加
): Promise<number>
```

`runReview()` 呼び出し後に usage.json append を実行:

```typescript
result = await runReview(content, process.cwd(), client);

// Append usage to drafts/<slug>/usage.json
if (slug) {
  try {
    const absUsagePath = path.join(process.cwd(), draftUsageJsonPath(slug));
    await appendInvocation(absUsagePath, {
      command: "request-review",
      timestamp: new Date().toISOString(),
      modelUsage: result.modelUsage ?? null,  // runReview の戻り値拡張が必要
    });
  } catch {
    // Silent skip — usage tracking failure must not block review output
  }
}
```

ただし `runReview()` は現在 `RequestReviewResult` を返しており `modelUsage` を含まない。`runReview` を拡張して `modelUsage` も返すようにする:

```typescript
// reviewer.ts
export interface RequestReviewResultWithUsage extends RequestReviewResult {
  modelUsage?: Record<string, ModelUsage>;
}

export async function runReview(
  content: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<RequestReviewResultWithUsage> {
  // ...
  const result = await client.run({ ... });
  const parsed = parseReviewOutput(result.text);
  return { ...parsed, modelUsage: result.modelUsage };
}
```

CLI handler (`command-registry.ts`) から `executeReview` に slug を渡す:
- 入力が slug として解決された場合: `executeReview(filePath, opts, client, input)`
- 入力が file path の場合: slug 抽出を試みる (`specrunner/drafts/<slug>/request.md` pattern match)

### request generate

`generate()` 内で `client.run()` の直後に append:

```typescript
const queryResult = await client.run({ ... });
result = queryResult.text;

// Append usage to drafts/<slug>/usage.json
try {
  const absUsagePath = path.join(cwd, draftUsageJsonPath(slug));
  await appendInvocation(absUsagePath, {
    command: "request-generate",
    timestamp: new Date().toISOString(),
    modelUsage: queryResult.modelUsage ?? null,
  });
} catch {
  // Silent skip
}
```

generate の場合、`store.write()` で `drafts/<slug>/request.md` が書かれた後に usage.json が存在するため、draft folder は既に作成済み。ただし `appendInvocation` 内の `atomicWriteJson` が `mkdir` するため順序を意識する必要はない。`client.run()` の直後 (= `store.write()` より前) でも動作する。

**Acceptance**:
- [x] `specrunner request review <slug>` 実行後、`drafts/<slug>/usage.json` に entry が追加される
- [x] 同一 draft に対し `request review` を 2 回実行すると 2 entry 蓄積される
- [x] `specrunner request generate "<text>"` 実行後、`drafts/<slug>/usage.json` に entry が追加される
- [x] slug 解決できない file path での review 時、usage.json への追記が silent skip される
- [x] usage tracking 失敗時に review / generate の本体出力がブロックされない
- [x] `bun run typecheck` が green

---

## T-05: setupWorkspace で usage.json を change folder にコピー

**File**: `src/core/runtime/local.ts`, `src/core/runtime/managed.ts`

両 runtime の `setupWorkspace()` で `request.md` をコピーする直後に `usage.json` のコピーを追加する。

### local.ts

L218 (`await fs.cp(opts.requestFilePath, changeFolderRequestPath)`) の直後:

```typescript
// Copy usage.json if it exists (may not exist if review/generate was not run)
try {
  const draftUsageJsonSrc = path.join(path.dirname(opts.requestFilePath), "usage.json");
  const changeUsageJsonDst = path.join(worktreePath, usageJsonPath(slug));
  await fs.cp(draftUsageJsonSrc, changeUsageJsonDst);
} catch {
  // usage.json does not exist — normal case (review/generate not run)
}
```

`git add` のスコープは既存の `git add specrunner/changes/<slug>/request.md` → `git add specrunner/changes/<slug>/` (ディレクトリ指定) に変更して usage.json も含める。ただし既存コードは `request.md` を個別指定しているので、`usage.json` が存在する場合のみ追加で `git add` する:

```typescript
// Stage usage.json if it was copied
try {
  await fs.access(path.join(worktreePath, usageJsonPath(slug)));
  await this.spawnFn("git", ["add", usageJsonPath(slug)], { cwd: worktreePath });
} catch {
  // No usage.json to stage
}
```

### managed.ts

同様の変更を `managed.ts` の `setupWorkspace()` 内、`request.md` コピー後に適用する。

**Acceptance**:
- [x] `usage.json` が draft に存在する場合、`job start` 後に `changes/<slug>/usage.json` にコピーされている
- [x] `usage.json` が draft に存在しない場合、`job start` が正常に完了する (skip)
- [x] コピーされた `usage.json` が git staging に含まれる
- [x] `bun run typecheck` が green

---

## T-06: finish Phase 1 で pipeline usage を derive

**File**: `src/core/finish/derive-usage.ts` (新規), `src/core/finish/orchestrator.ts`

### derive-usage.ts

```typescript
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { deriveFromJobState, appendInvocation, readUsageFile } from "../usage/store.js";
import { usageJsonPath, changeFolderPath } from "../../util/paths.js";

export interface DeriveUsageResult {
  ok: boolean;
  skipped: boolean;
  message: string;
}

/**
 * State file から pipeline usage entries を derive し、
 * changes/<slug>/usage.json に append する。
 * archive 前に呼ばれることを前提とする。
 */
export async function deriveAndWriteUsage(params: {
  jobId: string;
  slug: string;
  cwd: string;
  repoRoot: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<DeriveUsageResult>
```

実装:
1. `changeFolderPath(slug)` の存在チェック (archive 済みなら skip)
2. `JobStateStore.load()` で state を読む
3. `deriveFromJobState(state)` で `CommandInvocation[]` を生成
4. entries が 0 件なら skip (pipeline に step 記録がない場合)
5. 各 entry を `appendInvocation(usageJsonAbsPath, entry)` で追記
6. `git add changes/<slug>/usage.json` で staging

### orchestrator.ts

`runPhase1Archive` 内、`mergeSpecsForChange()` の後、`archiveChangeFolder()` の前に挿入:

```typescript
// derive pipeline usage into changes/<slug>/usage.json (before archive moves it)
const usageResult = await deriveAndWriteUsage({
  jobId: target.jobId,
  slug: target.slug,
  cwd: archiveCwd,
  repoRoot: cwd,
  spawn,
  fs,
});
if (!usageResult.skipped) stdoutWrite(usageResult.message);
```

derive は best-effort: 失敗しても finish を中断しない (warning ログ + continue)。

**Acceptance**:
- [x] pipeline 完走後の `finish` で、`changes/<slug>/usage.json` に各 step の usage entry が追加される
- [x] draft 段階の entries (request-review 等) が保持されたまま pipeline entries が append される
- [x] `usage.json` が archive 後に `archive/<YYYY-MM-DD>-<slug>/usage.json` に含まれる
- [x] change folder が存在しない場合 (PR 既 merge 等) は skip
- [x] state に steps 記録がない場合は skip
- [x] derive 失敗時に finish が中断されない
- [x] `bun run typecheck` が green

---

## T-07: specrunner usage CLI コマンドを実装

**File**: `src/core/command/usage-show.ts` (新規), `src/core/command/usage-summary.ts` (新規), `src/cli/command-registry.ts`

### usage-show.ts (slug 指定時)

```typescript
/**
 * 指定 slug の usage.json を読み込み、entry ごと / model 別 / total の集計を表示する。
 *
 * slug 解決順序:
 * 1. specrunner/changes/<slug>/usage.json (active change)
 * 2. specrunner/changes/archive/*-<slug>/usage.json (最新日付の archive)
 */
export async function showUsage(slug: string, cwd: string): Promise<number>
```

出力形式:
- entry ごとの行 (command, timestamp, model, token 数)
- 末尾に model 別 total

### usage-summary.ts (引数なし)

```typescript
/**
 * 全 archive の usage.json を走査し、slug ごとの total token 数サマリを表示する。
 * usage.json が存在しない archive は silent skip。
 */
export async function showUsageSummary(cwd: string): Promise<number>
```

出力形式:
- slug ごとの total token 数 (1 行 per slug)
- 末尾に grand total
- skip された archive 数を表示

### command-registry.ts

top-level subcommand `usage` を追加:

```typescript
usage: {
  subcommands: {},
  flags: {},
  positional: { name: "slug", required: false },
  handler: async (parsed) => {
    const slug = parsed.positional;
    if (slug) {
      process.exit(await showUsage(slug, process.cwd()));
    } else {
      process.exit(await showUsageSummary(process.cwd()));
    }
  },
},
```

**Acceptance**:
- [x] `specrunner usage <slug>` で対象 slug の total / step 別 / model 別 token 数が表示される
- [x] `specrunner usage` (引数なし) で全 archive 横断のサマリが表示できる
- [x] `usage.json` が存在しない archive は silent skip (error にならない)
- [x] 同一 slug が複数日付の archive に存在する場合、最新日付が優先される
- [x] active change (`changes/<slug>/`) の usage.json も表示対象
- [x] `bun run typecheck` が green

---

## T-08: step model config の検証 + テスト追加

**File**: `tests/` (テストファイル)

`getStepExecutionConfig()` の resolution chain で `config.steps.<step>.model` が step 単位で正しく解決されることを確認するテストを追加する。

```typescript
// 例: config.steps["spec-review"].model = "claude-sonnet-4-6" の場合
// getStepExecutionConfig(config, "spec-review", stepDefaults).model === "claude-sonnet-4-6"
```

既存の `step-config.ts` テストファイルがあればそこに追加。なければ新規作成。

**Acceptance**:
- [x] `config.steps.spec-review.model = "claude-sonnet-4-6"` 設定で spec-review step が sonnet model を返すテストが追加されている
- [x] `config.steps.defaults.model` が step-level 未設定の step に適用されるテストが追加されている
- [x] `bun run test` が green

---

## T-09: テスト追加 (usage store / CLI / integration)

**File**: `tests/` (テストファイル群)

### usage store テスト

- `readUsageFile`: 不在ファイル → 空構造
- `appendInvocation`: 2 回 append → 2 entry
- `deriveFromJobState`: steps ありの state → entries 生成、modelUsage undefined → null

### queryOneShot modelUsage テスト

- SDK result に modelUsage あり → OneShotQueryResult.modelUsage に反映
- SDK result に modelUsage なし → undefined

### usage CLI テスト

- `showUsage`: slug 指定で usage.json を読み込み集計表示
- `showUsageSummary`: archive 走査、usage.json なしの archive を skip

### paths テスト

- `draftUsageJsonPath` / `usageJsonPath` の出力確認

**Acceptance**:
- [x] 上記テストが追加されている
- [x] `bun run typecheck && bun run test` が green

---

## T-10: delta spec の作成

**File**: `specrunner/changes/cost-efficiency-pipeline/specs/cli-commands/spec.md` (新規), `specrunner/changes/cost-efficiency-pipeline/specs/one-shot-query/spec.md` (新規), `specrunner/changes/cost-efficiency-pipeline/specs/cli-finish-command/spec.md` (新規)

### cli-commands delta spec

- `specrunner usage [<slug>]` subcommand の振る舞い・引数・終了コード
- `request review` / `request generate` の usage.json 副作用

### one-shot-query delta spec

- `OneShotQueryResult.modelUsage` field の追加

### cli-finish-command delta spec

- Phase 1 に usage.json derivation step 追加

**Acceptance**:
- [x] 3 つの delta spec ファイルが作成されている
- [x] 各 delta spec が requirement / scenario 形式で記述されている

---

## Task Dependencies

```
T-01 (paths) ──────┬──→ T-02 (usage store) ──┬──→ T-04 (review/generate tracking)
                   │                          │
T-03 (modelUsage) ─┘                          ├──→ T-05 (setupWorkspace copy)
                                              │
                                              ├──→ T-06 (finish derive)
                                              │
                                              └──→ T-07 (usage CLI)

T-08 (step model config) ── 独立

T-09 (tests) ── T-01〜T-08 全完了後

T-10 (delta spec) ── T-01〜T-07 と並行可能
```
