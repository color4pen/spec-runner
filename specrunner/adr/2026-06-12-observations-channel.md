# judge report tool の observations チャネルと findings 契約不変性

**Date**: 2026-06-12
**Status**: accepted
**Related**: `specrunner/adr/2026-06-10-judge-verdict-from-findings.md`（findings 型・verdict 導出基盤）、`specrunner/adr/2026-05-28-tool-driven-step-completion.md`（report_result tool 基盤）、`specrunner/adr/2026-06-11-custom-reviewer-data-driven-extensibility.md`（custom reviewer 拡張）

## Context

judge 系 `report_result` tool（`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL`）の構造化出力は `findings: Finding[]` の単一チャネルであり、`FindingResolution` は `"fixable" | "decision-needed"` の二択だった（`src/kernel/report-result.ts`、`src/core/step/report-tool.ts`）。「対応不要だが記録したい観察（FYI）」の置き場が schema に存在しない。

このため丁寧な reviewer ほど FYI を次のどちらかに誤分類するしかなく、両方が pipeline の誤動作を生む:

- `decision-needed` に詰める → `deriveJudgeVerdict` が severity を無視して escalation に倒し、人間判断が実質不要な指摘で pipeline が偽 halt する
- `fixable` に詰める → approved + fixable の遷移で code-fixer が起動し、直すもののない no-op 起動になる（27 秒のコスト、`collectFixableFindings` 経路）

`DECISION_NEEDED_DEFINITION`（「作成者でなければ決められない事項に限る」「迷ったら fixable」）は `code-review-system.ts` / `spec-review-system.ts` / `custom-reviewer-system.ts` / `request-review-system.ts` / `regression-gate-system.ts` 全 5 prompt に注入済みだった。reviewer はその規律に従った上でこの事象が起きた（test-placement-convention run、job c1f9dd5d、2026-06-12）。prompt 側の対処は上限に達している。

findings を消費する経路（verdict 導出・fixer 注入・findings-ledger・regression-gate）はいずれも `findings` を直接読むため、observations を findings に混ぜるとこれらの照合対象が汚染される（`src/core/pipeline/findings-ledger.ts`、`src/core/step/regression-gate.ts`）。

主要な現状制約:

- `report_result` の toolResult は executor が `pushStepResult` で verbatim 保存し、event journal も verbatim に永続化する。schema にフィールドを足せば追加実装なしで構造化記録に残る
- `parseInput` は純粋関数として維持する必要がある
- codex adapter は `toOpenAIStrictSchema` で schema を generic に walk し、全 property を required + nullable 化する汎用変換。新フィールドはこの変換で自動的に処理される

## Decision

### D1: `Observation` 型を kernel に定義する（resolution なし）

`src/kernel/report-result.ts` に `Finding` と並べて `Observation` を追加する。`severity` は `FindingSeverity` を再利用し（語彙の二重定義を避ける）、`resolution` フィールドは構造的に持たせない。

```ts
export interface Observation {
  /** 記録用の severity。routing には一切使用されない（recording-only）。 */
  severity: FindingSeverity;
  file: string;
  line?: number;
  title: string;
  rationale: string;
}
```

kernel は型置き場であり、`state/schema.ts → kernel`・`core/port → kernel` の双方が DSM 違反なく参照できる唯一の層。`Finding` がここに居るのと同じ理由で `Observation` もここに置く。`resolution` を構造的に持たせないことで「observation は routing 語彙（fixable / decision-needed）を持たない」を型レベルで表現する。

### D2: state schema の `toolResult` 型を observations で widen する

`StepOutcome.toolResult`（`src/state/schema.ts`）と `StepResultInput.toolResult`（`src/state/helpers.ts`）の型を `(BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null` に widen する。toolResult は verbatim 永続化されるため、型を広げるだけで observations が state・event journal に自動的に乗る。追加の書き込み経路・event スキーマ変更は不要。

### D3: judge-family の report_result スキーマに observations を additive に追加する

`src/core/step/report-tool.ts` に observation 要素の zod スキーマを定義し、3 つの judge report tool の zodSchema に `observations: optional(observationSchema)` を追加する。`findingSchema` と異なり `resolution` を持たない。

各 tool の description に observations の用途（「対応不要だが記録したい観察。verdict には影響しない」）を追記する。`findings` / `approved` / `fixableCount` / `verdict` フィールドは無変更。codex strict 変換は generic walk のため observations を自動処理する（D6）。

### D4: observations の parse は best-effort silent-ignore（findings 契約を一切汚さない）

`src/core/port/report-result.ts` に純粋 helper `parseObservations(raw)` を追加し、`parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput` を拡張して observations を **best-effort silent-ignore** で取り込む:

- `observations` が欠落 → `result.observations` は undefined（旧形式の後方互換）
- 正常な配列 → `result.observations` に検証済み配列をセット
- 不正構造（非配列・要素不正）→ silent drop（undefined のまま）。`missingFields` に載せない

这は `findings` の parse 戦略（ok=true かつ findings 欠落 → `missingFields: ["findings"]`）と意図的に異なる。observations は non-load-bearing であり、parse 失敗が ok 判定・verdict 導出・invalid-input retry に干渉してはならない。non-routing optional フィールド（`status` / `approved` / `fixableCount` / `verdict`）が既に silent-ignore である house pattern に揃える。

### D5: findings 消費経路は無改修。observations 不読を不変条件としてテストで固定する

verdict 導出（`deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings`）、fixer 注入（`getLatestJudgeFindings` / `buildFindingsBlock`）、台帳（`collectFindingsLedger`）、regression-gate、実在検証（`verifyFindingRefs`）はいずれも `findings` のみを読む。observations を別フィールドにしたことで既存消費経路が構造的に observations を見ない。

コード変更なしで要件を満たすこれらの不変条件を回帰テストでピン留めする:

- `deriveJudgeVerdict(findings: [], ok: true)`: observations に critical を入れても approved
- `collectFindingsLedger`: toolResult に findings + observations を持たせても台帳は findings のみ
- `buildFindingsBlock`: code-fixer 入力に observations title が現れない

### D6: codex strict-schema 変換はコード無改修、テストのみ追加する

`toOpenAIStrictSchema` は schema を generic に walk して全 property を required + nullable 化し、配列要素にも再帰する汎用変換。observations を zodSchema に足すと、変換は自動的に observations を required（nullable array）に、observation 要素の `line` を nullable に処理する。変換コードは無改修で、テストのみ追加して挙動を固定する。

### D7: `OBSERVATION_DEFINITION` を judge-rules に追加し全 judge prompt に同梱する

`src/prompts/judge-rules.ts` に `OBSERVATION_DEFINITION` 定数を追加する。内容:

- observation の定義: 「対応不要だが記録すべき観察。verdict には影響しない」
- finding との境界の禁止規律: 「再現手順を構成できる問題を observation に入れることは禁止 — それは finding」
- `report_result` の `observations` 配列形式（`{ severity, file, line?, title, rationale }`、resolution なし）

`DECISION_NEEDED_DEFINITION` を注入している全 5 prompt（`code-review-system.ts` / `spec-review-system.ts` / `request-review-system.ts` / `custom-reviewer-system.ts` / `regression-gate-system.ts`）に `OBSERVATION_DEFINITION` を同梱する。reviewer が「finding / decision-needed / observation のどれか」を一箇所の判断ツリーで決められるよう、decision-needed 定義と observation 定義を必ず共置する。

## Alternatives Considered

### Alternative 1: `resolution` enum に第三値（`"observation"` 等）を追加する

- **Pros**: 既存の findings 型を再利用できる
- **Cons**: findings を走査する全消費箇所（verdict 導出・fixer 注入・台帳・regression-gate・実在検証）に「観察を除外する」判断が散在する。1 箇所の漏れが silent 誤動作になる
- **Why not**: 影響面の拡散と silent 誤動作リスクのため却下

### Alternative 2: prompt 規律の強化のみで対処する

- **Pros**: コード変更なし
- **Cons**: test-placement-convention run（job c1f9dd5d）で `DECISION_NEEDED_DEFINITION` が全 prompt に届いた上でこの事象が起きた。prompt 側の対処は上限に達していることが実証済み
- **Why not**: 本事象で上限を実証済みのため却下

### Alternative 3: verdict 導出規則の severity 緩和（low の decision-needed を escalate しない）

- **Pros**: 既存の findings 型・schema を変更しなくて済む
- **Cons**: `decision-needed` の契約（「severity に関わらず人間ゲート」）を骨抜きにする。どこで decision-needed が low severity で正当かを CLI が自動判断することになり、LLM の非決定性が pipeline のルーティングに再混入する
- **Why not**: 人間ゲート契約の破壊のため却下

### Alternative 4: `Observation` を `core/port/report-result.ts` に置く

- **Pros**: port の近くに定義できる
- **Cons**: `state/schema.ts` は `core/port` を import できない（依存方向違反）。D2 の `toolResult` 型 widen に使えない
- **Why not**: DSM 違反のため却下

## Consequences

### Positive

- FYI 級の観察が `decision-needed`（偽 halt）にも `fixable`（no-op fixer 起動）にも詰められなくなり、pipeline の誤動作源が構造的に消える
- findings 契約（findings = actionable、verdict を駆動）が observations の追加後も不変のままテストで証明される
- event journal に observations が構造化データとして自動記録され、後段の人間レビューに使えるようになる（追加実装不要）
- reviewer が「正しい置き場」を持つことで reporting の品質が上がる。prompt の規律ではなくスキーマが境界を保証する

### Negative / Known Debt

- observations の不正構造は silent drop される（retry なし）。非 load-bearing のため pipeline 正しさに影響しないが、reviewer の意図が失われる可能性がある。prompt（D7）で形式を明示することで軽減
- reviewer が actionable な問題を observation に誤格下げするリスク。D7 の禁止規律（「再現手順を構成できる問題は finding」）で境界を明示するが、prompt であるため完全な防止ではない
- `job show` 等での observations の表示整形は未実装（将来検討）
- regression-gate は台帳項目限定（開放的レビュー禁止）の設計であり、observation 定義の存在と「ledger 外 finding 禁止」の共存が読み手に矛盾と映る可能性がある

## References

- Request: `specrunner/changes/observations-channel/request.md`
- Design: `specrunner/changes/observations-channel/design.md`
- Spec: `specrunner/changes/observations-channel/spec.md`
- Related: `specrunner/adr/2026-06-10-judge-verdict-from-findings.md`
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`
