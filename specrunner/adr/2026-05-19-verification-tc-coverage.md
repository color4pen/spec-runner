# ADR: TC Coverage Verification in Verification Phase

**Date**: 2026-05-19
**Status**: Accepted

## Context

PR #331 (verbose-execution-log) の escalation 分析で、verification step に TC 網羅性の機械的検証が欠如していることが発見された。

具体的な事例:
- `test-cases.md`: 40 TC 生成
- implementer 自己申告: `tasks_completed: 11/11`、「全タスク完了」
- 実装した test に TC ID 記載があるもの: 12 件のみ
- 残り 28 件は TC ID 未記載 / 実装漏れ / 「out of scope」自己判断が混在
- → code-review 段で初めて「TC-XX 未実装」が発覚 → code-fixer maxRetries=2 到達 → escalation halt

根本原因は `feedback_verify_dont_trust` の典型: implementer の自己申告（`completionVerdict: "success"` は session 終了 = 無条件 hardcoded）が機械的な検証なしにパスしていた。

`feedback_llm_uncertainty_principle` に基づき、「全部実装したか」を agent に自己判断させず、tool で機械的に検証する設計に移行する。

## Decision

verification step の 6 番目 phase として `test-coverage` を追加し、`must` TC の実装漏れを機械的に検出する。実装方針の核心:

1. **TC 網羅性の検証責務は verification に集約する**（implementer completionVerdict は変更しない）
2. **TC ID 形式はフラット型 `TC-NNN` を正規形式とする**（grep パターンは両形式許容）
3. **test-coverage phase は CLI 内部処理として実装する**（package.json script spawn の対象外）

## ADR Decisions

### 1. TC ID 形式の統一 — フラット型 `TC-NNN` を正規形式とする

**Decision**: フラット型 `TC-NNN` を正規形式とする。grep パターンは両形式許容 (`TC-\d+(?:-\d+)*`) で実装する。

**Alternatives considered**:
- 階層型 `TC-10-01` のみ: PR #331 で導入されたが、test-case-gen prompt の既定形式と不一致
- 完全一致のみ（正規化なし）: `TC-10-01` → `TC-1001` 変換は採用しない

**Rationale**: test-case-gen prompt が既に `TC-{NNN}` フラット型を例示しており、変更量最小。既存の階層型 test（PR #331）を壊さないために grep は両形式対応。test-cases.md 内の TC ID 文字列と test code 内の TC ID 文字列の完全一致（単語境界付き）で判定する。

### 2. implementer completionVerdict — 案 B (verification 集約)

**Decision**: 案 B を採用。implementer の `completionVerdict: "success"` はそのまま維持。TC 網羅性の機械的検証は verification の test-coverage phase に集約する。

**Alternatives considered**:
- 案 A: `implementation-notes.md` の `tasks_completed: N/M` を non-null 化し、M ≠ 完了数なら success を出さない
  - 問題: `resultFilePath: null` が現状であり、implementer に結果ファイル生成を要求する大幅な変更となる

**Rationale**:
- verification は既に「implementer の自己申告を信頼しない機械的ゲート」として機能している（build/test/lint 失敗の検出）。TC 網羅性検証もこの責務に自然に合致する
- 案 B は既存の verification ↔ build-fixer ループに乗るため、pipeline 遷移テーブルの変更が不要
- implementer の責務は「実装して worktree に書き出す」に留め、検証は downstream に委ねる設計原則と整合

### 3. test-coverage phase の実行方式 — CLI 内部処理

**Decision**: test-coverage phase は CLI 内部処理として `runVerification` 内で直接実行する。`PHASE_SCRIPTS` マッピングには追加しない。

**Alternatives considered**:
- package.json script として実装: `bun run test:coverage` 相当のスクリプトを target project に要求
  - 問題: test-cases.md のパスは specrunner 固有（`specrunner/changes/<slug>/test-cases.md`）であり、target project の package.json に依存させるのは不適切

**Rationale**:
- test-cases.md パース + grep は純粋な file I/O であり、子プロセス spawn のオーバーヘッドが不要
- `PHASE_SCRIPTS` の型を `Record<ScriptPhaseName, string>`（`ScriptPhaseName = Exclude<PhaseName, "test-coverage">`）にすることで、`phaseName in PHASE_SCRIPTS` が型ガードとして機能する
- runner.ts のループ内で `phaseName in PHASE_SCRIPTS` で分岐し、`test-coverage` のみ専用関数 `runTestCoveragePhase` を呼ぶ設計で既存 phase との対称性を保つ

## Fail-fast Phase Order

```
build → typecheck → test → lint → security → test-coverage
```

`test-coverage` を末尾に置く理由:
- test phase が green でないと TC 網羅性を測る意味がない（test 自体が壊れている状態で coverage を見ても無駄）
- build-fixer が test-coverage 失敗を受け取った時点で build/typecheck/test/lint/security は全て green であることが保証される
- lint 修正で test code が変わる可能性があるため、lint 通過後に検証する

## Consequences

- `test-cases.md` が存在しない change（test-case-gen step がスキップされたケース）では test-coverage phase は `status: "skipped"` となり、verification verdict に影響しない
- build-fixer は `verification-result.md` の `## Phase: test-coverage` セクションから missing TC リストを読み取り、対応する test を追加する（既存の verification ↔ build-fixer ループを流用）
- 既存 test の retrofit（過去の test への TC ID 追記）はスコープ外。本 request 以降の新規 test にのみ規律が適用される
- TC ID の substring 一致問題（`TC-1` が `TC-10` にヒットするリスク）は、test-case-generator prompt が `TC-{NNN}` 3桁ゼロ埋めを推奨することで緩和する。完全な解決は単語境界付き正規表現照合への移行で対応可能（後続 issue）
