# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. `run` / `job start` handler 同一性（要件 1）

`src/cli/command-registry.ts` を読み、run handler（400-454 行）と job start handler（523-577 行）を突合した。  
logic は byte-identical。差分はコメント 1 行（detach の注釈）と positional.name の表示文字列（`"request.md|slug"` vs `"slug|file"`）のみ。  
`bin/specrunner.ts:125` で `run` は `WORKTREE_GUARDED_COMMANDS` に入り、`:79` で guarded subcommands（`start` 含む）はいずれも `detectWorktree` を通ることを確認。

### 2. `compute*Iteration` 4 関数（要件 2）

各ファイルの関数定義を読んだ:
- `code-review.ts:28`: `(state.steps?.[STEP_NAMES.CODE_REVIEW]?.length ?? 0) + 1`
- `spec-review.ts:51`: `(state.steps?.[STEP_NAMES.SPEC_REVIEW]?.length ?? 0) + 1`
- `request-review.ts:40`: `(state.steps?.[STEP_NAMES.REQUEST_REVIEW]?.length ?? 0) + 1`
- `conformance.ts:35`: `(state.steps?.[STEP_NAMES.CONFORMANCE]?.length ?? 0) + 1`

`io-iteration.ts:12` の `nextIteration` は `(state.steps?.[stepName]?.length ?? 0) + 1` で完全に同一。  
4 ファイルとも既に `import { nextIteration } from "./io-iteration.js"` 済みを確認。  
`compute*Iteration` は各ファイル内の `buildMessage` / `resultFilePath` から呼ばれており、`nextIteration(state, STEP_NAMES.X)` に置き換え可能。

### 3. `detectPackageManager` phase-1 vs `findLockfile`（要件 3）

`src/util/detect-pm.ts` を全文読んだ。  
phase-1（57-79 行）は LOCKFILE_MAP 順ループ → .git stop → 親ディレクトリ stop の 3 ステップ。  
`findLockfile`（128-157 行）は同じ LOCKFILE_MAP・同じ stop 条件。返り値のみ `{ pm, filename, root }` と異なる。  
委譲時は `findLockfile(cwd, { existsSync: fs.existsSync })` で引数の型制約を満たせることを確認。

### 4. `loadConfig` vs `loadConfigWithSourceMetadata`（要件 4）

`src/config/store.ts` を read→migrate→merge→validate の各段で突合した。  
`loadConfig`（77-127 行）と `loadConfigWithSourceMetadata`（144-200 行）のコア処理は同一。  
差分は metadata（`projectLocalPath` の返却）のみで、`config` の計算内容に影響しない。  
`repoRoot` が undefined の場合: 両関数とも project local config は読まない（gated by `if (repoRoot)`）ため挙動は等価。  
`(await loadConfigWithSourceMetadata(repoRoot)).config` への委譲は安全。

### 5. journal append wrappers（要件 5）

`src/store/job-journal.ts:218-250` を確認。  
`appendInterruption` / `appendLineage` / `appendOperatorEvent` / `appendFindingRecency` は全て `await appendEventRecord(this.resolver.getEventsPath(), record)` の 1 行。  
`src/store/job-state-store.ts:261-293` の 4 wrapper も全て `return this._journal.appendX(record)` の 1 行委譲。  
`appendHistory`（208 行）は `appendHistoryEntry(state, entry)` 呼び出し + persist があり、対象外であることを確認。

### 6. verification runner 末尾（要件 6）

`runVerificationCommands`（351-470 行）と `runVerificationPhases`（482-696 行）の末尾を突合した。  
coverage-gate → lockfile-gate → verdict 計算 → `writeVerificationResult` の構造は同一。  
skip 文言の差:
- commands 経路: `"_(skipped — previous command failed)_"`（coverage gate・lockfile gate 両方）
- phases 経路: `"_(skipped — previous phase failed)_"`（coverage gate・lockfile gate 両方）  
label 引数（`"command"` / `"phase"`）を受ける共有関数として抽出可能。markdown 出力は 1 byte も変わらない。

### 7. resume / reopen worktreePath 解決 block（要件 7）

`src/core/command/resume.ts:274-289` と `src/core/command/reopen.ts:311-326` を突合した。  
両ブロックは byte-identical（変数名・ロジック・コメント含む）。  
slugによる job 解決 block（request の scope 外。`includeArchived` の差あり）は別の箇所であることを確認。

### 8. PROBE_SLUG alias・空 if block・identity `enrichContext`（要件 8）

- `descriptor-input-completeness.ts:63-64`: `const PROBE_SLUG = VALIDATOR_PROBE_SLUG;` は同一ファイル内 alias。`PROBE_SLUG` は 117・121 行で使用。rename 統一で削除可能。
- `job-state-projection.ts:79-86`: if block の本体がコメント 1 行のみの空 block を確認。削除可能。
- `spec-review.ts:100-102`: `enrichContext` が `return dynamicContext;` のみの identity 実装を確認。`step-types.ts:247` で `enrichContext?` と optional 定義されており、全 3 adapter とも `if (step.enrichContext)` guard で呼んでいるため、削除しても動作は不変。

## 検証できなかった項目

None。全 8 要件の前提コードをソースから直接確認した。

## Findings 詳細

None。指摘なし。

全コードアサーションは実際のソースと一致しており、要件・受け入れ基準・スコープ外の記述も技術的に正確。
