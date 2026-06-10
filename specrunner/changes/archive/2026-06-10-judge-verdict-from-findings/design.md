# Design: judge 系 step の verdict を構造化 findings から CLI が導出する

## Context

judge 系 step（spec-review / code-review / request-review）の verdict は、agent が
`report_result` tool で申告する `approved` boolean（`src/core/step/executor.ts` finalizeStep の
judge 分岐）をそのまま採用している。指摘内容は agent が markdown の result ファイルに書いており、
verdict とファイル内容を突き合わせる仕組みがない。このため「CRITICAL を列挙しながら approved」
「non-blocking 指摘で needs-fix を返しループが止まらない」という findings と verdict の不整合が
構造的に起き得る。

agent の判断を「finding 単位のラベル付け」に限定し、verdict の集計（合否・fixer 行き・
escalation 行き）を CLI の決定的な関数へ移すことで、この不整合を構造的に排除する。
「AI の非決定性を step の中に封じ込め、orchestrator は決定的に保つ」原則に合致する。

現状の主要な制約:

- `executor.ts` finalizeStep は reportTool identity（`JUDGE_REPORT_TOOL` /
  `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL`）で judge / request-review 分岐を
  判定し、非 null toolResult から verdict を決める。null toolResult（no-tool-call）の judge は
  現状 `needs-fix`
- `pipeline.ts` は `const nextStep = transition?.to ?? "escalate"` で、マッチ行が無い outcome を
  自動的に escalate へ倒す。spec-review / code-review には `escalation` 行が無い（R3 cutover）
- managed runtime は CLI からブランチへファイル書き込みができない（`finalizeStepArtifacts` は
  no-op）。実在検証は `GitHubClient.getRawFile` で行う
- parseInput は純粋関数（B-5）として維持する必要がある（ファイル I/O 禁止）

## Goals / Non-Goals

**Goals**:

- judge 系 step の `report_result` スキーマに構造化 `findings` 配列を追加する
- verdict を findings の決定的な集計から導出し、`approved` / `fixableCount` / `verdict`
  ラベルを routing から外す
- verdict に影響する findings の `file` / `line` の実在を session 後に検証し、不実在なら
  escalation に倒す（runtime 差異は RuntimeStrategy seam に閉じ込める）
- findings を job state に永続化し、fixer へ prompt 経由で渡す
- no-tool-call / `ok: false` を escalation に統一する

**Non-Goals**:

- verification step（CLI step）の `## Verdict:` regex parse の置き換え
- producer 系 step（design / implementer / fixer / test-case-gen / adr-gen）の
  `report_result` スキーマ変更
- agent が任意で書く markdown result ファイルの廃止（記録として残す）
- prompt injection 対策（request.md / git log のサニタイズ）
- `fixableCount` を findings から再計算して approved→code-fixer 最適化経路を維持すること（D11）
- pipeline transition テーブルの語彙変更（D5 で無変更が成立することを示す）

## Decisions

### D1: `Finding` 型は kernel に定義し、state schema を widen する

`Finding` 型は最下層の `src/kernel/report-result.ts` に置く。理由は依存方向:
`state/schema.ts → kernel`（許可）、`core/port → kernel`（許可）の両方から参照できる唯一の
場所が kernel であり、`state` は `core/port` を import できないため。

```ts
// src/kernel/report-result.ts
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

`StepOutcome.toolResult`（`src/state/schema.ts`）を `BaseReportResult` から
`(BaseReportResult & { findings?: Finding[] }) | null` に widen する。`StepResultInput.toolResult`
（`src/state/helpers.ts`）も同様に widen する。これで findings が job state の型に含まれる。

**Rationale**: kernel は parseInput を持たない純粋な型置き場であり、`Finding` を kernel に
置くことで port / state 双方が DSM 違反なく参照できる。verdict 導出に必要な意味
（severity / resolution）は型に内包される。

**Alternatives considered**: `Finding` を `core/port/report-result.ts` に置く案。state は port を
import できない（依存方向違反）ため、`StepOutcome.toolResult` の widen に使えず却下。

### D2: `report_result` スキーマに findings 配列を追加する（zod/v4-mini）

`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL`
（`src/core/step/report-tool.ts`）の zodSchema に `findings` を追加する。

```ts
import { array } from "zod/v4-mini"; // 既存 import に追加

const findingSchema = array(object({
  severity: union([literal("critical"), literal("high"), literal("medium"), literal("low")]),
  resolution: union([literal("fixable"), literal("decision-needed")]),
  file: string(),
  line: optional(number()),
  title: string(),
  rationale: string(),
}));
// 各 judge-family tool の zodSchema に `findings: optional(findingSchema)` を追加
```

`approved` / `fixableCount` / `verdict` フィールドは互換のため残す。managed runtime の
`tools.input_schema` 変換は既存の `toCustomToolSpec`（`toJSONSchema(object(...))`）経路を
そのまま使える（外部制約で動作確認済み）。

**Rationale**: 外部制約により zod/v4-mini は `array(object({...}))` と `toJSONSchema` を
サポートする。zodSchema を single source of truth とし、JSON Schema は派生のまま保つ。

**Alternatives considered**: findings を JSON 文字列 1 フィールドで受ける案。型安全性と JSON Schema
による agent 側バリデーションを失うため却下。

### D3: findings の構造検証は手書き parser で行い、ok=true 時は必須とする

`parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput`
（`src/core/port/report-result.ts`）に findings 配列の構造検証を追加する。zod parse は使わず
typeof チェックで実装し、parseInput の純粋性（B-5）を維持する。共有 helper
`parseFindings(raw)` を 1 つ置き、3 つの parse 関数から呼ぶ。各要素について `severity` ∈ 4 値、
`resolution` ∈ 2 値、`file` string、`title` string、`rationale` string、`line` は number または
欠落、を検証する。

findings の扱い:

- `ok === true` かつ findings が**欠落** → `missingFields: ["findings"]`（invalid-input retry）
- `ok === true` かつ findings が**存在するが不正構造** → `missingFields: ["findings"]`（同上）
- `ok === false`（自発的失敗）→ findings は必須としない（voluntary failure を受理）

`JudgeReportResult` / `CodeReviewReportResult` / `RequestReviewReportResult` に
`findings?: Finding[]` を追加する。

**Rationale**: judge step の verdict は findings の集計で決まる。`ok: true` で findings を省略
できると「report by omission で approved」という不整合が再発する。ok=true 時に findings を
必須化し、retry を尽くしても満たさない場合は adapter が toolResult を null のまま返す（D7 で
no-tool-call → escalation に倒れる、fail-safe）。不正構造を `missingFields` に乗せることで既存の
follow-up retry（`DEFAULT_TOOL_RETRY`、`reason: "invalid-input"`）にそのまま乗る。

**Alternatives considered**: findings を常に optional 扱いし欠落 → 空配列（approved）とする案。
approved-by-omission を許し本変更の目的に反するため却下。実在検証を parseInput に含める案は B-5
（parseInput 純粋性）違反のため却下し、session 後の事後検証（D6）に分離する。

### D4: verdict 導出は純粋関数モジュールに切り出し、executor から呼ぶ

新規 `src/core/step/judge-verdict.ts` に純粋関数を置く。

```ts
import type { Finding } from "../../kernel/report-result.js";

// spec-review / code-review（優先順位順）
export function deriveJudgeVerdict(findings: Finding[] | undefined, ok: boolean):
  "approved" | "needs-fix" | "escalation" {
  if (ok === false) return "escalation";
  const fs = findings ?? [];
  if (fs.some((f) => f.resolution === "decision-needed")) return "escalation";
  if (fs.some((f) => f.severity === "critical" || f.severity === "high")) return "needs-fix";
  return "approved";
}

// request-review（2 値）
export function deriveRequestReviewVerdict(findings: Finding[] | undefined, ok: boolean):
  "approve" | "needs-discussion" {
  if (ok === false) return "needs-discussion";
  const blocking = (findings ?? []).some(
    (f) => f.severity === "critical" || f.severity === "high" || f.resolution === "decision-needed");
  return blocking ? "needs-discussion" : "approve";
}

// verdict に影響する findings（critical / high / decision-needed）を抽出
export function collectVerdictAffectingFindings(findings: Finding[] | undefined): Finding[];
```

`executor.ts` finalizeStep の judge / request-review 分岐（非 null toolResult）を上記関数の
呼び出しに差し替える。

**Rationale**: 純粋関数に切り出すことで verdict の集計ロジックを直接ユニットテストでき、findings と
verdict の不整合が構造的に起きないことを証明できる（受け入れ基準）。executor は導出関数の呼び出しと
state 更新に専念する。

**Alternatives considered**: 導出ロジックを executor 内にインラインで書く案。テスト時に executor の
I/O ライフサイクル全体をスタブする必要があり、verdict 判定単体のテストが書きづらいため却下。

### D5: escalation の routing は transition の既定動作（default-to-escalate）で成立する

`deriveJudgeVerdict` が返す `escalation` は spec-review / code-review の transition 行に存在しない
（R3 cutover で削除済み）。しかし `pipeline.ts` の `const nextStep = transition?.to ?? "escalate"`
により、マッチ行が無い outcome は自動的に `escalate`（→ awaiting-resume）へ倒れる。したがって
transition テーブルは**無変更**で decision-needed / ok:false / 実在検証失敗による escalation
routing が成立する。request-review の `escalation` 上書き（実在検証失敗時）も `escalation` 行が
無いため同様に escalate に倒れる。`needs-discussion` / `reject` 行は互換のため残す。

**Rationale**: architect 評価済みの「pipeline 本体のルーティングは verdict 語彙を変えないため
無変更で成立」を、`transition?.to ?? "escalate"` の既定動作として裏付ける。transition 行を
追加しないことで pipeline の語彙を増やさない。

**Alternatives considered**: spec-review / code-review に `{ on: "escalation", to: "escalate" }`
行を明示追加する案。R3 cutover で意図的に削除した行を復活させることになり、default-to-escalate と
重複するため却下（pipeline.transitions テストで default 動作を明示的に検証する）。

### D6: 実在検証は RuntimeStrategy の新 seam `verifyFindingRefs` に置く

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に domain-neutral な DTO とメソッドを
追加する。

```ts
export interface FindingRef { file: string; line?: number; }

// verdict に影響する finding 参照のうち、実在しないものを返す。
//  - local:   path.join(cwd, file) の fs 存在確認（line があれば行数 >= line）
//  - managed: githubClient.getRawFile(owner, repo, branch, file) の null 判定（line も同様）
//  空配列 → 空配列（呼び出し側で no-op 判定）
verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>;
```

executor finalizeStep の流れ（judge / request-review の非 null toolResult のみ）:

1. `deriveJudgeVerdict` / `deriveRequestReviewVerdict` で verdict を導出
2. `collectVerdictAffectingFindings(tr.findings)` → `FindingRef[]`
3. refs が空でなければ `deps.runtimeStrategy?.verifyFindingRefs(refs, cwd, state.branch)` を await
4. 戻り値（不実在 refs）が 1 件以上なら `verdict = "escalation"` に上書き

local 実装は `local.ts` の `validateStepInputs` / `captureHeadSha` と同じ fs / `this.spawnFn`
パターンに倣う。managed 実装は `managed.ts` の `validateStepInputs` と同じく `this.githubClient` /
`this.repo`（owner/name）を使う。finding 1 件につき getRawFile 1 回の GitHub API 呼び出しになる
（外部制約）。`getRawFile` が transient エラーで null を返した場合も「不実在」と扱い escalation に
倒す（fail-safe）。

**Rationale**: B-8（runtime 分岐の集約）に沿い、local = worktree fs / managed = GitHubClient の
差異を 1 つの seam に閉じ込める。verdict に影響しない low / medium を検証対象外にすることで API
呼び出しコストを抑える（approved 導出時は影響 findings 0 件で検証は no-op）。

**Alternatives considered**: 実在検証を executor 内で runtime 判定して分岐する案。B-8（runtime
分岐集約）違反のため却下。parseInput 内で検証する案は B-5（純粋性）違反のため却下。

### D7: no-tool-call と ok:false を escalation に統一する

executor finalizeStep の no-tool-call フォールバック（toolResult === null）の judge 分岐を
`needs-fix` から `escalation` に変更する。request-review の null フォールバックは
`needs-discussion`（escalate 経路）のまま据え置く。`ok: false` 報告は D4 の導出関数内で
`escalation`（judge）/ `needs-discussion`（request-review）に倒れる。

**Rationale**: 旧実装の no-tool-call → needs-fix は fixer ループ → 上限 exhaustion で halt する
迂遠な経路だった。findings（判断材料）が無い状態は人間にエスカレートするのが妥当。

**Alternatives considered**: no-tool-call を error（hard fail）にする案。error は AGENT_STEP_FAILED
系の異常終了を意味し、resumable な escalation の方が運用上扱いやすいため却下。

### D8: fixer は state の findings を prompt に埋め込み、無ければ findingsPath にフォールバックする

`fixer-helpers.ts` に以下を追加する。

```ts
// 直前の judge run（spec-review / code-review）の toolResult.findings を取得。無ければ null。
export function getLatestJudgeFindings(state: JobState, judgeStepName: string): Finding[] | null;
// findings を fixer prompt 本文に整形（severity / file:line / title / rationale）。
export function buildFindingsBlock(findings: Finding[]): string;
```

`spec-fixer.ts` / `code-fixer.ts` の `buildMessage`:

- `getLatestJudgeFindings(state, SPEC_REVIEW | CODE_REVIEW)` が findings を返す →
  `buildFindingsBlock` で本文に埋め込む（初回・継続の両方）。findingsPath ファイル読み込み指示は
  載せない
- null（旧 toolResult の resume）→ 現行の findingsPath 方式にフォールバック

`buildContinuationMessage` には findings 埋め込み版の分岐を用意する。build-fixer は対象外
（findings 源が verification の prose result であり構造化 findings が存在しないため findingsPath
方式を維持）。

**Rationale**: managed runtime は CLI からブランチへファイル書き込みができず構造化 toolResult を
唯一の正とする。fixer 入力を state の findings に切り替えることで markdown result ファイルを
load-bearing から外す。旧 job 互換のため findingsPath フォールバックを残す。

**Alternatives considered**: fixer に findings ファイルを CLI が生成して渡す案。managed では CLI が
ブランチへ書き込めない（外部制約）ため成立せず却下。

### D9: judge 系 system prompt を findings 提出指示に更新する

`spec-review-system.ts` / `code-review-system.ts` / `request-review-system.ts` の system prompt
（および code-review の followUpPrompt self-check）に、`report_result` の `findings` 配列提出を
指示する文と、severity / resolution の判定基準を明記する。

- `severity`: critical / high / medium / low（PIPELINE_RULES の既存定義に準拠）
- `resolution`: `fixable`（この PR で fixer が機械的に修正可能）/ `decision-needed`（人間の判断・
  設計変更・スコープ確認が必要）
- `file` は path のみ（`path:line` 結合形式を使わない）、`line` は行番号（任意）
- verdict / approved の自己申告は CLI が無視し、findings 集計で決まる旨を明記

markdown result ファイルは記録として引き続き出力させる（廃止しない）。

**Rationale**: 判定基準を prompt に明記することで agent の finding ラベル付けの一貫性を高める。
verdict ラベルの自己申告が無視されることを agent に知らせ findings の質に注力させる。

**Alternatives considered**: prompt を変えずスキーマだけ拡張する案。agent が severity/resolution の
基準を共有しないと findings の質がばらつくため却下。

### D10: findings の永続化は parse 値の流路で自動的に達成される

`report_result` の parse 値（findings を含む）は adapter が `toolResult` として返し、executor
finalizeStep が `pushStepResult(..., { toolResult: agentResult.toolResult, ... })` で
`StepOutcome.toolResult` に書き込む。D1 で型を widen するため findings は型・実体ともに job state に
記録される。追加の書き込み経路は不要。

**Rationale**: 既存の toolResult 永続化経路に findings が自然に乗る。pipeline の `when` 述語が
`outcome.toolResult as CodeReviewReportResult` で読むのと同じ構造。

**Alternatives considered**: findings 専用の永続化フィールドを StepRun に追加する案。toolResult に
内包される情報を二重化するため却下。

### D11: `fixableCount` ベースの approved→code-fixer 最適化は inert になる（trade-off）

`STANDARD_TRANSITIONS` の `code-review approved + fixableCount > 0 → code-fixer` 行は toolResult の
`fixableCount` を読む。agent は今後 `fixableCount` を申告しないため、この述語は常に false
（`?? 0`）となり approved は常に conformance へ直行する。本変更では `fixableCount` を findings から
再計算しない（Non-Goal）。transition 行は互換のため残す。

**Rationale**: approved は blocking 問題が無い状態であり、low / medium の fixable 指摘の自動修正は
品質に必須ではない。findings からの再計算は scope を広げるため見送る。

**Alternatives considered**: `fixableCount` を `resolution: fixable` の件数から executor が再計算
して toolResult にセットする案。toolResult 書き換えと scope 拡大を伴うため別 request に切り出す。

## Risks / Trade-offs

- **[approved→code-fixer 最適化の喪失（D11）]** `fixableCount` が常に 0 になり approved 時の
  低 severity 自動修正経路が動かなくなる → Mitigation: approved は blocking なしを意味するため品質
  影響は小さい。必要なら別 request で findings からの再計算を追加
- **[実在検証の API コスト（managed）]** blocking finding 1 件につき getRawFile 1 回 → Mitigation:
  検証対象を verdict-affecting に限定。approved 導出時は対象 0 件で no-op。1 iteration の blocking
  finding は通常少数
- **[transient エラーで escalation に倒れる]** getRawFile が 5xx 枯渇で null を返すと不実在扱いに
  なる → Mitigation: fail-safe（人間が findings を確認）として許容。getRawFile は retry/backoff を
  内包する
- **[findings 必須化による retry 増加]** ok=true で findings を省略した agent が invalid-input
  retry に乗る → Mitigation: prompt（D9）で findings 提出を明示。retry 上限超過時は no-tool-call
  扱いで escalation（安全側）
- **[RuntimeStrategy 実装の追従漏れ]** 新 seam `verifyFindingRefs` を local / managed / テスト
  fake の全実装に追加する必要がある → Mitigation: TypeScript の interface 実装チェックで漏れを
  検出。tasks に全実装更新を明記

## Open Questions

- request-review findings の `file` は通常 `request.md` を指すため実在検証は実質 trivial に true に
  なる。request-review に実在検証を適用する実利は薄いが、judge-family で挙動を統一するため適用する
  （別扱いにすると executor の分岐が増える）。この統一方針で問題ないか
- `line` の実在検証粒度: 「ファイルの行数 >= line」までを検証する。行内容の妥当性（その行が本当に
  指摘箇所か）までは検証しない。この粒度で受け入れ基準を満たすか
