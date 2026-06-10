# Design: code-fixer への approved 時 routing を fixableCount 申告ではなく findings から導出する

## Context

judge-verdict-from-findings（`specrunner/adr/2026-06-10-judge-verdict-from-findings.md`）により、
judge 系 step（spec-review / code-review / request-review）の verdict は agent 申告の
`approved` / `fixableCount` / `verdict` ラベルではなく、構造化 `findings` 配列を CLI が
決定的に集計して導出する形になった。verdict 導出の純関数群は `src/core/step/judge-verdict.ts`
（`deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings`）に
集約されている。

しかし `STANDARD_TRANSITIONS` の「code-review approved + 低 severity の fixable findings →
code-fixer（observation-fix パス）」を選ぶ typed routing（`src/core/pipeline/types.ts:151-160`）
だけは、いまも agent 申告の `toolResult.fixableCount` を読んだままになっている:

```ts
{ step: STEP_NAMES.CODE_REVIEW, on: "approved", to: STEP_NAMES.CODE_FIXER,
  when: (s) => {
    const reviews = s.steps?.["code-review"];
    if (!reviews || reviews.length === 0) return false;
    const lastReview = reviews[reviews.length - 1];
    if (!lastReview) return false;
    return ((lastReview.outcome?.toolResult as CodeReviewReportResult | null | undefined)?.fixableCount ?? 0) > 0;
  },
},
```

判別の主要な事実:

- code-review system prompt（`src/prompts/code-review-system.ts`）は agent に `findings` の提出
  のみを指示し、`fixableCount` の申告は要求していない。CODE_REVIEW_REPORT_TOOL の zod スキーマには
  `fixableCount: optional(number())` が compat として残るが、agent は通常これを埋めない。
- 結果として上記 `when` 述語は `?? 0`（既定値 0）で常に false となり、approved は常に conformance
  へ直行する。低 severity の fixable findings があっても code-fixer に入らない。逆に、findings と
  食い違う形で fixableCount だけが残った旧 state を resume すると、findings が無いのに code-fixer に
  回り得る。
- これは judge-verdict-from-findings ADR の「D11 / Alternative 10」として明示的に別 request へ
  切り出された未適用箇所であり、新しい設計選択ではなく同原則（agent の判断は finding 単位の
  ラベル付けに限定し、集計は CLI が行う）の適用漏れ解消にあたる。

approved に到達した時点の不変条件:

- `deriveJudgeVerdict` の優先順位より、approved は「`ok: true` かつ decision-needed が 0 件かつ
  critical/high が 0 件」を意味する。したがって approved 時点で state に残る findings は実質
  low/medium かつ `resolution: "fixable"` のもののみ（`resolution: "decision-needed"` は
  severity を問わず escalation に倒れるため存在しない）。

## Goals / Non-Goals

**Goals**:

- approved → code-fixer の routing 判定を `toolResult.fixableCount` から、直前 code-review run の
  `toolResult.findings` に含まれる `resolution: "fixable"` の finding 件数（>= 1）へ置き換える
- routing に使う集計を `src/core/step/judge-verdict.ts` の純関数群と同じ場所・同じ規約
  （pure, no I/O）で実装する
- CODE_REVIEW_REPORT_TOOL の tool description から `fixableCount` の言及を外す（zod スキーマと
  parse の受け口は compat のため残す）
- approved + fixable findings の有無で code-fixer / conformance に分岐すること、および fixableCount
  申告と findings が矛盾する入力で findings 側に従うことをテストで固定する
- approved → code-fixer 経路に入ったとき、code-fixer の prompt 埋め込み findings に当該の
  low/medium fixable findings が含まれることをテストで固定する

**Non-Goals**:

- needs-fix / escalation 側の routing（judge-verdict-from-findings で導出済み）
- spec-review / request-review の routing（fixableCount 相当の分岐が存在しない）
- `CodeReviewReportResult.fixableCount` フィールドの型定義からの削除（互換のため残す）
- `parseCodeReviewReportInput` の `fixableCount` 受け口の削除（compat のため残す）
- code-fixer の fix-policy 文言（HIGH/CRITICAL mandatory / LOW ignore 等）の変更。本変更は
  findings が prompt に埋め込まれること（= 入力の供給）のみを対象とし、agent の修正方針は変えない
- `fixableCount` の journal 永続化挙動（`tests/store/event-journal.test.ts` TC-005）。フィールドは
  型に残るためラウンドトリップは従来どおり green

## Decisions

### D1: approved → code-fixer の `when` 述語を findings 由来に置き換える

`src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` 内、
`{ step: CODE_REVIEW, on: "approved", to: CODE_FIXER }` 行の `when` を、直前 code-review run の
`toolResult.findings` から導出する形に置き換える。

```ts
{ step: STEP_NAMES.CODE_REVIEW, on: "approved", to: STEP_NAMES.CODE_FIXER,
  when: (s) => {
    const reviews = s.steps?.["code-review"];
    if (!reviews || reviews.length === 0) return false;
    const lastReview = reviews[reviews.length - 1];
    const findings =
      (lastReview?.outcome?.toolResult as CodeReviewReportResult | null | undefined)?.findings ?? [];
    return collectFixableFindings(findings).length > 0;
  },
},
```

- 既存の `CodeReviewReportResult` import はそのまま使う（`findings` は親 `JudgeReportResult` 由来の
  フィールドであり、`CodeReviewReportResult` 経由で読める）。
- 集計は D2 の純関数 `collectFixableFindings` を呼ぶ。`fixableCount` は一切読まない。
- state 探索は同ファイル内の既存述語（code-fixer → conformance 行）と同じインライン記法に揃える。

`when` を返す行の追加・削除は無く、行数（`STANDARD_TRANSITIONS.length === 31`）は不変。`approved`
の 2 行（code-fixer 条件付き / conformance fallback）の評価順序も不変であり、fixable findings が
0 件のとき条件付き行が false となり fallback の conformance 行が採用される。

`Transition` interface の doc コメント例（`src/core/pipeline/types.ts:66` 付近の
「e.g. code-review approved with fixableCount > 0 → code-fixer」）と該当行直上のコメントも
findings ベースの表現（例: 「approved with fixable findings → code-fixer」）に更新する。

**Rationale**: approved 時点で findings は実質 low/medium の fixable のみ。`resolution: "fixable"`
の件数を直接見ることで、agent の自己申告 `fixableCount` を pipeline から完全に排除し、verdict と
同じ「集計は CLI」原則に揃う。

**Alternatives considered**:
- `fixer-helpers.ts` の `getLatestJudgeFindings(state, CODE_REVIEW)` を再利用して state 探索を
  共通化する案。1 import 増えるだけで等価だが、本ファイルは既存の 2 述語がインライン探索しており、
  整合のためインラインを維持する。`getLatestJudgeFindings` 再利用は将来のリファクタ候補として残す。
- executor が findings から `fixableCount` を再計算して toolResult に書き戻す案（ADR Alternative 10）。
  toolResult の事後書き換えという逆流を生むため却下。routing は state の findings を直接読めば足りる。

### D2: 集計純関数 `collectFixableFindings` を judge-verdict.ts に追加する

`src/core/step/judge-verdict.ts` に既存純関数群と同じ規約（pure, no I/O）で関数を追加する。

```ts
/**
 * Collect findings the code-fixer can mechanically resolve (resolution: "fixable").
 *
 * Used by the approved → code-fixer routing predicate. At an approved verdict there are no
 * critical/high or decision-needed findings (deriveJudgeVerdict guarantees this), so the
 * returned set is effectively the low/medium fixable findings.
 */
export function collectFixableFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.resolution === "fixable");
}
```

- 引数は `Finding[]`（既存 `collectVerdictAffectingFindings` と同じシグネチャ規約）。
- severity でのフィルタはしない。approved 時点で critical/high は存在しないため
  `resolution: "fixable"` だけで実質 low/medium に絞られる。decision-needed も approved 時点で
  存在しないため、本関数は防御的に `resolution` のみで判定する。

**Rationale**: requirement 3。routing の集計を判定単体でユニットテストできる純関数に切り出し、
`judge-verdict.ts` に verdict 集計と並べて置くことで「集計は CLI の決定的関数」という構造を一箇所に
集約する。返り値を配列にして `collect*` 命名規約（`collectVerdictAffectingFindings`）に揃える。

**Alternatives considered**: boolean 述語 `hasFixableFindings(findings)` を返す案。routing は真偽値で
足りるが、`collect*` 命名と既存関数の戻り型に揃えるため配列返しとし、呼び出し側で `.length > 0`
する。

### D3: CODE_REVIEW_REPORT_TOOL の description から fixableCount を外し、スキーマ/parse は残す

`src/core/step/report-tool.ts` の `CODE_REVIEW_REPORT_TOOL.description`（model に送られる文字列）
から `fixableCount` への言及を外す。

- 変更前: `... the 'approved' and 'fixableCount' fields are kept for compatibility but are NOT used for routing.`
- 変更後: `... the 'approved' field is kept for compatibility but is NOT used for routing.`

保持するもの（compat、変更しない）:

- `zodSchema` の `fixableCount: optional(number())`（旧 prompt キャッシュ・再実行が
  `fixableCount` を送ってきても invalid-input にしないため）
- `parseCodeReviewReportInput` の `fixableCount` 受け口（受け取っても routing には使われない）
- `CodeReviewReportResult.fixableCount` 型フィールド

スキーマに `fixableCount` フィールドが残る事実を説明する doc コメント（report-tool.ts の
`CODE_REVIEW_REPORT_TOOL` 直上）は、「compat のため保持・申告は要求しない」旨に整える。

code-review system prompt（`src/prompts/code-review-system.ts`）および code-review の
followUpPrompt self-check（`src/core/step/code-review.ts`）は、現状すでに `findings` 提出のみを
指示しており `fixableCount` への言及を含まない（確認済み）。よって本変更ではこれらに編集を加えず、
「言及が無いこと」をタスクで確認する（混入していれば除去する）。

**Rationale**: requirement 2。description は agent に送られる load-bearing なテキストのため、ここから
`fixableCount` を消すことで「agent が fixableCount を埋めるべき」という示唆を完全に断つ。スキーマと
parse を残すのは旧 prompt キャッシュ・再実行との後方互換のため。

**Alternatives considered**: `fixableCount` を zod スキーマと parse から同時に削除する案。スコープ外
（型定義・受け口は残す方針）であり、旧入力との互換も失うため却下。

### D4: code-fixer の findings 埋め込みは既存実装で満たされており、テストで固定する

`src/core/step/code-fixer.ts` の `buildMessage` は、初回・継続いずれも
`getLatestJudgeFindings(state, CODE_REVIEW)` が返す findings を `buildFindingsBlock` で prompt 本文に
埋め込む（`src/core/step/fixer-helpers.ts`）。`getLatestJudgeFindings` は直前 code-review run の
`toolResult.findings` を severity でフィルタせず全件返すため、approved 経由で code-fixer に入った
場合の low/medium fixable findings はそのまま埋め込まれる。

したがって code-fixer 側の src 変更は不要。requirement 4 は「埋め込まれること」をテストで固定する
（low/medium の `resolution: "fixable"` findings を持つ state で `buildMessage` 出力に当該 finding の
title / file / rationale が現れることを検証する）。

**Rationale**: requirement 4。既存実装で満たされている場合は変更不要・テストで固定、という指示に従う。
code-fixer の fix-policy 文言は本変更の対象外（入力の供給のみを保証）。

**Alternatives considered**: なし（src 変更不要のため）。

### D5: pipeline transition の語彙・行数は不変

`STANDARD_TRANSITIONS` は行の追加・削除をせず、approved → code-fixer 行の `when` 本体のみ差し替える。
approved → conformance fallback 行（`when` なし）は不変であり、fixable findings 0 件のとき
conformance に倒れる挙動は既存の評価順序で成立する。`when` を持つ行の総数・`STANDARD_TRANSITIONS`
の行数も不変（既存 row-count テスト `=== 31` は無変更で green）。

**Rationale**: routing の語彙（verdict / `to`）を変えず述語の入力ソースだけを差し替えるため、
pipeline 本体・registry・他の transition テストへの波及は無い。

**Alternatives considered**: approved → code-fixer 行を削除し、code-fixer の observation-fix パスを
廃止する案。低 severity の自動掃除という意図された経路を失うため却下。本変更の目的はパスの維持と
判定ソースの是正であって廃止ではない。

## Risks / Trade-offs

- **[approved 時の observation-fix パスが「復活」して挙動が変わる]** judge-verdict-from-findings 以降、
  この経路は事実上 inert（常に conformance 直行）だった。本変更で fixable findings があれば
  code-fixer に入るようになる → これは ADR D11 で意図された「別 request で再有効化」そのものであり、
  期待される回復 → Mitigation: approved + fixable findings ≥ 1 → code-fixer / = 0 → conformance を
  テストで固定し、回復後の遷移を明示する。
- **[fixableCount を含む旧 state の resume]** 旧 job は findings を持たず fixableCount のみを持ち得る。
  新述語は findings を読むため、findings 不在の旧 state では `[]` → `.length === 0` で false となり
  conformance へ倒れる（安全側 = 余計に code-fixer に回さない）→ Mitigation: 矛盾入力
  （fixableCount あり・findings なし）で findings 側（false）に従うことをテストで固定する。
- **[低 severity 自動修正で iteration を消費]** fixable findings があると 1 回 code-fixer を回す。
  approved 後の掃除であり品質上は任意 → Mitigation: 対象は low/medium のみ（critical/high は
  approved 時点で存在しない）。fix-policy は無変更で code-fixer 側の判断に委ねる。

## Open Questions

- なし。設計原則は judge-verdict-from-findings ADR に既出であり、本変更は同原則の適用漏れ箇所の
  解消に閉じる（adr: false）。
