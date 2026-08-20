# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

| 主張 | 実コード | 結果 |
|------|---------|------|
| `src/state/schema/types.ts:277-294` — `DecisionRecord` は decision-needed 専用、`kind` なし、`source: "issue-comment"` 固定 | 実測一致（lines 277-294） | ✓ |
| `src/core/decision/decision-ledger.ts:32-38` — `computeFindingKey = step\|file\|line\|title\|rationale` | 実測一致 | ✓ |
| `src/core/decision/decision-ledger.ts:49-72` — `isFindingDecided` は `d.step === step && d.findingKey === key` のみを照合、`kind` を見ない | 実測一致。disposition record を追加しても既存のマッチング機構がそのまま効く | ✓ |
| `src/core/step/step-completion.ts:178,187,199,252` — 各 verdict 導出前に `filterUndecidedFindings` が挟まれている | lines 178 (request-review), 187 (conformance), 199 (judge), 252 (post-verdict ref check) で確認 | ✓ |
| `src/core/pipeline/findings-ledger.ts:35-64` — `collectFindingsLedger` のループ内では `stepName` が既知（dedupe 後に失われる） | ループ変数 `stepName` は `all.push(...fixable)` より前に使える。`state: JobState` も引数として受け取るため `state.decisions` にアクセス可能 | ✓ |
| `src/core/pipeline/findings-ledger.ts:205-211` — `computeRegressionLedger` が `collectFindingsLedger` を呼ぶ | lines 205-213 で確認 | ✓ |
| `src/core/step/regression-gate.ts:115,144` — gate が `computeRegressionLedger` を入力として使う | lines 115 (skipWhen), 144 (buildMessage) で確認 | ✓ |
| `src/core/inbox/run-inbox.ts:293` — `decisions` の唯一の writer | lines 288-296 で state.decisions への追記を確認 | ✓ |
| `src/state/schema/types.ts:576-583` — `OperatorAdjudication` は自由文のみ、step は resume 先 step | 実測一致 | ✓ |
| `src/cli/flag-parser.ts` — FlagDef は `string \| boolean \| integer` のみ（array 未対応） | `FlagDef.type` の union に array なし。`--wontfix 1,3` をカンマ区切り string として受け取る設計は parser の制約と整合する | ✓ |

### 設計整合性確認

- **`kind` なし既存レコードの後方互換**: `isFindingDecided` は `kind` を参照しないため、既存 decisions レコードは無変更で動作する ✓
- **verdict 側の無変更成立**: `filterUndecidedFindings` が disposition record を既存 option record と同じルールで照合するため、`step-completion.ts` 変更不要という主張は正しい ✓
- **`collectFindingsLedger` への `state.decisions` アクセス**: 関数は既に `state: JobState` を受け取るため、`state.decisions` へのアクセスは追加引数不要で成立する ✓
- **dedupe と fingerprint の関係**: ledger の dedupe identity は `file|line|title`（`findingFingerprint`）、disposition key は `step|file|line|title|rationale`（`computeFindingKey`）。regression-gate 出力の finding #N を fingerprint で source step に逆引きし、source step の実 finding から findingKey を算出するという手順は両 identity の違いを正しく考慮している ✓
- **複数 step が同一 fingerprint を報告した場合の処理**: 要件 2 に「各 step につき 1 record」と明記されており、逆引き実装がこれを保証する必要がある（実装上の要注意点） ✓ 仕様として明記済み

### スコープ内の既知制約（受け入れ済み）

- `collectSpecReviewLedger` は今回変更対象外。spec-review 由来の regression-gate finding は `--wontfix` で選択不可（解決源スキャンが reviewerChain のみのため exit code 2 になる）。gate 出力の番号列に spec-review 由来が混在すると操作が混乱する余地があるが、要件で明示的にスコープ外とされており設計判断として受け入れられている
- identity の既知リスク（rationale 言い換えで findingKey が変わる）は要件で明示的に受け入れ済み

## 検証できなかった項目

None — コードアサーションは全て実コードで照合済み。

## Findings 詳細

None — ブロッキング指摘なし。
