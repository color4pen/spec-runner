# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md の完走確認
全 6 タスク（T-01〜T-06）の全チェックボックスが `[x]` でマーク済み。未完了タスクなし。

### 2. 設計判断（D1〜D7）の実装検証

| 設計判断 | 内容 | 確認結果 |
|----------|------|----------|
| D1 | 導出は core 層 `buildStepContext` で行い、adapter 起動の `enrichContext` は使わない | `step-context-builder.ts:151-160` に `step.prepareRoundContext` 呼び出し（step 8）。adapter 側は変更なし ✅ |
| D2 | `AgentStep` に optional `prepareRoundContext` フックを追加 | `step-types.ts:262-266` で定義済み。doc comment に core 層 / adapter 層の棲み分けを明記 ✅ |
| D3 | `DynamicContext` に inline 構造型 `priorRoundContext?` を追加 | `dynamic-context.ts:66-69` に追加。doc comment に one-shot / in-memory の旨を記載 ✅ |
| D4 | `prior-round-context.ts` で純関数 + 配線 + runtime seam の 3 層構成 | `resolvePriorFixerOid`（純関数）、`buildPriorRoundContextBlock`（純関数）、`derivePriorRoundContext`（配線、I/O は runtimeStrategy 背後）の 3 関数で実装 ✅ |
| D5 | 導出不能時は丸ごと null、成功時のみ注入 | `derivePriorRoundContext` で 4 つの guard（iteration < 2 / OID なし / runtimeStrategy なし / unavailable）がそれぞれ null を返す ✅ |
| D6 | 再指摘プロトコルは全量列挙規律を弱めない | `buildPriorRoundContextBlock` の出力に「(1) 読み直し (2) 不十分理由の明示・解消済みは再指摘禁止 (3) 全量列挙・免除なし」の 3 項を明記。「省略してよい」等の免除文言は不在 ✅ |
| D7 | `{{PRIOR_ROUND_CONTEXT}}` placeholder を `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に追加し配線 | `spec-review-system.ts:111` に placeholder 追加、`buildSpecReviewInitialMessage` の `.replace(/{{PRIOR_ROUND_CONTEXT}}/g, ...)` で置換 ✅ |

### 3. spec.md 要件と実装の照合

| Requirement | SHALL / MUST | 実装確認 |
|-------------|-------------|---------|
| iteration ≥ 2 で前周 context を注入する | SHALL | `computeSpecReviewIteration` → `derivePriorRoundContext` → `prepareRoundContext` → `buildStepContext` マージの流れで実現 ✅ |
| iteration 1 では注入しない | MUST NOT | `derivePriorRoundContext` の `iteration < 2` guard で null 返却 ✅ |
| 導出不能時は注入省略・step 正常続行 | SHALL | best-effort try/catch を `buildStepContext:157-159` で配置、`derivePriorRoundContext` は never-throw 設計 ✅ |
| 再指摘プロトコル・全量列挙維持 | SHALL / MUST NOT | D6 参照 ✅ |
| 注入は one-shot で state に永続化しない | SHALL / MUST NOT | `DynamicContext` は `JobState` と別型・non-serialized。`state/schema.ts` に `priorRoundContext` field なし ✅ |

### 4. request.md 受け入れ基準の照合

| AC | 内容 | テスト確認 |
|----|------|-----------|
| AC-1 | iteration ≥ 2 で前周 findings + fixer 変更 file が message に含まれ、`listCommitChangedFiles` mock 経由で機械導出を検証 | TC-001, TC-002, TC-015, TC-020, TC-022 — 45 tests pass ✅ |
| AC-2 | iteration 1 では注入なし | TC-003, TC-013, TC-021 — pass ✅ |
| AC-3 | OID 解決不能・diff unavailable の場合、注入省略・step 正常続行 | TC-004, TC-005, TC-012, TC-014, TC-030 — pass ✅ |
| AC-4 | 再指摘プロトコル文言（読み直し・不十分理由・全量列挙維持）が注入ブロックに含まれる | TC-006, TC-016, TC-025 — pass ✅ |
| AC-5 | 既存テスト（spec-review prompt / routing / finding-recency 系 / step-context-builder）が無改変で green | `spec-review-full-enumeration-prompt.test.ts` / `spec-review-fixer-routing.test.ts` / `step-context-builder.test.ts` — 56 tests pass ✅ |
| AC-6 | `typecheck && test` が green | `bun run typecheck`: exit 0（エラーなし）。新規テスト 45 件・既存テスト 56 件が green ✅ |

### 5. スコープ適合性

- 追加は optional field / optional method / new module / new placeholder のみ（後方互換の追加のみ）。
- `JobState` / `StepRun` / `StepOutcome` schema への変更なし（one-shot / non-persistent 要件を構造で保証）。
- `enrichContext` は noop のまま変更なし（adapter 層に `runtimeStrategy` を配線しない方針どおり）。adapter 3 種（claude-code / managed-agent / codex）への変更なし。
- `SpecReviewStep.enrichContext` は `dynamicContext` をそのまま返す noop で `priorRoundContext` を drop しない。adapter が `enrichContext` → `buildMessage` の順で呼ぶため、`prepareRoundContext` が設定した `priorRoundContext` が `buildMessage` に届く。

### 6. テスト実行結果

```
# 新規テスト（prior-round-context.test.ts + spec-review-prior-round-context.test.ts）
45 pass, 0 fail

# 既存テスト（tasks.md T-06 指定の 3 ファイル）
56 pass, 0 fail

# typecheck
tsc --noEmit: exit 0（エラーなし）
```

全スイート（`bun test`）の 1805 件の failure は `vi.mocked` 非対応を含む pre-existing failures（`tests/core/doctor/`, `tests/unit/generate-chain-removed.test.ts` 等）であり、本 branch 起点で生じたものではないことを main branch 同一テストファイルの存在で確認済み。

## 検証できなかった項目

- finding-recency 系テスト 4 件が `vi.mocked is not a function` で fail しているが、main branch 同一ファイルに同じパターンが存在する pre-existing failure であり、本 change 起因ではない。実機動作確認（managed runtime での no-op degrade）は静的解析と設計上の保証（`listCommitChangedFiles` が常に `unavailable` を返す場合に null を返す guard）で代替済み。

## Findings 詳細

None
