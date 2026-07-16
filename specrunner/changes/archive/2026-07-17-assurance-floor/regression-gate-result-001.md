# Regression Gate Result — Iteration 1

- **verdict**: approved

## Findings Verification

### [MEDIUM] ProfileAssurance に named typed fields が無い（D1・T-01・受け入れ基準との乖離）

- **File**: src/state/schema/types.ts
- **Status**: fixed — no regression
- **Evidence**:
  - `ProfileAssurance` は `Readonly<Record<string,unknown>>` 型エイリアスから `interface` に変更された。
  - `readonly testDerivation?: TestDerivationLevel` / `readonly biteEvidence?: BiteEvidenceLevel` / `readonly specReview?: SpecReviewLevel` の 3 optional named fields が追加されている。
  - index signature `readonly [key: string]: unknown` は後方互換のため保持されている。
  - `git diff main...HEAD -- src/state/schema/types.ts` で差分を直接確認済み。
  - レグレッション（旧状態への逆戻り）なし。
