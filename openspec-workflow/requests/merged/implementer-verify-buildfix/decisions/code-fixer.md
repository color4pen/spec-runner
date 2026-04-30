# Code Fixer Decision Log — implementer-verify-buildfix

## Fix History

### Iteration 1

**Finding #1 (HIGH) — BuildFixerStep.buildMessage state mutation**

対応指摘: #1 (HIGH / correctness)
修正ファイル:
- `src/core/step/build-fixer.ts`
- `src/core/step/executor.ts`
- `tests/unit/step/build-fixer.test.ts`

`BuildFixerStep.buildMessage` を純粋関数化する :: `Step.buildMessage` インターフェースは "Pure function — no I/O allowed" を宣言しており、state mutation は契約違反。さらに executor が `buildMessage` 後に `state.status` を確認しないため、`BUILD_FIXER_NO_VERIFICATION_RESULT` エラーが silent に飲まれ `store.update(state, { status: "success" })` で上書きされる実害がある。

修正内容:
- `buildMessage` で verification result が不在の場合、`state` を変更せず `SpecRunnerError(BUILD_FIXER_NO_VERIFICATION_RESULT, ...)` を throw するよう変更
- `runPollingStyleStep` の `buildMessage` 呼び出しを try/catch で囲み、throw 時は `recordFailedStepResult` → `store.fail` → `store.persist` → `attachStateAndRethrow` でパイプラインを停止。セッション作成には進まない
- TC-016 テストを更新: 「state.status='failed' かつ state.error が設定される」(mutation確認) から「throw する かつ state を変更しない」(純粋関数契約確認) に変更。error.code / error.hint の検証も throw から取得する形に修正
