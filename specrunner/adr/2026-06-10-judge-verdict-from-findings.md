# judge 系 step の verdict を構造化 findings から CLI が決定論的に導出する

**Date**: 2026-06-10
**Status**: accepted
**Related**: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（report_result tool / typed verdict 基盤）、`specrunner/adr/2026-06-10-request-review-pipeline-step.md`（request-review ステップ化）、`specrunner/adr/2026-06-01-dsm-runtime-strategy-demote.md`（RuntimeStrategy seam 設計）

## Context

judge 系 step（spec-review / code-review / request-review）の verdict は、agent が `report_result` tool で申告する `approved` boolean（`src/core/step/executor.ts` finalizeStep の judge 分岐）をそのまま採用していた。指摘内容は agent が markdown の result ファイルに書いており、verdict とファイル内容を突き合わせる仕組みがなかった。

このため「CRITICAL を列挙しながら approved を申告する」「non-blocking 指摘で needs-fix を返しループが止まらない」という findings と verdict の不整合が構造的に起き得る状態だった。

また、no-tool-call フォールバック（toolResult === null）の judge は `needs-fix` を返していたため、fixer ループ → 上限 exhaustion という迂遠な経路で halt しており、判断材料がない状態を人間にエスカレートすべき状態として扱えていなかった。

agent の判断を「finding 単位のラベル付け」に限定し、verdict の集計（合否・fixer 行き・escalation 行き）を CLI の決定的な関数に移すことで、この不整合を構造的に排除する。「AI の非決定性を step の中に封じ込め、orchestrator は決定的に保つ」原則（汎用パイプライン設計原則 1）に沿う。

現状の主要な制約:

- managed runtime では CLI からブランチへのファイル書き込みができない（`finalizeStepArtifacts` は no-op）。構造化 toolResult を唯一の正とし、markdown result ファイルをルーティング・fixer 入力の load-bearing から外す必要がある
- `parseInput` は純粋関数（B-5）として維持する必要があり、ファイル I/O を含む実在検証は含められない
- managed runtime の実在検証は `GitHubClient.getRawFile` 経由になり、finding 1 件につき GitHub API 1 呼び出しになる

## Decision

### D1: `Finding` 型を kernel に定義し、state schema を widen する

`Finding` 型は `src/kernel/report-result.ts` に置く。依存方向として `state/schema.ts → kernel`（許可）と `core/port → kernel`（許可）の両方から参照できる唯一の場所が kernel であり、`state` は `core/port` を import できないため。

```ts
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingResolution = "fixable" | "decision-needed";

export interface Finding {
  severity: FindingSeverity;
  resolution: FindingResolution;
  file: string;
  line?: number;
  title: string;
  rationale: string;
}
```

`StepOutcome.toolResult`（`src/state/schema.ts`）を `(BaseReportResult & { findings?: Finding[] }) | null` に widen する。これで findings が job state の型に含まれ、追加の永続化経路なく既存の toolResult 書き込みフローに自然に乗る。

### D2: `report_result` スキーマに findings 配列を追加する（zod/v4-mini）

`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL`（`src/core/step/report-tool.ts`）の zodSchema に `findings: optional(findingSchema)` を追加する。`approved` / `fixableCount` / `verdict` フィールドは互換のため残す。managed runtime の `tools.input_schema` 変換は既存の `toCustomToolSpec`（`toJSONSchema(object(...))`）経路をそのまま使える。

zodSchema を single source of truth とし、JSON Schema は派生のまま保つ。

### D3: ok=true 時に findings を必須とし、欠落・不正構造は invalid-input retry に乗せる

`parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput`（`src/core/port/report-result.ts`）に findings 配列の構造検証を追加する。共有 helper `parseFindings(raw)` を置き、3 つの parse 関数から呼ぶ。

- `ok === true` かつ findings が欠落または不正構造 → `missingFields: ["findings"]`（invalid-input retry）
- `ok === false`（自発的失敗）→ findings は必須としない（voluntary failure を受理）

findings 欠落のまま retry 上限を超えた場合は toolResult が null になり、D7 の no-tool-call → escalation に倒れる（fail-safe）。

parseInput は純粋関数のまま維持する（B-5）。実在検証はセッション後の事後検証（D6）に分離する。

### D4: verdict 導出は純粋関数モジュール `judge-verdict.ts` に切り出し、executor から呼ぶ

新規 `src/core/step/judge-verdict.ts` に純粋関数を置く。

spec-review / code-review（優先順位順）:
1. `ok: false` → `escalation`
2. `resolution: "decision-needed"` の finding が 1 件以上 → `escalation`
3. `severity: "critical"` または `"high"` の finding が 1 件以上 → `needs-fix`
4. それ以外（空配列を含む）→ `approved`

request-review（2 値）:
- blocking（critical / high / decision-needed）が 1 件以上 → `needs-discussion`
- なければ → `approve`
- `reject` は導出しない（pipeline 上 needs-discussion と reject はどちらも escalate に遷移するため）

純粋関数に切り出すことで verdict の集計ロジックを直接ユニットテストでき、findings と verdict の不整合が構造的に起きないことをテストで証明できる。

### D5: escalation の routing は transition の既定動作（default-to-escalate）で成立する

`pipeline.ts` の `const nextStep = transition?.to ?? "escalate"` により、マッチ行が無い outcome は自動的に `escalate`（→ awaiting-resume）へ倒れる。spec-review / code-review には `escalation` 行が存在しない（R3 cutover で削除済み）ため、`deriveJudgeVerdict` が返す `escalation` は default-to-escalate によって正しく処理される。transition テーブルは**無変更**で decision-needed / ok:false / 実在検証失敗による escalation routing が成立する。

### D6: 実在検証は RuntimeStrategy の新 seam `verifyFindingRefs` に置く

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に `verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>` を追加する。戻り値は実在しない参照の配列であり、空配列 → no-op。

- local: `path.join(cwd, file)` の filesystem 存在確認（line があれば行数 >= line）
- managed: `githubClient.getRawFile(owner, repo, branch, file)` の null 判定（transient エラーも null 扱い → fail-safe）

検証対象を verdict に影響する findings（critical / high / decision-needed）に限定することで、API 呼び出しコストを抑える（approved 導出時は対象 0 件で no-op）。実在しない参照を 1 件以上含む場合は verdict を `escalation` に上書きする。

B-8（runtime 分岐の集約）に沿い、local と managed の差異を 1 つの seam に閉じ込める。

### D7: no-tool-call と ok:false を escalation に統一する

executor finalizeStep の no-tool-call フォールバック（toolResult === null）の judge 分岐を `needs-fix` から `escalation` に変更する。findings（判断材料）が無い状態は人間にエスカレートするのが妥当であり、旧実装の fixer ループ → exhaustion という迂遠な経路を排除する。

request-review の null フォールバックは `needs-discussion`（escalate 経路）のまま据え置く。`ok: false` 報告は D4 の導出関数内で `escalation`（judge）/ `needs-discussion`（request-review）に倒れる。

### D8: fixer は state の findings を prompt に埋め込み、無ければ findingsPath にフォールバックする

`fixer-helpers.ts` に `getLatestJudgeFindings` / `buildFindingsBlock` を追加する。spec-fixer / code-fixer の buildMessage で、直前の judge run の toolResult.findings が存在すれば findings を prompt 本文に埋め込み、findingsPath ファイル読み込み指示は使わない。null（旧 toolResult の resume）の場合は従来の findingsPath 方式にフォールバックする。

managed runtime では CLI がブランチへファイル書き込みできないため、fixer への入力として構造化 toolResult を唯一の正とする（外部制約）。build-fixer は findings 源が verification（CLI step）の prose result であり対象外。

## Alternatives Considered

### Alternative 1: D1 — `Finding` を `core/port/report-result.ts` に置く

- **Pros**: port の近くに定義できる
- **Cons**: `state/schema.ts` は `core/port` を import できない（依存方向違反）。`StepOutcome.toolResult` の widen に使えない
- **Why not**: 却下

### Alternative 2: D2 — findings を JSON 文字列 1 フィールドで受ける

- **Pros**: 既存スキーマへの変更が小さい
- **Cons**: 型安全性と JSON Schema による agent 側バリデーションを失う
- **Why not**: 却下

### Alternative 3: D3 — findings を常に optional 扱いし欠落→空配列（approved）とする

- **Pros**: 後方互換性が高い
- **Cons**: approved-by-omission を許し、本変更の目的（findings と verdict の不整合排除）に反する
- **Why not**: 却下

### Alternative 4: D4 — 導出ロジックを executor 内にインラインで書く

- **Pros**: 変更箇所が少ない
- **Cons**: verdict 判定単体のテストに executor の I/O ライフサイクル全体のスタブが必要になり、純粋関数でのテストができない
- **Why not**: 却下

### Alternative 5: D5 — spec-review / code-review に `{ on: "escalation", to: "escalate" }` 行を明示追加する

- **Pros**: 意図が明示的になる
- **Cons**: R3 cutover で意図的に削除した行を復活させることになる。default-to-escalate と重複し pipeline の語彙を増やす
- **Why not**: 却下

### Alternative 6: D6 — 実在検証を executor 内で runtime 判定して分岐する

- **Pros**: 変更箇所が局所的
- **Cons**: B-8（runtime 分岐の集約）違反。local / managed 差異が executor に漏れる
- **Why not**: 却下

### Alternative 7: D7 — no-tool-call を error（hard fail）にする

- **Pros**: 異常を明確に示せる
- **Cons**: error は AGENT_STEP_FAILED 系の異常終了を意味し、resumable な escalation の方が運用上扱いやすい
- **Why not**: 却下

### Alternative 8: D8 — findings ファイルを CLI が生成してブランチに書き込む

- **Pros**: fixer が従来通りファイルパスで findings を参照できる
- **Cons**: managed runtime では CLI がブランチへファイル書き込みできない（外部制約）ため成立しない
- **Why not**: 却下

### Alternative 9: D3/D6 — 実在検証を `parseInput` 内で行う

- **Pros**: 構造検証と実在検証が同一の関数に集まり、呼び出し側の処理が単純になる
- **Cons**: `parseInput` は純粋関数（B-5）として維持する必要があり、ファイル I/O を含む実在検証を持ち込むと純粋性が失われる。テスト時にファイルシステムや GitHub API のスタブが必須になり、parse 関数単体のテストができなくなる
- **Why not**: B-5（parseInput 純粋性）違反のため却下。実在検証はセッション後の事後検証（D6）に分離する

### Alternative 10: D11 — `fixableCount` を findings から executor が再計算して toolResult にセットする

- **Pros**: `STANDARD_TRANSITIONS` の `approved + fixableCount > 0 → code-fixer` 最適化経路が引き続き機能し、低 severity の自動修正を維持できる
- **Cons**: executor が toolResult を書き換える処理を追加する必要があり、toolResult を parse した値を事後変更するという逆流が生まれる。本変更のスコープを超える
- **Why not**: approved は blocking 問題がない状態であり、low / medium の fixable 指摘の自動修正は品質に必須ではない。scope 拡大を避け別 request に切り出す

## Consequences

### Positive

- findings と verdict の不整合（「CRITICAL を含む approved」「non-blocking で needs-fix ループ」）が構造的に発生しなくなる
- verdict 集計ロジックが純粋関数として独立し、直接ユニットテストで不整合の不可能性を証明できる
- no-tool-call / `ok: false` が escalation に統一され、判断材料がない状態に fixer ループを消費しなくなる
- managed runtime で fixer が findings ファイル書き込みに依存せず動作するようになる
- 実在しないファイルを指す blocking finding が approved に化けなくなる（escalation に倒れる）

### Negative / Known Debt

- `fixableCount` ベースの `approved → code-fixer` 最適化経路（`STANDARD_TRANSITIONS` の関連行）が inert になる。agent が `fixableCount` を申告しなくなるため述語が常に false になり、approved は常に conformance へ直行する。findings の `fixableCount` 再計算は別 request
- ok=true で findings を省略する agent が invalid-input retry に乗るようになる。prompt（D9）で findings 提出を明示することで軽減
- managed での transient エラーが escalation に倒れる（getRawFile が 5xx 枯渇で null を返す場合）。fail-safe として許容
- 旧 job（findings を持たない toolResult）を resume すると fixer が findingsPath 方式にフォールバックする（フォールバック有り）

## References

- Request: `specrunner/changes/judge-verdict-from-findings/request.md`
- Design: `specrunner/changes/judge-verdict-from-findings/design.md`
- Spec: `specrunner/changes/judge-verdict-from-findings/spec.md`
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`
- Related: `specrunner/adr/2026-06-04-pipeline-roles-neutral-engine.md`
- Related: `specrunner/adr/2026-06-10-request-review-pipeline-step.md`
