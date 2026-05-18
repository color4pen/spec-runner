# Code Review Feedback — one-shot-query-wrapper — iter 1

## Summary

- **verdict**: approved
- **scope**: `src/adapter/claude-code/query-one-shot.ts` (NEW), `src/core/request/reviewer.ts` (MODIFIED), `src/errors.ts` (MODIFIED), `tests/unit/adapter/claude-code/query-one-shot.test.ts` (NEW), `src/core/request/manager.ts` (MODIFIED), delta spec (NEW)
- **verification**: build ✅ / typecheck ✅ / test ✅ (177 files, 2143 tests)

---

## Findings

### [LOW] #1 — `as unknown as QueryFn` 二重キャストが2箇所に存在する

- **location**: `src/adapter/claude-code/query-one-shot.ts` L90, `src/core/request/manager.ts` L36
- **description**: `sdkQuery as unknown as QueryFn` / `query as unknown as QueryFn` の二重キャストが生じている。`QueryFn` の型定義 (`prompt: string | AsyncIterable<unknown>`) が SDK の実際のシグネチャとずれているため、キャストで吸収している。
- **assessment**: `agent-runner.ts` に既存のパターンと一貫しており、DI for testability の既知トレードオフ。本 PR 内で解決すべき問題ではない。将来 `QueryFn` を SDK の実際の型に近づけるリファクタリングの際に対応すればよい。

### [LOW] #2 — timeout 判定のエッジケース (外部 abort との衝突)

- **location**: `src/adapter/claude-code/query-one-shot.ts` L131-139
- **description**: `abortController.signal.aborted && timeoutId !== undefined` で timeout を判定している。`timeoutMs` が設定されている状態で外部から abort された場合、誤って `QUERY_ONE_SHOT_TIMEOUT` が throw される可能性がある。
- **assessment**: 現在 `AbortController` を caller に公開する API はなく、実際の混入経路は存在しない。将来 opts に `signal?: AbortSignal` を追加する場合は要対処。現状は問題なし。

### [LOW] #3 — `manager.ts` L17: `create()` の `queryFn` 型が `typeof query` のまま

- **location**: `src/core/request/manager.ts` L17
- **description**: 同一ファイル内で `create()` が `typeof query`、`review()` が `QueryFn` と型が揃っていない。generator.ts の migration は本 PR スコープ外であり intentional だが、読者に一見不統一に映る。
- **assessment**: スコープ外として意図的に残された差異。将来 generator が queryOneShot に移行した時点で統一される。問題なし。

---

## Test Coverage Check (test-cases.md must scenarios)

| TC ID | Priority | Status |
|-------|----------|--------|
| TC-OSQ-01 | must | ✅ covered (`TC-OSQ-01` describe block, text/sessionId/stopReason assert) |
| TC-OSQ-02 | must | ✅ covered (AbortController mock + `QUERY_ONE_SHOT_TIMEOUT` assert) |
| TC-OSQ-03 | must | ✅ covered (config.steps["request-review"].maxTurns=10 + capturedOptions assert) |
| TC-OSQ-04 | must | ✅ covered (`managed-sess-42` sessionId propagation) |
| TC-OSQ-05 | must | ✅ covered (`error_during_execution` + no-result cases) |
| TC-ERR-01 | must | ✅ `errors.ts` に QUERY_ONE_SHOT_FAILED / QUERY_ONE_SHOT_TIMEOUT が存在 |
| TC-RR-01 | must | ✅ reviewer.test.ts regression (TC-RVR-011 含む全 18 ケース green) |
| TC-RR-02 | must | ✅ reviewer.ts に `getStepExecutionConfig` / `AbortController` / `for await` の直接使用なし |
| TC-TYPE-01 | must | ✅ QueryOneShotOptions 全フィールド定義済み (typecheck green) |
| TC-TYPE-02 | must | ✅ QueryOneShotResult 全フィールド定義済み (typecheck green) |

---

## 受け入れ基準チェック

- [x] `src/adapter/claude-code/query-one-shot.ts` で `queryOneShot` 関数が実装されている
- [x] `QueryOneShotOptions` interface が定義されている (systemPrompt / prompt MUST、allowedTools / maxTurns / timeoutMs / cwd / stepName / model optional)
- [x] `QueryOneShotResult` interface が定義されている (`text: string` MUST、sessionId / turnCount / stopReason optional)
- [x] 既存 `request-review` の `runReview()` が `queryOneShot` 経由に置き換えられている
- [x] 既存 reviewer.test.ts の regression なし (TC-RVR-001〜018 green)
- [x] `tests/unit/adapter/claude-code/query-one-shot.test.ts` が追加され green
- [x] `bun run typecheck && bun run test` が green (verification-result.md 参照)
- [x] delta spec `specrunner/changes/one-shot-query-wrapper/specs/one-shot-query/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている

---

## 総評

実装は設計仕様 (design.md) に忠実で、boilerplate の削減目的を達成している。reviewer.ts は ~55 行のインライン実装から `queryOneShot` 呼び出し + `parseReviewOutput` の ~15 行へ整理された。型安全性・テスト網羅・delta spec の整合性いずれも問題なし。指摘はすべて LOW で対処不要。

- **verdict**: approved
