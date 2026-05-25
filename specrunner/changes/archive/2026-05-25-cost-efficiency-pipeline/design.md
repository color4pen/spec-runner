# Design: cost-efficiency-pipeline

## Summary

request 起票から finish までの全フェーズで発生する token usage を slug 単位の `usage.json` に蓄積し、`specrunner usage` コマンドで集計・表示する。draft → change folder → archive の既存 artifact lifecycle に乗せることで、過去 PR の cost retrospective を可能にする。

## Background

現状、`request review` / `request generate` のコストはどこにも記録されず、pipeline 内 step のコストは state file (`StepRun.modelUsage`) に記録されるが gitignore 対象で永続化されない。archive にコスト記録が残らないため merge 済 PR の cost を後から振り返れない。

## Architecture Decision

### D1: OneShotQueryResult に modelUsage を追加

`queryOneShot()` は既に `SDKResultSuccess` から `result` と `session_id` を取り出しているが、`modelUsage` は捨てている。`ClaudeCodeRunner.run()` と同じ extraction パターンを適用し、`OneShotQueryResult.modelUsage` として返す。

```typescript
// src/core/port/one-shot-query-client.ts
export interface OneShotQueryResult {
  text: string;
  sessionId?: string;
  turnCount?: number;
  stopReason?: string;
  modelUsage?: Record<string, ModelUsage>;  // ← 追加
}
```

port interface と adapter 実装 (`query-one-shot.ts`) の両方を変更。adapter 側では `SDKResultSuccess.modelUsage` から `Record<string, ModelUsage>` へ mapping する。extraction ロジックは `ClaudeCodeRunner` (L240-254) と同型。

**理由**: 既存パターンの横展開。新たな依存を追加せず、port interface の型を拡張するだけ。

### D2: usage.json の schema と store module

`src/core/usage/` に新規モジュールを作成する。

```typescript
// src/core/usage/types.ts
export interface CommandInvocation {
  command: "request-review" | "request-generate" | "job";
  timestamp: string;  // ISO 8601
  modelUsage: Record<string, ModelUsage> | null;
  jobId?: string;      // job のみ
  stepName?: string;   // job の step 別記録
}

export interface UsageFile {
  commandInvocations: CommandInvocation[];
}
```

```typescript
// src/core/usage/store.ts
export async function readUsageFile(filePath: string): Promise<UsageFile>
export async function appendInvocation(filePath: string, entry: CommandInvocation): Promise<void>
export async function deriveFromJobState(state: JobState): Promise<CommandInvocation[]>
```

- `readUsageFile`: file 不在時は `{ commandInvocations: [] }` を返す
- `appendInvocation`: read → append → `atomicWriteJson` (既存 `src/util/atomic-write.ts` を使用)
- `deriveFromJobState`: `state.steps` を走査し、各 `StepRun` の `modelUsage` / `endedAt` / `stepName` から `CommandInvocation[]` を生成

**理由**: usage.json の read/write を 1 箇所に集約。callers (request-review, generator, finish) はこの module を呼ぶだけ。

### D3: draft 段階の usage 記録 (request review / generate)

`executeReview()` と `generate()` の LLM 呼び出し後に `appendInvocation()` を呼ぶ。

- slug 解決: CLI handler が既に slug or file path を判定している。slug として解決された場合は slug を `executeReview` に渡す。file path の場合は `specrunner/drafts/<slug>/request.md` パターンで slug 抽出を試み、失敗時は silent skip。
- `generate()` では slug が常に既知 (`slugify(text)` で生成済)。

```
executeReview(filePath, opts, client, slug?)
  └─ result = await client.run(...)
  └─ if (slug) appendInvocation(draftUsageJsonPath(cwd, slug), { command: "request-review", ... result.modelUsage })
```

**理由**: LLM コスト発生箇所の直後に記録。既存関数のシグネチャに optional parameter を 1 つ追加するだけ。

### D4: draft → change folder への usage.json コピー

`LocalRuntime.setupWorkspace()` と `ManagedRuntime.setupWorkspace()` で `request.md` をコピーする箇所の直後に、`usage.json` のコピーを追加する。

```typescript
// request.md コピー後
const draftUsageJson = path.join(path.dirname(opts.requestFilePath), "usage.json");
const changeUsageJson = path.join(worktreePath, changeFolderPath(slug), "usage.json");
try {
  await fs.cp(draftUsageJson, changeUsageJson);
} catch {
  // usage.json 不在は正常 (review/generate 未実行のケース)
}
```

draft folder 削除 (`fs.rm`) は既に `request.md` コピー後に実行されるため、`usage.json` コピーも同じタイミングで確保される。

**理由**: 既存の `request.md` コピーパターンと同型。`usage.json` が存在しない場合は catch で skip。

### D5: pipeline usage の derive タイミング — finish Phase 1 で state から一括生成

**選択**: finish 時一括 derive (dual write ではない)

pipeline 実行中は state file (`StepRun.modelUsage`) のみに記録し、`changes/<slug>/usage.json` には書かない。finish Phase 1 で archive する直前に state file から全 step の usage entries を derive して `changes/<slug>/usage.json` に append する。

```
finish Phase 1:
  1. git checkout <feature-branch>     (既存)
  2. mergeSpecsForChange()             (既存)
  3. ★ deriveAndWriteUsage()           (新規)
     - state = load job state
     - entries = deriveFromJobState(state)
     - for each entry: appendInvocation(changes/<slug>/usage.json, entry)
     - git add changes/<slug>/usage.json
  4. archiveChangeFolder()             (既存 — git mv でまとめて移動)
  5. commitArchive()                   (既存)
```

archive の `git mv` が directory ごと移動するため、`usage.json` も自動的に `archive/<YYYY-MM-DD>-<slug>/` に含まれる。

**理由**:
- source of truth が state file 一元 (dual write の不整合リスクなし)
- pipeline コード (`StepExecutor`, `CommandRunner`) 無改修
- finish は既に state file を読んでいる (pre-flight / markJobArchived)
- live 中に usage.json を観測する要件は本 request に含まれない (retrospective 用途)
- managed runtime で `modelUsage` が undefined の step は `modelUsage: null` で entry を記録 (timestamp / stepName は残す)

**却下した代案**: step ごとの dual write (finalizeStep 内)
- メリット: pipeline 実行中に usage.json を観測可能
- デメリット: state file と usage.json の二重管理、StepExecutor に usage.json 書き込みロジックが侵入、change folder path の解決が StepExecutor の責務外

### D6: specrunner usage CLI コマンド

新規 top-level subcommand `specrunner usage [<slug>]` を追加する。`job` の subcommand にしない理由: usage はジョブ単位ではなく slug 単位 (draft 段階の cost を含む)。

```
specrunner usage            → 全 archive 走査、slug ごとの total token 数サマリ
specrunner usage <slug>     → 該当 slug の詳細 (entry ごと / model 別 / step 別 / total)
```

**slug 解決の優先順位**:
1. `specrunner/changes/<slug>/usage.json` (active change)
2. `specrunner/changes/archive/*-<slug>/usage.json` (archived)
   - 複数日付の archive がある場合: 最新日付を優先

**実装構成**:
- `src/core/command/usage-show.ts`: slug 指定時の詳細表示ロジック
- `src/core/command/usage-summary.ts`: 全 archive 走査のサマリロジック
- CLI handler (`command-registry.ts`): subcommand 登録

**出力形式** (slug 指定):
```
Usage: <slug>

  Command               Timestamp             Model             Input    Output   CacheRead  CacheCreate
  request-review        2026-05-25T10:00:00Z  claude-opus-4-5   50000    3000     45000      5000
  request-review        2026-05-25T10:05:00Z  claude-opus-4-5   52000    3200     47000      5200
  job/spec-review       2026-05-25T11:00:00Z  claude-opus-4-6   80000    5000     70000      10000
  job/implementer       2026-05-25T12:00:00Z  claude-opus-4-6   120000   15000    100000     20000
  ...

Total by model:
  claude-opus-4-5:  in=102000  out=6200   cache_read=92000   cache_create=10200
  claude-opus-4-6:  in=200000  out=20000  cache_read=170000  cache_create=30000
```

**出力形式** (引数なし):
```
Slug                           Input      Output     CacheRead   CacheCreate
my-feature-slug                302000     26200      262000      40400
another-feature                180000     15000      160000      20000
(3 archives without usage.json skipped)
```

**理由**: USD 換算は scope 外のため token 数のみ表示。`usage.json` が存在しない archive は silent skip (error にならない)。

### D7: path utilities

`src/util/paths.ts` に追加:

```typescript
export function draftUsageJsonPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}/usage.json`;
}

export function usageJsonPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/usage.json`;
}
```

既存の `draftPath` / `changeFolderPath` と同じ設計パターン (relative path を返す pure function)。

## Affected Capabilities (delta spec)

| Capability | Change Type | Description |
|---|---|---|
| cli-commands | modify | `specrunner usage [<slug>]` 追加、`request review` / `request generate` の usage.json 副作用を規定 |
| one-shot-query | modify | `OneShotQueryResult.modelUsage` 追加 |
| cli-finish-command | modify | Phase 1 に usage.json derivation step 追加 |

## Scope

### In scope

- `usage.json` schema 定義と read/append/derive store module
- `OneShotQueryResult` に `modelUsage` 追加 (port + adapter)
- `request review` / `request generate` 実行時に `drafts/<slug>/usage.json` に追記
- `setupWorkspace` で `usage.json` を change folder にコピー
- finish Phase 1 で state から pipeline usage を derive して `changes/<slug>/usage.json` に追記
- `specrunner usage [<slug>]` CLI コマンド
- step model config の検証 + テスト追加
- 関連テスト

### Out of scope

- USD 換算 / price table (別 request)
- cost limit / budget alert (別 request)
- finish 失敗時の partial usage 回復
- 既存 archive への usage.json retrofit
- 高度な UI (グラフ / フィルタ / sort)
