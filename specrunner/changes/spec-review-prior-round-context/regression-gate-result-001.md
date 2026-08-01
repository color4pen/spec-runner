# Regression Gate — Iteration 1

## Checked Findings: 2 / Skipped: 0 / Unverified: 0

---

### [MEDIUM] buildPriorRoundContextBlock の出力ブロックに prompt injection 防護方針が未明示

**File**: `specrunner/changes/spec-review-prior-round-context/tasks.md`
**Status**: ✅ FIXED — regression なし

**Evidence**:
`tasks.md` T-02 の `buildPriorRoundContextBlock` 実装仕様（行 26）に以下が追記されている:

```
ブロック全体を `<prior-round-context>...</prior-round-context>` XML タグで囲む
（injection 境界の明示。finding title / changedFiles パスはスキーマ拘束済み・
リポジトリ相対パスだが、外部入力由来の文字列を初期メッセージに埋め込む際の
防護方針を実装者判断に委ねないために明示する）。
```

XML ラップ要件・防護が必要な理由の両方が tasks.md T-02 に明示されており、実装者判断への委任は解消されている。

---

### [LOW] enrichContext doc が prepareRoundContext との順序不変を明記していない

**File**: `src/core/port/step-types.ts`
**Status**: ✅ FIXED — regression なし

**Evidence**:
`AgentStep.enrichContext` の doc comment（行 239-246）に次の文言が追加されている:

```
Ordering: prepareRoundContext (core layer) runs BEFORE this hook and spread-merges
its fields into dynamicContext. Implementations must not drop those fields —
return `{ ...dynamicContext, ...newFields }` rather than a rebuilt object.
```

実行順序の不変条件（prepareRoundContext → enrichContext）と、既存フィールドを drop しない実装ガイダンスが明記されており、将来の非 noop 変更時に TypeScript エラーなしで priorRoundContext が消えるリスクに対するドキュメント防護が完備している。
