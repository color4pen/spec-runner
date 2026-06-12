# Cross-Boundary Invariants Review: test-placement-convention

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

---

## 検査対象

- `src/config/schema.ts` — `TestPlacement` 型 / `testPlacementSchema` / `configSchema.tests` 追加
- `src/prompts/test-placement.ts` — `renderTestPlacementInstruction` 新設
- `src/core/step/implementer.ts` — `buildImplementerInitialMessage` への `placement` 注入
- `tests/config/schema.test.ts` / `tests/prompts/test-placement.test.ts` — テスト追加

---

## 検査結果

### [INFO] `deepMergeObjects` が discriminated union の `style` 切り替え時に余分フィールドを残す

**機構**: `validateConfig` は zod parse の出力ではなく `raw as SpecRunnerConfig` を返す既存設計。`configSchema` の `object()` は余分フィールドを strip するが、この strip は呼び出し元に届かない。

**発生条件**: user-global に `tests.placement: { style: "mirror", testsRoot: "X" }` が設定され、project-local が `tests.placement: { style: "sibling" }` で上書きするとき、`deepMergeObjects` の再帰マージにより `{ style: "sibling", testsRoot: "X" }` が返る。

**影響評価**: `renderTestPlacementInstruction` は `placement.style === "sibling"` で分岐し、sibling ブランチ内で `testsRoot` を参照しない。runtime で誤った挙動は起きない。`testsRoot` は dead passenger として残るが、renderer・型・テストのいずれも正しく動作する。

**既存パターンとの整合**: `verification`（`unknown` passthrough）、`steps`（record 再帰マージ）と同じ扱い。本変更が新たなクラスのリスクを導入したわけではない。

**残存リスク**: 将来 sibling ブランチで `testsRoot` を誤参照するコードが追加された場合に無音で誤動作しうる。現状は問題なし。

---

### [INFO] `configSchema` のフィールド順コメントが陳腐化している

`configSchema` の JSDoc（line 596–598）は "runtime → ... → archive" と列挙しているが、`inbox`・`transientRetry`・`tests` が含まれていない。本変更以前から不完全だったコメントに `tests` が加わっても更新されていない。機能的影響なし。

---

### [INFO] system prompt line 49 との指示競合はリスクとして設計に記載済み

`IMPLEMENTER_SYSTEM_PROMPT` line 49 の「既存テストの配置パターンに従う」は変更されていない。user message 末尾の placement セクションが「この指示は既定方針より優先する」と明記することで競合を解消する設計（D2）。LLM が proximate な user message を優先する前提は design.md Risks に明記されており、cross-boundary invariant の違反ではなく設計上の既知リスク。

---

## 不変条件の充足確認

| 不変条件 | 判定 | 根拠 |
|---|---|---|
| `placement` 未設定時のメッセージがバイト同一 | ✓ | `placementSection = ""` → `${contextSection}${""}` で完全一致 |
| `IMPLEMENTER_SYSTEM_PROMPT` が無改変 | ✓ | diff に `implementer-system.ts` の変更なし。TC-015 が内容を固定 |
| test-case-gen system prompt に placement 言及なし | ✓ | diff に `test-case-gen-system.ts` の変更なし。TC-010 が固定 |
| test-coverage 検出ロジックが無改変 | ✓ | diff に `test-coverage.ts` の変更なし |
| config 検証エラーが既存 `throwFromFirstIssue` 経路を通る | ✓ | schema に `tests: optional(object({ placement: optional(testPlacementSchema) }))` を追加。失敗は `CONFIG_INVALID: tests.placement ...` として throw |
| `RawConfig.tests` の passthrough パターンが既存 `verification` と一致 | ✓ | `tests?: unknown` — `verification?: unknown` と同形 |
| `deps.config.tests?.placement` アクセスが型安全 | ✓ | `SpecRunnerConfig.tests?: TestsConfig` 追加。`StepContext.config: SpecRunnerConfig` 経由で型付きアクセス |
