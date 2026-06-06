# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-19 全チェックボックス `[x]`、`bun run typecheck && bun run test` green (273 files, 3233 tests) |
| design.md | ✅ | D1〜D9 の設計決定が実装に反映されている |
| spec.md | ⚠️ | R13 (exit-guard) の MUST 要件が beforeExit 経路で未達 |
| request.md | ⚠️ | 受け入れ基準「exit-guard が自 worktree の branch state に awaiting-resume を記録」が beforeExit 経路で未達 |

---

## 確認済み適合事項

### event journal (T-01〜T-05)

`src/store/event-journal.ts` の fold/appendEventRecord/stepRunToRecord が D2 スキーマに準拠。fold は末尾 partial 行を 1 行捨ててそれ以前を全復元し、append は `fs.appendFile` のみで既存行を書き換えない。fold 結果の `outcome.verdict` / `outcome.toolResult.fixableCount` / fixer attempt 数が従来同値。history 永続 truncation 撤廃。

### JobStateStore 分割レイアウト (T-02)

split layout (`.specrunner/jobs/<jobId>/`) と slug ベース (`changes/<slug>/`) の両方に対応。crash recovery が `loadSplitLayout` と `persist` の両方に実装（fold 行数 > stored counter → counter リセット → delta 再計算）。journal append と cursor overwrite が物理的に分離。

### path helper (T-06)

`src/util/paths.ts` に `slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath` 等が追加。`.specrunner/local/` は gitignore 対象。

### slug ディレクトリ移行・branch 同伴 (T-07)

`LocalRuntime.buildDeps` の `storeFactory` が worktreePath 有効時に slug ベースストアを生成。dual-write (jobId ベース機械ローカルキャッシュ + slug ベース branch 同伴) が `updateJobState` に実装。`git add -A` により events.jsonl / state.json / usage.json が step commit に同梱される。

### 導出可能フィールド除去 (T-08)

`stateToStateJson(..., { slugMode: true })` が `worktreePath` / `pid` / `session` / `request.slug` / `request.path` を strip。`loadSplitLayout` が slugInject で load 時に slug / requestMdAbsPath を注入。executor に `fileContent` の受け渡しなし。

### machine-local sidecar 分離 (T-09)

`LocalRuntime.writeLivenessSidecar` が `.specrunner/local/<slug>/liveness.json` に書く。archive / cancel / resume の worktreePath 解決が「state → sidecar → buildWorktreePath 規約」の 3 段 fallback を実装。`isStaleRunning` が sidecarPath 引数で pid 突き合わせ。

### per-step usage append (T-10)

`executor.finalizeStep` が step 完了ごとに `appendInvocation` で `changes/<slug>/usage.json` へ append。`deriveAndWriteUsage` が no-op となり finish 一括派生と `.specrunner/jobs/` 依存が廃止。

### interruption event (T-11)

executor.ts timeout 経路・local.ts signal handler・exit-guard per-job モードが `store.appendInterruption` を呼び journal に 1 件記録。`loadSplitLayout` が `foldResult.lastInterruption` から `resumePoint` を materialize。

### worktree ベース列挙 (T-12)

`JobStateStore.list` が 4 ソース（current checkout slug-based / archive / local worktrees / legacy `.specrunner/jobs/`）と managed marker を合成し jobId dedup。`ps.ts` 既定が `!isTerminal`（active のみ）、`--all` で全件。

### exit-guard per-job モード機能 (T-13 部分)

`createExitGuardHandler(repoRoot, jobId)` が worktrees ディレクトリを scan して対象 job のみを slug ベースストア経由で `awaiting-resume` に遷移。TC-037-1 がこれを検証済み。jobId なし時はグローバルスキャン fallback。

### 再 run 非破壊性 (T-14)

`JobStateStore.create` が毎回新 UUID を生成し、worktree manager が `<slug>-<jobId8>` の新 branch/worktree を作る。旧 branch への force-push・上書きなし。`cancelSingleJob` が jobId 指定で対象 attempt のみ片付ける。

### legacy migration (T-15)

`load()` が split-layout → legacy flat file の順で fallback し、次の `persist()` で split-layout を作成。旧 `.specrunner/jobs/<jobId>.json` は削除しない（非破壊）。

### pullRequest materialize (T-16)

`executor.finalizeStep` が `parsed.pullRequest` を state に反映。`stateToStateJson` が pullRequest を strip しない（`changes/<slug>/state.json` に保持）。

### archive 時 state 保持 (T-17)

`archiveChangeFolder` が `git mv specrunner/changes/<slug>/ specrunner/changes/archive/<dated-slug>/` で change folder ごと移動するため `state.json` / `events.jsonl` / `usage.json` が自動的に含まれる。

---

## 不適合：exit-guard global scan モードが branch state を更新しない

### 該当要件

`spec.md` Requirement「worktree 存在 ⟺ 非終端の不変量と exit-guard」:

> exit-guard（`beforeExit`）は自 worktree の branch state（`state.json` cursor ＋ `events.jsonl`）に `awaiting-resume` を記録 **MUST** し

`request.md` 受け入れ基準:

> worktree 存在 ⟺ 非終端の不変量が保たれ、exit-guard が自 worktree の branch state に `awaiting-resume` を記録して resume が成立する

### 現状の実装

`cli/run.ts` / `cli/resume.ts` が `registerExitGuard(cwd)`（jobId なし）を呼ぶ。内部の `handleGlobalExit` は slug ベースジョブに対して `new JobStateStore(state.jobId, repoRoot)`（slug opts なし）を生成してから `persist` する。

結果として、slug モードの job が `beforeExit` 経由で中断した場合、`awaiting-resume` は `.specrunner/jobs/<jobId>/state.json`（機械ローカル）に書かれ、`changes/<slug>/state.json`（branch 同伴）には書かれない。

### 影響範囲

- SIGINT/SIGTERM の場合: `LocalRuntime.registerCleanup` の signal handler が slug ベースストアへ正しく書き込む → 問題なし
- `beforeExit` 経由（event loop ドレイン中に running のまま終了）の場合のみギャップが生じる
- CI 再 checkout + resume では `isStaleRunning` がサイドカーなし・pid なしを stale と判定して resume を許可するため機能的には回避できる。ただし branch state が `running` のまま残り MUST 要件を満たさない

### 修正の方向性

`handleGlobalExit` で slug ベースストア由来の state を更新する際は slug ベースストアへも書く。具体的には list() が返す state に slug 情報（location から推定可能）を付加するか、list() の結果に store opts を保持させる設計変更が必要。

または pipeline run 開始後に jobId が確定した段階で `createExitGuardHandler(repoRoot, jobId)` を追加登録する方法も有効。
