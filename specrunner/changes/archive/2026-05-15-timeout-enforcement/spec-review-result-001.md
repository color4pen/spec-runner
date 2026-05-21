# Spec Review: timeout-enforcement

- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-15
- **verdict**: needs-fix

## Summary

request.md の要件に対して design.md / tasks.md の網羅性・整合性を検証した。
全体的に高品質で、既存コードの分析も正確。1 件の実害のある設計バグと、2 件の仕様漏れを検出。

## Finding 1: T-04 の `??` 演算子で `timeoutMs: 0` が即時タイムアウトになる [MUST-FIX]

**カテゴリ**: 設計バグ — 既存契約との矛盾

design.md D3 / tasks.md T-04 で `resolvedConfig.timeoutMs === 0 ? null` の分岐を除去し、以下に変更するとしている:

```typescript
const effectiveTimeoutMs = resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
```

`??` (nullish coalescing) は `null` / `undefined` のみフォールバックし、`0` はそのまま返す。
config validator (`schema.ts` L258) は `timeoutMs >= 0` を許可し、コメントに `0 = disable timeout` と明記されている。

- 現在の動作: `timeoutMs: 0` → null 扱い（無制限）
- 変更後の動作: `timeoutMs: 0` → `pollUntilComplete(sessionId, { timeoutMs: 0 })` → 即時 `PollTimeoutError`

Claude Code / Codex adapter は `resolvedConfig.timeoutMs > 0` のガードがあるため 0 を無視する。
Managed Agent だけが 0 を即時タイムアウトとして扱うことになり、3 adapter 間の一貫性が壊れる。

**修正案**: 以下のいずれかを採用:
- (A) `resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0 ? resolvedConfig.timeoutMs : DEFAULT_POLL_TIMEOUT_MS`
- (B) config validator の下限を `>= 1` に変更し `0` を reject（3 adapter 共通で対応）

## Finding 2: store.ts の legacy timeoutMs stripping が残存 [SHOULD-FIX]

`src/config/store.ts` L99-109 で legacy config path (`specReview` / `specFixer`) の `timeoutMs` を write 時に strip するコードが残っている。コメントは `D3: silently ignore on write` で ADR-0013 を参照。

ADR-0013 を supersede するなら、この strip 動作もレビューすべき。
`steps` config には影響しないため実害は低いが、「silently ignore」の方針を撤回しつつ strip コードが残ると認知矛盾になる。

design.md / tasks.md に言及なし。

## Finding 3: config schema.ts の JSDoc が不正確 [SHOULD-FIX]

`src/config/schema.ts` L116-117:
```
Effective only for local runtime (ClaudeCodeRunner).
ManagedAgentRunner ignores this field.
```

Managed Agent adapter は既に `getStepExecutionConfig()` を呼び出しており、本 request で step timeout としても使用する。
この JSDoc は ADR-0013 時点で書かれたもので、supersede と同時に更新すべき。

## Finding 4: T-02c の .catch ブロック内 completedAt スコープが曖昧 [NOTE]

tasks.md T-02c で、`.catch()` ブロック内の `completedAt` 未定義問題に対して 2 つの選択肢を提示しているが、どちらを採用するか決定していない。implementer に判断を委ねる記述になっている。

推奨: 「startedAt のみ渡し、completedAt は pushStepResult のフォールバック（`new Date().toISOString()`）に任せる」を明示的に選択する方がシンプル。

## Verification: request.md 要件との対応

| 要件 # | 内容 | design.md | tasks.md | 状態 |
|--------|------|-----------|----------|------|
| 1 | startedAt/endedAt の修正 | D1 ✅ | T-01, T-02, T-03 ✅ | OK |
| 2 | StepRun 型定義変更なし | D1 明記 ✅ | — | OK |
| 3 | adapter が timeout 実施 | D2 ✅ | — | OK |
| 4 | Claude Code: AbortController | D2 「変更なし」✅ | — | OK（既存配線完備を確認） |
| 5 | Codex: AbortController | D2 「変更なし」✅ | — | OK（既存配線完備を確認） |
| 6 | Managed Agent: timeoutMs param | D3 ✅ | T-04 ✅ | **Finding 1** |
| 7 | timeout 時 awaiting-resume | D2 ✅ | — | OK（executor 既存ハンドリング確認） |
| 8 | デフォルト null | D2, D3 ✅ | T-04 ✅ | OK |
| 9 | ADR-0013 supersede | D4 ✅ | T-05, T-06 ✅ | OK |

## コード検証結果

- `helpers.ts` L82-93: バグの記述（startedAt = endedAt = now）は正確
- `executor.ts` L140: completedAt が `runner.run()` の前に取得される記述は正確
- `executor.ts` L314: CLI step も同様のパターンである記述は正確
- `agent-runner.ts` L193-196, L438-441: `DEFAULT_POLL_TIMEOUT_MS` が step default に混入している記述は正確
- Claude Code adapter L114-119: AbortController 配線完備の記述は正確
- Codex adapter L121-125: AbortController 配線完備の記述は正確
- ADR-0014 番号: ADR-0013 が最大番号であることを確認。ADR-0014 は使用可能
