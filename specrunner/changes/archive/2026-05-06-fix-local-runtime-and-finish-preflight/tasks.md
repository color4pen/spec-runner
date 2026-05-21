## 1. AgentStep interface 拡張

- [x] 1.1 `src/core/step/types.ts` の `AgentStep` interface に `setsBranch?: boolean` フィールドを追加する
- [x] 1.2 `src/core/step/propose.ts` の `ProposeStep` に `setsBranch: true` と `completionVerdict: "success"` を設定する

## 2. executor.ts local runtime path の修正

- [x] 2.1 `src/core/step/executor.ts` の `runAgentStep` local runtime path で `resultContent === null` かつ `step.completionVerdict` が定義されている場合に `step.completionVerdict` を verdict として使用するロジックを追加する
- [x] 2.2 同 local runtime path で `step.setsBranch === true && !jobState.branch` のとき `state.branch = "feat/${deps.slug}"` を設定するロジックを追加する
- [x] 2.3 TC-003 が green であることを確認する（executor.ts に step 名ハードコードがないこと）

## 3. review-verdict parser の寛容化

- [x] 3.1 `src/core/parser/review-verdict.ts` の `parseReviewVerdict` regex を拡張して大文字 V / `- ` prefix なし / bold なし等のフォーマット揺れにマッチさせる
- [x] 3.2 review-verdict.test.ts に新パターン（`**Verdict**:`, `Verdict:`, `- verdict:`）のテストケースを追加する

## 4. finish preflight MERGED bypass

- [x] 4.1 `src/core/finish/preflight.ts` の `fetchPrViewWithRetry` で `mergeStateStatus === "UNKNOWN"` の retry 前に `parsed.state === "MERGED"` を判定し、MERGED なら即 `{ ok: true, data: parsed }` を返すロジックを追加する
- [x] 4.2 preflight.test.ts に MERGED + UNKNOWN のテストケースを追加する（TC-106 相当: orchestrator の prAlreadyMerged path に到達する検証）

## 5. テスト修正と検証

- [x] 5.1 finish-orchestrator.test.ts の MERGED PR テストケースで `mergeStateStatus: "UNKNOWN"` を返すモックに修正する（GitHub の実挙動再現）
- [x] 5.2 `bun run typecheck` が pass することを確認する
- [x] 5.3 `bun test` が全テスト green であることを確認する
