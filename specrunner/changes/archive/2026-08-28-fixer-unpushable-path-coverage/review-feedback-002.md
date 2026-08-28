# Code Review Feedback — fixer-unpushable-path-coverage — Iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Diff 範囲

`git diff main...HEAD --stat` で確認した変更ファイル:

| ファイル | 変更 |
|---|---|
| `src/core/step/fixer-helpers.ts` | +23行 — `buildUnpushablePathContracts` ヘルパー追加 |
| `src/core/step/code-fixer.ts` | +27行 — `outputContracts` メソッド + 全8 return path に `capabilityNotice` |
| `src/core/step/spec-fixer.ts` | +21行 — `outputContracts` メソッド + 全5 return path に `capabilityNotice` |
| `src/core/step/executor.ts` | +11/-19行 — executor gate で `unpushable-path` contract を除外 |
| `src/core/step/__tests__/fixer-push-capability.test.ts` | +758行 — 新テストファイル（29テスト） |
| `tests/unit/step/unpushable-path-escalation.test.ts` | +103行 — TC-014を新しいgate semanticsに対応 |

インフラファイル（`implementer.ts`, `request-review.ts`, `step-context-builder.ts`, `output-verify.ts`, `commit-push.ts`）は `git diff main` で未変更を確認。

### 受け入れ基準 — AC-1（notice injection）

`code-fixer.ts` L129: `const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` を `buildMessage` の先頭（分岐前）で計算。全8 return path で `+ capabilityNotice` を確認:

1. Conformance branch, continuation (L138-144) ✓
2. Conformance branch, initial (L147-164) ✓
3. Coordinator loop, continuation (L175-186) ✓
4. Coordinator loop, aggregated findings (L189-206) ✓
5. Coordinator loop, fallback / no-findings (L210-232) ✓
6. Normal path, continuation (L256-264) ✓
7. Normal path, with findings (L267-285) ✓
8. Normal path, findingsPath fallback (L288-304) ✓

`spec-fixer.ts` L119: 同様。全5 return path を確認:

1. Conformance branch, continuation (L126-132) ✓
2. Conformance branch, initial (L135-152) ✓
3. Normal path, continuation (L163-169) ✓
4. Normal path, with findings (L172-190) ✓
5. Normal path, findingsPath fallback (L194-198) ✓

notice の配置（`</user-request>` 後）は `implementer.ts` の既存パターンと一致。

テスト: TC-001–003, TC-006–009, TC-016, TC-017, TC-022, TC-023 — 全 pass。

### 受け入れ基準 — AC-2（outputContracts / Layer 1）

`CodeFixerStep.outputContracts` (L84-86) / `SpecFixerStep.outputContracts` (L87-89) が `buildUnpushablePathContracts(deps)` を返すことを確認。

`fixer-helpers.ts` L187-197: `kind: "unpushable-path"`, `policy: "follow-up"`, `patterns: deps.pushCapability.patterns` の構造は `implementer.ts` L269-276 と同形。

`step-context-builder.ts` L128: `step.outputContracts?.(state, deps)` を直接読み、executor gate とは独立して `OutputVerificationPolicy` を構築（変更なし）。

テスト: TC-004, TC-005, TC-010–014 — 全 pass。TC-015 チェーン検証も pass。

### 受け入れ基準 — AC-3（Layer 2 backstop）

`executor.ts` L479-492: `finalizeStepArtifacts`（commitAndPush Layer 2）から投げられた `UnpushablePathBlockedError` を捕捉し `makeUnpushablePathHalt` → `awaiting-resume` halt に変換するコードが存在することを確認。`matchedPaths` は型付きプロパティから直接読む（正規表現パースなし）。

### 受け入れ基準 — AC-4（implementer / request-review 不変）

`git diff main -- src/core/step/implementer.ts src/core/step/request-review.ts` → 出力なし（未変更）。

### 受け入れ基準 — AC-5（typecheck / test / architecture green）

verification-result.md（iter 1）より:
- build: passed, typecheck: passed, test: passed（12599 passed, 1 skipped, 2 todo）
- lint: passed, changed-line-coverage: passed

`fixer-push-capability.test.ts` 29テスト全 pass（最低18件の要件を超過）。

### Executor Gate の設計変更（計画外追加）

`executor.ts` の変更は design.md / tasks.md に記載がない追加変更。変更内容:

- **Before**: `buildAllOutputContracts` に `unpushable-path` を含め、violation を検出したら `makeUnpushablePathHalt` を gate で即時発動（`finalizeStepArtifacts` の前）
- **After**: `unpushable-path` contract を gate から除外（`.filter((c) => c.kind !== "unpushable-path")`）。Layer 2（`commitAndPush` → `UNPUSHABLE_PATH_BLOCKED`）が `finalizeStepArtifacts` 内で発動

変更理由（コードコメントに記載）: executor gate は `commitAndPush` の `git reset --mixed` 正規化より前に実行されるため、agent が self-commit した unpushable path が gate で誤検知される偽陽性 halt が発生しうる。Layer 2 は mixed-reset 後に実行されるため最終 publishable 状態を正確に評価できる。

Layer 1（follow-up prompt）は `step-context-builder.ts` が `step.outputContracts` を独立して読むため影響なし。

### TC-017 のカバレッジ

TC-017 test fixture (`makeCodeFixerCoordinatorState`) は `security` reviewer に findings を持つ。このため test は coordinator loop の **aggregated findings sub-path**（L189-206）を通る。

coordinator loop の **fallback sub-path**（L210-232: findings なし、members 存在）は明示的にテストされていない。コード L232 は `+ capabilityNotice` を持つが、そのパスを通るテストケースがない。

（TC-017 は priority: should のため非ブロッキング）

## 検証できなかった項目

- TC-015（integration）の実際の code-fixer → executor → Layer 2 のエンドツーエンドパス（unit test チェーン方式で代替されており、`unpushable-path-escalation.test.ts` が Layer 2 の integration coverage を別途提供している）

## Findings 詳細

### F-1: executor.ts 変更が計画外（severity: low）

design.md / tasks.md に `executor.ts` の変更は記載がない。変更内容は correctness 改善（偽陽性 halt の回避）であり spec の Layer 2 定義との整合を高めるが、スコープ外追加である。既存テストが全て pass しており動作上の問題はない。

### F-2: TC-017 coordinator loop fallback path 未テスト（severity: low）

`code-fixer.ts` L210-232（coordinator loop, aggregated findings なし, members 存在）のパスで `capabilityNotice` が付与されることを確認するテストがない。TC-017 は priority "should" のため非ブロッキング。コード実装は正しい（L232 確認済み）。
