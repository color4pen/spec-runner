# Code Review — adr-alternatives-followup — iter 2

## Summary

`AdrGenStep.getFollowUpPrompt` の実装・型定義・テストを確認した。主要な受け入れ基準はすべて満たされており、実装は仕様と一致している。1 件の medium 指摘（test-cases.md TC-07 の THEN 節が delta spec と矛盾しており、対応するテストも未実装）がある。

---

## Findings

### F-001 [medium] TC-07 の THEN 節が delta spec と矛盾しており、かつテスト未実装

**場所**: `specrunner/changes/adr-alternatives-followup/test-cases.md` TC-07 / `tests/unit/step/executor.test.ts`

**問題**:

test-cases.md TC-07 の タイトルと THEN 節:
```
### TC-07: getFollowUpPrompt が undefined を返した場合、静的 followUpPrompt にフォールバックしない
...
THEN `followUpPrompt` は `undefined` である（静的値にフォールバックしない）
```

しかし delta spec (`changes/.../specs/step-execution-architecture/spec.md`) は逆の挙動を規定している:
```
#### Scenario: getFollowUpPrompt が undefined を返すと静的 followUpPrompt にフォールバックする
THEN `ctx.followUpPrompt` は `"static prompt"` である
```

実装も `??` 演算子を使いデルタ spec に準拠している:
```typescript
followUpPrompt: step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt,
```

TC-07 のノートも矛盾を自認している: `"getFollowUpPrompt が undefined を返すと ?? により静的値にフォールバックする"` と書かれているが、THEN は `undefined` を返すと主張している。

加えて、TC-07 に対応するテストケースが `executor.test.ts` に存在しない（TC-07 は priority: must）。

**影響**: AdrGenStep は静的 `followUpPrompt` を持たないため実運用上の実害はない。ただし将来 `getFollowUpPrompt` と静的 `followUpPrompt` を両方定義する step が追加された場合、TC-07 の誤った仕様に従うとテストが失敗する。

**修正方法**:
1. test-cases.md TC-07 の THEN 節を正しい挙動に修正する:
   ```
   THEN `followUpPrompt` は `"static-value"` である（静的値にフォールバックする）
   ```
   タイトルも "フォールバックする" に変更する。
2. 対応するテストを `executor.test.ts` に追加する:
   ```typescript
   it("TC-07: getFollowUpPrompt が undefined を返すと静的 followUpPrompt にフォールバックする", async () => {
     const step: Step = {
       ...
       followUpPrompt: "static-value",
       getFollowUpPrompt: () => undefined,
       ...
     };
     // expect(captured.ctx!.followUpPrompt).toBe("static-value");
   });
   ```

---

### F-002 [low] JSDoc が getMaxTurns と「同型」と説明しているがシグネチャが異なる

**場所**: `src/core/step/types.ts` L144

**問題**: JSDoc は `getMaxTurns と同型の optional method` と書かれているが:
- `getMaxTurns?(state: JobState): number | undefined` — state のみ
- `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` — state + deps

**影響**: 機能上の問題はなく、deps が必要な理由（`adr` flag の参照）も妥当。コメントが誤解を招く可能性があるだけ。

**修正方法**: JSDoc を `getMaxTurns と同型の optional method パターン（ただし deps も受け取る）` 等に修正する。これは任意対応。

---

## Checklist

| 受け入れ基準 | 判定 |
|---|---|
| AdrGenStep に `getFollowUpPrompt` が設定されている | ✅ |
| follow-prompt は「修正」を指示し「判定」を指示しない | ✅ (`追記せよ`、`判定せよ` なし) |
| follow-prompt は `adr: true` のみで発火し `adr: false` では undefined を返す | ✅ |
| `adr: false` では adr-gen が no-op で終わる | ✅ |
| 機械 validator / adr-fixer step を追加しない | ✅ |
| `bun run typecheck && bun run test` が green | ✅ (verification-result.md 参照) |

## Scope 確認

- 新規 `src/core/adr/rules/` なし ✅
- adr-fixer step なし ✅
- executor 変更は 1 行のみ（`??` 解決式追加）✅
- `AgentStep.getFollowUpPrompt` optional method 追加 ✅
- delta spec 2 本（`adr-generation` / `step-execution-architecture`）更新済み ✅

---

- **verdict**: needs-fix
