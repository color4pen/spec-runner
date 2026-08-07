# Conformance Result — dedup-verified-safe — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md

全タスクのチェックボックス [x] を確認。T-01〜T-09 すべて完了済み。

### design.md

D1〜D8 の実装を src/ で確認。

| 決定 | 確認内容 |
|------|---------|
| D1 run/job-start 統合 | `command-registry.ts:371` — `RUN_JOB_FLAGS` 定数、`:380` — `runJobHandler` 関数。`run` コマンドと `job start` サブコマンドの両エントリが同一の `handler: runJobHandler` を参照し、`positional.name` だけ別値（`"request.md|slug"` / `"slug|file"`） |
| D2 compute*Iteration 削除 | `code-review.ts`, `spec-review.ts`, `request-review.ts`, `conformance.ts` で `nextIteration` を直接呼び出し。4 シンボルは src/ に 0 件 |
| D3 detectPackageManager 置換 | `detect-pm.ts:58-61` — `findLockfile(cwd, fs)` 呼び出しに置換。phase-1 インライン walk は消去済み |
| D4 loadConfig 委譲 | `store.ts:78` — `return (await loadConfigWithSourceMetadata(repoRoot)).config;` の 1 行 |
| D5 journal append 統合 | `job-journal.ts:191` — `private _appendRecord`. 4 つの named public method は `return this._appendRecord(record)` に変更。`appendEventRecord` の実際の呼び出しは 1 箇所のみ（import 宣言を除く） |
| D6 verification tail 抽出 | `runner.ts:320` — `finalizeVerificationRun`. `skipLabel: "command" | "phase"` でスキップ文言を生成。テンプレート `_(skipped — previous ${skipLabel} failed)_` |
| D7 worktreePath helper | `src/core/resume/resolve-worktree-path.ts` 新規作成。`resume.ts:274` と `reopen.ts:309` が `resolveLivenessWorktreePath` を import・呼び出し |
| D8 dead code | `PROBE_SLUG` alias 削除済み（`VALIDATOR_PROBE_SLUG` を 2 か所で直接使用）。空 if block は `job-state-projection.ts` から消去（grep "Counters are stale" → 0 件）。`enrichContext` は意図的残置（後述 F-02） |

### spec.md

| 要件 | Scenario | 確認結果 |
|------|----------|---------|
| run / job-start 同一挙動 | 同一 slug → 同一 pipeline | ✅ 同一 `runJobHandler` 参照 |
| run / job-start help ラベル維持 | --help で positional 名表示 | ✅ CommandEntry の `positional.name` が個別管理 |
| skip 文言 byte-identical (command) | command 経路スキップ | ✅ `skipLabel: "command"` → `_(skipped — previous command failed)_` |
| skip 文言 byte-identical (phase) | phase 経路スキップ | ✅ `skipLabel: "phase"` → `_(skipped — previous phase failed)_` |
| 削除シンボルが src/tests/ に 0 件 | grep チェック | ⚠️ src/ は 0 件。tests/ の test 説明文字列・string literal に残存（詳細 F-03） |

### request.md 受け入れ基準

| 基準 | 確認結果 |
|------|---------|
| 既存 test 無改変で green | ✅ 修正されたテストファイル: 0 件。追加: 1 件（`dedup-verified-safe.test.ts`）。727 ファイル passed、1 skip |
| verification skip 文言不変 | ✅ |
| run / job start --help 不変 | ✅ |
| 削除シンボル grep 0 件 | ⚠️ src/ は完全 0 件。tests/ の文字列リテラル・説明文字列に残存（F-03） |
| typecheck && test green | ✅ verification-result.md: passed |

## 検証できなかった項目

- `run --help` / `job start --help` の実際の出力比較（CLI を起動できない環境のため、コード上での確認のみ）
- skip 文言の実際の markdown 出力（テスト結果の確認で代替）

## Findings 詳細

### F-01 — Requirement 5 部分実装：public `appendRecord` なし、呼び出し側未変更

**request.md 要件 5**: "journal append wrapper 4 組を、両クラスとも union 型 1 引数の `appendRecord` 1 メソッド（+ 委譲）に統合する。呼び出し側は機械的に追随する"

**実装**: private `_appendRecord` のみ追加。public `appendRecord` は作成されず、JobStateStore も変更なし。呼び出し側（`appendInterruption` 等の named method を呼ぶコード）は変更なし。

**design.md D5 の根拠**: 既存テストが named method へのスパイを assert しているため（`executor-sequential-regression.test.ts:352`、`signal-handler-order.test.ts:68`、`artifact-observability.test.ts:215`）、public API を変更すると「既存 test 無改変」の受け入れ基準に違反する。

**論点**: 要件 5 の literal と受け入れ基準の間に競合がある。内部 dedup（private method）は達成済みで、外部 API 統合（public appendRecord + 呼び出し側変更）が未達。

### F-02 — Requirement 8 部分: `enrichContext` 残置

**request.md 要件 8**: "identity `enrichContext` を削除する"

**実装**: `spec-review.ts:93-95` に `return dynamicContext;` の identity 実装が残存。design.md D8 が「意図的残置に決定変更」と明記。

**根拠**: `tests/prompts/spec-review-system.test.ts`（TC-003/TC-010）と `tests/pipeline-integration.test.ts:1239-1246` が method の存在を assert。削除には既存テストの改変が必要。

**影響**: 挙動上は完全に no-op（optional method が不在でも adapter の `?? dynamicContext` で同一結果）。技術的負債としての重大度は低い。

### F-03 — Spec.md「SHALL NOT appear anywhere in tests/」の文言精度

**spec.md**: "The symbols ... SHALL NOT appear anywhere in `src/` or `tests/` after this change."

**現状**: `tests/unit/step/io-iteration.test.ts`（変更なし）の test 説明文字列に `computeCodeReviewIteration`・`computeSpecReviewIteration` が残存。`tests/dedup-verified-safe.test.ts`（新規）の string literal に `PROBE_SLUG` が残存（不在チェックのテストコードとして）。

**影響**: コードシンボルとして使用されている箇所は src/ に 0 件。tasks.md T-09 も「残存は comments/test-description strings であり code symbol ではない」と注記済み。spec の文言が intent より広すぎる（「コード識別子として現れない」が正確な意図）。
