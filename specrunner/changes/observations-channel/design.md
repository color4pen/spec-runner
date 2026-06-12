# Design: judge report tool に observations チャネルを追加し非アクション観察を verdict 駆動から分離する

## Context

judge 系 report tool（`report_result`）の構造化出力は `findings: Finding[]` の単一チャネルで、
`Finding` の `resolution` は `"fixable" | "decision-needed"` の二択（`src/kernel/report-result.ts:15`、
`src/core/step/report-tool.ts:84`）。「対応不要だが記録したい観察（FYI）」の置き場が schema に無い。

このため丁寧な reviewer ほど FYI を次のどちらかに詰めるしかなく、両方が誤動作を生む:

- `decision-needed` に詰める → `deriveJudgeVerdict`（`src/core/step/judge-verdict.ts:37`）が
  severity を無視して escalation に倒し、人間判断が実質不要な指摘で pipeline が偽 halt する
- `fixable` に詰める → approved + fixable の遷移で共用 code-fixer が起動し、直すもののない
  no-op 起動になる（`collectFixableFindings`、`src/core/step/judge-verdict.ts:53`）

prompt 規律（`DECISION_NEEDED_DEFINITION`、「迷ったら fixable」）は実装済みで、reviewer はそれに
従った上で本事象が起きた。prompt 側の対処は上限に達している。

verdict・fixer・台帳・退行ゲートはいずれも `findings` を読むため、観察を `findings` に混ぜると
これらの照合対象が汚染される（`src/core/pipeline/findings-ledger.ts`、`src/core/step/regression-gate.ts`、#631）。

主要な現状制約:

- `report_result` の parse 値（`toolResult`）は executor が `pushStepResult` で `StepOutcome.toolResult`
  に verbatim 保存し、event journal も verbatim に永続化する（`src/store/event-journal.ts:226,296`）。
  schema にフィールドを足せば追加実装なしで構造化記録に残る
- judge-family の reportTool は 3 つ: `JUDGE_REPORT_TOOL`（spec-review / regression-gate /
  custom-reviewer）、`CODE_REVIEW_REPORT_TOOL`（code-review）、`REQUEST_REVIEW_REPORT_TOOL`
  （request-review）。この 3 つで全 judge step を覆う
- parseInput は純粋関数（ファイル I/O 禁止）として維持する必要がある
- codex adapter は `toOpenAIStrictSchema` で schema を generic に walk し、全 property を
  required + nullable 化し top-level に `additionalProperties: false` を付与する
  （`src/adapter/codex/strict-schema.ts`）。新フィールドはこの汎用変換で自動的に処理される

## Goals / Non-Goals

**Goals**:

- judge-family report tool に optional な `observations: Observation[]` チャネルを追加する。
  要素は `{ severity, file, line?, title, rationale }`（`resolution` を持たない）
- findings の契約を不変に保つ。verdict 導出・fixer への findings 注入・findings-ledger・
  regression-gate はいずれも observations を読まず、「findings = actionable、verdict を駆動」を維持する
- observations の severity が記録専用で routing に使われないことを型と構造で保証し、テストで固定する
- observation の定義（「対応不要だが記録すべき観察。再現手順を構成できる問題は finding であり
  observation 禁止」）を `judge-rules.ts` に追加し、`DECISION_NEEDED_DEFINITION` を注入する全 prompt に同梱する
- 旧形式 toolResult（observations フィールドなし）の読み込みを後方互換に保つ

**Non-Goals**:

- `resolution` enum への第三値追加（findings を走査する全消費箇所に除外判断が散在し、1 箇所の漏れが
  silent 誤動作になるため不採用）
- verdict 導出規則の変更（low の decision-needed を escalate しない案は decision-needed の契約を
  骨抜きにするため不採用）
- regression-gate / findings-ledger で observations を走査する拡張（将来検討）
- `job show` 等での observations の表示整形
- producer 系 report tool（`REPORT_TOOL` / `PRODUCER_REPORT_TOOL`）への observations 追加

## Decisions

### D1: `Observation` 型を kernel に定義する（resolution なし）

`src/kernel/report-result.ts` に `Finding` と並べて `Observation` を追加する。`severity` は
`FindingSeverity` を再利用する（語彙の二重定義を避ける）。`resolution` フィールドは持たない。

```ts
// src/kernel/report-result.ts（追加）
export interface Observation {
  /** 記録用の severity。routing には一切使用されない（recording-only）。 */
  severity: FindingSeverity;
  file: string;
  line?: number;
  title: string;
  rationale: string;
}
```

**Rationale**: kernel は型置き場であり、`state/schema.ts → kernel`・`core/port → kernel` の双方が
DSM 違反なく参照できる唯一の層。`Finding` がここに居るのと同じ理由で `Observation` もここに置く。
`resolution` を構造的に持たせないことで「observation は routing 語彙（fixable / decision-needed）を
持たない」を型レベルで表現する。

**Alternatives considered**: `Observation` を `core/port/report-result.ts` に置く案 → state が port を
import できず toolResult 型の widen に使えないため却下（D2 と同型理由）。`Finding` を拡張して
`resolution` を optional にする案 → findings 全消費箇所に「resolution 欠落 finding」が混入し
Non-Goal（resolution 第三値）と同じ拡散を招くため却下。

### D2: state schema の `toolResult` 型を observations で widen する

`StepOutcome.toolResult`（`src/state/schema.ts:125`）と `StepResultInput.toolResult`
（`src/state/helpers.ts:70`）の型を
`(BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null` に widen する。

**Rationale**: toolResult は verbatim 永続化されるため observations は型を広げるだけで state・
event journal に自動的に乗る（D6）。型を widen しないと `toolResult.observations` への型安全な
アクセスが取れない。runtime 上の永続化経路に変更は不要。

**Alternatives considered**: observations 専用の永続化フィールドを `StepRun` に追加する案 →
toolResult に内包される情報を二重化するため却下。

### D3: judge-family の `report_result` スキーマに observations を additive に追加する

`src/core/step/report-tool.ts` に observation 要素の zod スキーマを定義し、
`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` の zodSchema に
`observations: optional(observationSchema)` を追加する。`findingSchema` と異なり `resolution` を持たない。

```ts
const observationSchema = array(object({
  severity: union([literal("critical"), literal("high"), literal("medium"), literal("low")]),
  file: string(),
  line: optional(number()),
  title: string(),
  rationale: string(),
}));
```

3 つの tool は全 judge step（spec-review / regression-gate / custom-reviewer / code-review /
request-review）を覆う。各 tool の description に observations の用途（「対応不要だが記録したい観察。
verdict には影響しない」）を追記する。`findings` / `approved` / `fixableCount` / `verdict` フィールドは
無変更。

**Rationale**: 別チャネルにすることで R7 契約（findings が verdict を駆動）を不変に保ち、gate・fixer・
ledger・regression-gate への影響を構造的にゼロにする（architect 採用案）。zodSchema を single source
of truth とし JSON Schema は派生のまま保つ。codex strict 変換は generic walk のため observations を
自動処理する（D7）。

**Alternatives considered**: observations を `resolution` 第三値で表現する案 → Non-Goal（影響面拡散）。
observations を JSON 文字列 1 フィールドで受ける案 → 型安全と agent 側スキーマ検証を失うため却下。

### D4: observations parse は best-effort（findings 契約を一切汚さない）

`src/core/port/report-result.ts` に純粋 helper `parseObservations(raw): { ok: true; value:
Observation[] } | { ok: false }` を追加する（`parseFindings` と同型、`resolution` 検証なし）。
`parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput` を拡張し、
`observations` を **best-effort silent-ignore** で取り込む:

- `observations` が欠落 → `result.observations` は未設定（undefined）
- 正常な配列 → `result.observations` に検証済み配列をセット
- 不正構造（非配列・要素不正）→ silent drop（undefined のまま）。`missingFields` に載せない

`JudgeReportResult` / `RequestReviewReportResult` に `observations?: Observation[]` を追加する
（`CodeReviewReportResult` は Judge を継承）。

**Rationale**: 要件 2（findings 契約不変）を構造的に保証するため、observations の parse は ok 判定と
`missingFields` に一切影響してはならない。observations を `missingFields` に載せると invalid-input
retry や no-tool-call → escalation 経路に観察が干渉し、verdict 駆動を間接的に変えてしまう。
non-routing optional フィールド（`status` / `approved` / `fixableCount` / `verdict`）が既に silent-ignore
である house pattern に揃える。これにより要件 5（旧形式は observations なし → undefined）も同時に満たす。

**Alternatives considered**: ok=true 時に observations を必須化する案 → findings 不在時に approved を
出せなくなり verdict 駆動に干渉、Non-Goal に反するため却下。不正要素を個別に drop して残りを残す案 →
parse の決定性が下がるため whole-array 検証 + silent drop を採用（per-element 耐性は将来検討）。

### D5: findings 消費経路は無改修。observations 不読を不変条件としてテストで固定する

verdict 導出（`deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings`）、
fixer 注入（`getLatestJudgeFindings` / `buildFindingsBlock`）、台帳（`collectFindingsLedger`）、
退行ゲート、実在検証（`verifyFindingRefs` に渡す `collectVerdictAffectingFindings`）はいずれも
`findings`（または `toolResult.findings`）のみを読み、`toolResult.observations` を読まない。

これらは **コード変更なし** で要件 2/3 を満たす。設計の核は「別フィールドにしたことで既存消費経路が
構造的に observations を見ない」点にある。本変更ではこの不変条件をテストで固定する:

- parse → `deriveJudgeVerdict(findings ?? [], ok)`: observations に critical を入れても findings が
  空なら approved のまま
- `collectFindingsLedger`: toolResult に findings + observations を持たせても台帳は findings のみ
- `getLatestJudgeFindings` / `buildFindingsBlock`: code-fixer 入力に observations title が現れない

**Rationale**: 要件 2 は「契約不変」が本質であり、新規ロジックではなく既存ロジックの不読を回帰テストで
ピン留めするのが正しい。テストが将来 observations を findings 経路へ誤って混ぜる変更を検出する。

**Alternatives considered**: 各消費関数に「observations を除外する」明示フィルタを足す案 → そもそも
observations は別フィールドで渡らないため不要であり、無意味な防御コードを増やすため却下。

### D6: observations の永続化は既存 toolResult 流路で自動達成される

executor finalizeStep は `pushStepResult(..., { toolResult: agentResult.toolResult, ... })` で
toolResult を verbatim 保存し、event journal も `...(toolResult !== undefined ? { toolResult } : {})`
で verbatim に書き出す（`src/store/event-journal.ts:226,296`）。D2 で型を widen するため observations は
型・実体ともに state と events.jsonl に乗る。追加の書き込み経路・event スキーマ変更は不要。

**Rationale**: 「events.jsonl は toolResult を丸ごと永続化する」既存性質に observations が自然に乗る。
構造化記録（後段の人間レビュー・分析）は追加実装なしで達成される。

**Alternatives considered**: observations 用の専用 event タイプを追加する案 → 既存流路で足りるため却下。

### D7: codex strict-schema 変換はコード無改修、テストのみ追加する

`toOpenAIStrictSchema` / `stripNullDeep`（`src/adapter/codex/strict-schema.ts`）は schema を generic に
walk して全 property を required + nullable 化し、配列要素にも再帰する汎用変換。observations を
zodSchema に足すと、変換は自動的に observations を required（nullable array）に、observation 要素の
`line` を nullable に、`severity/file/title/rationale` を非 nullable に処理する。`stripNullDeep` も
observation の `line: null` を再帰的に除去する。

したがって変換コードは無改修で、テストのみ追加して挙動を固定する。既存 strict-schema テストの
top-level required 検証は `toContain` のため observations 追加で破綻しない。

**Rationale**: 汎用変換に依存することで codex 互換を追加コストなく維持できる。要件「型・テストで明示」に
沿って observation 要素が strict mode 下で findings と同等に扱われることをテストで保証する。

**Alternatives considered**: codex 変換に observations 専用分岐を足す案 → generic walk で足りるため却下。

### D8: `OBSERVATION_DEFINITION` を judge-rules に追加し全 judge prompt に同梱する

`src/prompts/judge-rules.ts` に `OBSERVATION_DEFINITION` 定数を追加する。内容は最低限:

- observation の定義: 「対応不要だが記録すべき観察。verdict には影響しない」
- finding との境界の禁止規律: 「**再現手順を構成できる問題を observation に入れることは禁止 —
  それは finding**」
- 配置の判断順序（finding か / decision-needed か / observation か）の手掛かり

`DECISION_NEEDED_DEFINITION` を注入している全 prompt に `OBSERVATION_DEFINITION` を同梱する。対象は
`code-review-system.ts` / `spec-review-system.ts` / `request-review-system.ts` /
`custom-reviewer-system.ts` / `regression-gate-system.ts` の 5 つ。各 prompt の Completion セクション
（severity/resolution 定義の近傍）に observation 定義を置き、`report_result` の `observations` 配列の
形式（`{ severity, file, line?, title, rationale }`、resolution なし）と「指摘がなければ省略可」を併記する。

**Rationale**: reviewer が「この指摘は finding / decision-needed / observation のどれか」を一箇所の
判断ツリーで決められるよう、decision-needed の定義と observation の定義を必ず共置する。prompt 規律の
誘導は上限に達しているため、規律ではなく「正しい置き場の存在」を提示することが本質的対処。
regression-gate は台帳項目限定（開放的レビュー禁止）のため observation を出す場面は稀だが、契約の
一様性のため定義は同梱する。

**Alternatives considered**: 3 つの judge prompt のみに同梱する案 → custom-reviewer（本事象の発端である
cross-boundary-invariants が属する系）と regression-gate が漏れ、`DECISION_NEEDED_DEFINITION` を
注入する全 prompt という受け入れ基準を満たさないため却下。

## Risks / Trade-offs

- **[observations が silent drop され reviewer の意図が失われる（D4）]** 不正構造の observations 配列は
  retry なしで undefined になる → Mitigation: observations は非 load-bearing（verdict・台帳・fixer に
  影響しない記録専用）であり、失われても pipeline の正しさは不変。prompt（D8）で形式を明示する
- **[reviewer が finding を observation に誤って格下げする]** 再現手順を構成できる問題を observation に
  入れると actionable な指摘が verdict を駆動しなくなる → Mitigation: D8 の禁止規律
  （「再現手順を構成できる問題は observation 禁止 = それは finding」）を全 prompt に同梱して境界を明示
- **[将来 observations を findings 経路へ誤接続する回帰]** 後続変更が observations を台帳や fixer に
  混ぜる可能性 → Mitigation: D5 の不変条件テスト（observations 不読）が回帰を検出する
- **[codex strict 変換への依存]** generic walk が将来仕様変更で配列要素の扱いを変えると observations の
  strict 表現が崩れる → Mitigation: D7 のテストで observation 要素の strict 表現を固定し回帰を検出

## Open Questions

- observation の severity に `critical` / `high` を許す（型上は `FindingSeverity` 全 4 値）が、
  記録専用のため実害はない。severity を `medium` / `low` に制限する余地はあるが、reviewer の表現自由度を
  保つため全 4 値を許可する方針とした。この方針で受け入れ基準を満たすか
- regression-gate に observation 定義を同梱するが、ゲートは台帳項目限定で開放的観察を出さない設計。
  定義の存在自体は無害だが、ゲート prompt の「ledger 外の指摘禁止」と observation の許可が読み手に
  矛盾と映らないか（本設計では「ledger 外 finding 禁止 ≠ observation 禁止」と解する）
