# Review Feedback: absorb-build-fixer (Iteration 1)

## 検証した項目

- `git diff main...HEAD --stat` で変更スコープ確認（83 files、3752 insertions / 1192 deletions）
- `src/core/pipeline/types.ts` — STANDARD/FAST 遷移表の `VERIFICATION failed → IMPLEMENTER` 置換と `verificationFailedLast` ガード挿入順序
- `src/core/pipeline/reverification.ts` — `verificationFailedLast` 実装、`IMPL_CODE_MUTATOR_STEPS` から build-fixer 除去、stale JSDoc 確認
- `src/core/pipeline/registry.ts` — `loopFixerPairs[VERIFICATION] = IMPLEMENTER` 変更、steps/roles から build-fixer 除去
- `src/core/step/implementer.ts` — `enrichContext`、`buildImplementerRecoveryMessage`、`buildMessage` の recovery 分岐
- `src/core/step/step-context-builder.ts` — `resumeSessionId` 算出の `verificationFailedLast` 条件拡張
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES = {"build-fixer": IMPLEMENTER}` による resume 互換
- `src/core/port/step-types.ts` — `enrichContext` インターフェース定義と adapter での呼び出し確認
- `src/adapter/claude-code/agent-runner.ts` — `enrichContext` が adapter で呼ばれることを確認
- 削除確認: `build-fixer.ts`、`build-fixer-system.ts`、`build-fixer-system.test.ts`、`coverage-gate-prohibition.test.ts`
- 新規テスト 4 ファイル: `transitions.test.ts`、`implementer-recovery.test.ts`、`state-compat.test.ts`、`pipeline-exhaustion.test.ts` の各 TC
- `tests/unit/core/pipeline/pipeline.reverification.test.ts` — TC-003/TC-004 の本文が implementer 再入に更新されていることを確認

## 検証できなかった項目

- `typecheck && test` の実行結果（verification-result.md に記録された CI 結果を直接確認できなかった。state.json 上は implementer まで進行中）

## Findings 詳細

### [MEDIUM] TC-003 — 「失敗内容が message に含まれる」が未テスト

**場所**: `tests/unit/absorb-build-fixer/implementer-recovery.test.ts`（TC-003 describe, line 115–144）

受け入れ基準「再入 implementer が直前 session の継続として起動され、**失敗内容が message に含まれること**をテストで固定する」の後半部分がカバーされていない。

TC-003 テストは `ctx.session.resumeSessionId === prevSessionId` のみ確認。`deps.dynamicContext` が `undefined` のため `verificationContent` がなく、`buildFailureSection` が空文字を返すケースのみテストされている。`verificationContent` に実際の failure データを渡したとき `## Verification Failures` セクションが message に現れることを確認するテストが存在しない。

同様に TC-004 も「message には失敗内容が含まれる」(test-cases.md の THEN) を確認する assertion がない。

コード自体は正しく動作する（`buildImplementerRecoveryMessage` は `buildFailureSection(verificationContent)` を呼ぶ）が、テストで固定されていない。

**修正方針**: TC-003 / TC-004 に `ImplementerStep.buildMessage(state, depsWithVerificationContent)` を呼び、`"## Verification Failures"` または失敗 phase 文字列が含まれることを assert する。

---

### [LOW] stale JSDoc in edited file — `reverificationNeeded` が build-fixer を参照

**場所**: `src/core/pipeline/reverification.ts:92–93`

`reverificationNeeded` の JSDoc が「impl-phase mutator step (implementer / **build-fixer** / code-fixer)」と記述しているが、同ファイル line 20–23 の `IMPL_CODE_MUTATOR_STEPS` から build-fixer は除去済み。T-08 の適用漏れ。

```diff
- *       build-fixer / code-fixer) ran more recently than the last verification run
+ *       code-fixer) ran more recently than the last verification run
```

---

### [LOW] stale file header in edited file — `pipeline.reverification.test.ts` TC-003/TC-004

**場所**: `tests/unit/core/pipeline/pipeline.reverification.test.ts:6–7`

ファイルヘッダーコメントの TC-003「再検証 failed は build-fixer へ流れる」/ TC-004「build-fixer 回復後に...」が未更新。実際の `describe` 本文（line 375, 456）は正しく implementer に更新されている。

---

### [LOW] TC-015 の順序検証が `verificationFailedLast` 行を直接固定していない

**場所**: `tests/unit/absorb-build-fixer/transitions.test.ts:220–235`

`findIndex(t.when !== undefined)` が最初にマッチする `isTestGenExempt` 行（types.ts:280）を返すため、実際に確認したい `verificationFailedLast` 行（types.ts:283）の BITE_EVIDENCE 前の配置が直接的に固定されていない。

実装は正しい順序（isTestGenExempt → verificationFailedLast → BITE_EVIDENCE）なので機能上の問題はない。テストの意図をより正確に表すなら `t.when === verificationFailedLast` で絞り込む。

---

### [LOW] Design D3 からの実装逸脱 — fresh fallback 時に `buildImplementerInitialMessage` を使用していない

**場所**: `src/core/step/implementer.ts:buildMessage`（line 298–348）

design.md D3 は「fresh fallback 時は `buildImplementerInitialMessage`(branch 文脈 + tasks/spec 案内)に失敗セクションを付す」と明記。tasks.md T-03 も同様。しかし実装は resume/fresh 両ケースで同一の `buildImplementerRecoveryMessage` を使用。

**影響**: fresh session（前回 sessionId なし）では「tasks.md を読む」「test-cases.md を確認する」といった初期ガイダンスがなく、エージェントが実装文脈を把握しにくい可能性がある。

spec.md と test-cases.md にはこの差異を明示的にテストする項目がないため、受け入れ基準の文面上の充足は阻害しない。修正判断はオーナー次第。

---

## 受け入れ基準チェック

| 基準 | 状態 |
|------|------|
| verification 失敗時に implementer へ遷移（通常・chore 両経路） | ✅ TC-001/TC-002/TC-013 |
| 再入 implementer が直前 session の継続として起動 | ✅ TC-003（resumeSessionId） |
| 失敗内容が message に含まれることをテストで固定 | ⚠️ message 内容の検証なし（MEDIUM） |
| 継続元 session が無い場合に fresh で fallback | ✅ TC-004（resumeSessionId=undefined） |
| verification ループ上限（RETRIES_EXHAUSTED）が再入方式でも機能 | ✅ TC-006 |
| build-fixer 実行歴を含む既存 state の読み込みと resume | ✅ TC-008/TC-009 |
| 遷移表・build-fixer 関連テストの更新対象を全列挙 | ✅ design.md に全列挙あり |
| `typecheck && test` が green | 未確認（実行結果未取得） |
