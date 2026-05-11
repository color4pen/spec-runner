# Spec Review Result — persistence-unification

- **reviewer**: spec-reviewer
- **date**: 2026-05-09
- **verdict**: approved

## Summary

behavior-preserving リファクタリングとして設計は妥当。永続化パスの `JobStateStore` 一元化、正規化ロジックの `schema.ts` 統一、`state/store.ts` の deprecated facade 化の三本柱が明確に構造化されている。タスク分解は要件を網羅しており、依存順序も正しい。MEDIUM 2 件は実装時に対処可能。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | design.md:49-53, tasks.md:17 | D2 で `static load(jobId)` を追加すると記述しているが、delta spec の Static Methods には含まれず、Task 3.2 は `new JobStateStore(jobId).load()`（instance method）を使用。設計とタスクで実装パスが不一致 | D2 の記述を instance method 委譲に修正するか、delta spec に static `load` を追加してタスクと整合させる |
| 2 | MEDIUM | correctness | design.md:96-98, tasks.md:26-28 | finish/resume の移行後、`JobStateStore.load()` を直接呼ぶ箇所で ENOENT → `JOB_NOT_FOUND` のエラーラッピングが失われる。現在の `loadJobState` は ENOENT/JSON parse error を `SpecRunnerError` でラップしユーザー向け hint を付与している。`JobStateStore.load()` にはこのラッピングがない | `JobStateStore.load()` に ENOENT → `JOB_NOT_FOUND`、JSON parse → `STATE_FILE_INVALID` のエラーラッピングを追加する。または Task 4.x/5.x の移行先で個別にラッピングする方針を tasks.md に明記する |
| 3 | LOW | correctness | design.md:102 | `normalizeSteps`（schema.ts:194）の fallback timestamp は `new Date().toISOString()` だが、`normalizeStepsToStepRuns`（job-state-store.ts:219）は `updatedAt` を使用。統一後はレガシーデータの step run timestamp が state の `updatedAt` ではなく読み込み時刻になる | Risks で言及済みだが具体差分が未特定。`normalizeSteps` に `fallbackTs` 引数を追加するか、差分を許容する判断を明記する |

## Evaluation

### Architecture

設計パターンは適切。`JobStateStore` を単一永続化 authority とし、`schema.ts` を canonical な validation + normalization レイヤー、`state/store.ts` を deprecated re-export facade とする三層構造は責務分離が明確。static メソッド（`create`, `delete`, `list`, `resolveId`）と instance メソッド（`load`, `persist`, `update`, `fail`）の分割基準（jobId の有無）も一貫している。依存方向は CLI layer → `JobStateStore` → `schema.ts` で循環なし。

### Correctness

D1 の正規化統一は `validateJobState` が既に backward compat 処理（status remap, error code remap, slug default, `normalizeSteps`）を一括実行しているため、`load()` からの呼び出しで網羅できる。D3 の `updateJobState` 委譲は read-modify-write パターンを維持しており安全。D4-D6 の static メソッド移動はロジック同一で import パスが変わるのみ。Finding #1, #2 は実装時に解決可能な粒度。

### Completeness (task decomposition)

request.md の 7 要件すべてに対応するタスクが存在する。受け入れ基準 5 項目はタスク 7（typecheck + test）で検証される。タスク順序（正規化統一 → static メソッド追加 → 委譲化 → caller 移行 → delta spec → 検証）は依存関係を正しく反映している。
