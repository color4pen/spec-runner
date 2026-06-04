# Design: 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する

## Context

pipeline 構成は `PipelineDescriptor`（`src/core/pipeline/types.ts` / `registry.ts`）に集約済みだが、「工程の役割」という同じ情報が 2 箇所に standard pipeline 前提でハードコードされている。

**再開側 — `src/core/resume/resolve-step.ts`**

- `STEP_PHASE_MAP` を `DesignStep` / `SpecReviewStep` / … という具体 Step クラスの import から構築している（standard 決め打ち + standard import）。
- `REVIEWER_STEPS` を `STEP_NAMES.SPEC_REVIEW` / `CODE_REVIEW` リテラルで直書きしている。
- `FIXER_TO_LOOP` を `STANDARD_LOOP_FIXER_PAIRS`（`run.ts` 経由）の reverse で構築している（standard import）。
- `STEP_MAPPING`（phase × role → step）を `STEP_NAMES.*` リテラルで直書きしている。

**エンジン側 — `src/core/pipeline/pipeline.ts`**

- `loopName` の既定値が `STEP_NAMES.SPEC_REVIEW`（standard 固有リテラル）。
- 例外 catch 経路の resumePoint 既定 step が `STEP_NAMES.DESIGN`（standard 固有リテラル）。
- `printPipelineFinished`（まとめ表示）が `STEP_NAMES.SPEC_REVIEW` を 3 箇所直書きしており、summary の対象工程・反復数・最終 verdict を spec-review に固定している。

exhaustion 経路（`handleExhausted` + `LOOP_ERROR_CODES` lookup）と fixer bypass（"fixer が max に達したら reviewer を 1 回だけ再実行する"）は、既に descriptor field（`loopNames` / `loopFixerPairs`）を読んで動く一般則になっている。残る standard 固有の直書きは上記の `SPEC_REVIEW` / `DESIGN` リテラルである。

`JobState` には役割 / phase を持たせず、`pipelineId`（欠落時 `"standard"`）から記述子を解決する構造が既にある（`src/state/pipeline-id.ts`）。役割 / phase を記述子の一級フィールドにし、再開とエンジンが共にそこから導出するようにすれば、任意の記述子が正しく回る。

## Goals / Non-Goals

**Goals**:

- `PipelineDescriptor` に工程の役割（creator / reviewer / fixer / gate）と phase（spec / impl）を一級フィールドとして持たせる。
- `resolve-step.ts` の役割導出（`FIXER_TO_LOOP` / `REVIEWER_STEPS` / `isSpecPhase` / `STEP_MAPPING`）を記述子から導出し、standard 決め打ちと standard import（具体 Step クラス import、`STANDARD_LOOP_FIXER_PAIRS` import、`STEP_NAMES.*` リテラル）を除去する。
- `Pipeline` 本体から standard 固有の直書き（`SPEC_REVIEW` / `DESIGN` リテラル）を除去し、収束意味論（exhaustion 経路 / fixer bypass / まとめ表示）を記述子駆動の一般則にする。
- standard pipeline の画面出力をバイト単位で不変、打ち切り / 救済 / escalation / 遷移の挙動を意味的に不変に保つ。
- 稼働中ジョブを含む既存 state ファイルが本変更後の再開で壊れないことを保証する。
- design-only など非標準記述子で再開が正しい工程に解決する。

**Non-Goals**:

- 各工程の入出力契約・副作用クラスの宣言。
- 新しい記述子・進め方（preset 等）の追加。
- `JobState` スキーマの変更（役割 / phase は記述子側にのみ持たせる）。
- 遷移テーブル（`STANDARD_TRANSITIONS`）の意味変更。

## Decisions

### D1: 役割 / phase を per-step の一級フィールドとして記述子に持たせる

`PipelineDescriptor` に `roles: Readonly<Record<string, StepRoleEntry>>` を追加する。`StepRoleEntry = { role: StepRole; phase: StepPhase }`、`StepRole = "creator" | "reviewer" | "fixer" | "gate"`、`StepPhase = "spec" | "impl"`。記述子に登録された各 step 名に対し、役割と phase を明示的に宣言する。

役割は英語的意味ではなく **収束 / 再開上の振る舞い** で定義する：

- **creator**: phase の成果物を起点として生成する工程。phase ごとに厳密に 1 つ。`--from creator` の再開先。
- **reviewer**: verdict で前進を判定するループ工程。`--from critic` の再開先で、retry 枯渇時にペア fixer へ再ルートされる。phase ごとに厳密に 1 つ。
- **fixer**: reviewer / gate が needs-fix / failed を出したときに起動する修復工程。
- **gate**: 上記以外の工程。決定論的検査（verification / conformance）と線形に前進する工程（test-case-gen / adr-gen / pr-create）を含む。

standard descriptor の割り当て：

| step | role | phase |
|------|------|-------|
| design | creator | spec |
| spec-review | reviewer | spec |
| spec-fixer | fixer | spec |
| test-case-gen | gate | impl |
| implementer | creator | impl |
| verification | gate | impl |
| build-fixer | fixer | impl |
| code-review | reviewer | impl |
| code-fixer | fixer | impl |
| conformance | gate | impl |
| adr-gen | gate | impl |
| pr-create | gate | impl |

不変条件：**各 phase に role=creator は厳密に 1 つ、role=reviewer は厳密に 1 つ**。これが D3 の `STEP_MAPPING` 導出を well-defined にする。

**Rationale**: 役割は pipeline ごとの文脈であり（同じ implementer 工程でも別 pipeline では別役割になり得る）、global な Step 定義ではなく記述子に持たせるのが正しい。`loopFixerPairs` だけでは creator（design / implementer）が fixer pair に現れないため役割を導出できない、という architect 評価に対応する。

**Alternatives considered**:
- *Step 定義に role/phase を持たせる*: Step は global singleton であり pipeline 横断で共有され得るため、pipeline 文脈である役割を持たせると別 pipeline で誤る。却下。
- *記述子に `STEP_MAPPING` を丸ごと持たせる（phase×role×step の表を直接格納）*: 冗長で、per-step role と二重管理になる。per-step role + phase から導出（D3）する方が単一情報源。却下。

### D2: `AgentStep.phase` を廃止し phase の単一情報源を記述子にする

現在 `AgentStep.phase`（`src/core/port/step-types.ts`）は `design` / `spec-review` / `spec-fixer` の 3 ファイルだけが宣言し、唯一の読み手は `resolve-step.ts` である。D1 で phase を記述子に移すため、`AgentStep.phase` フィールドと 3 ファイルの宣言を削除する。

**Rationale**: phase の情報源が記述子と Step 定義の 2 箇所に分かれると drift する。読み手が resolve-step のみ（本変更で記述子駆動に書き換わる）なので削除は安全。

**Alternatives considered**:
- *`AgentStep.phase` を残し記述子と併存*: dead field 化し二重情報源になる。却下。

### D3: `resolve-step.ts` を記述子駆動にする（standard 決め打ち / import 除去）

`resolveResumeStep` の第 1 引数に `descriptor: PipelineDescriptor` を追加する。内部の役割導出を全て記述子から行う純関数として再構成する。分岐の優先順位（priority 1 / 2a / 2b / 2c / 3）とロジックは現行と完全に一致させ、導出元のみ記述子に差し替える。

記述子からの導出（純粋なローカル計算 — I/O なし）：

- `phaseOf(step) = descriptor.roles[step]?.phase ?? "impl"` → `isSpecPhase(step) = phaseOf(step) === "spec"`。
- `REVIEWER_STEPS = { step | descriptor.roles[step].role === "reviewer" }`。
- `FIXER_TO_LOOP = reverse(descriptor.loopFixerPairs)`（fixer → loop step）。fixer-empty 検出に使用。
- `reviewerOf(phase) = 唯一の step where role==="reviewer" && phase 一致`。
- `creatorOf(phase) = 唯一の step where role==="creator" && phase 一致`。
- `STEP_MAPPING[phase] = { critic: reviewerOf(phase), creator: creatorOf(phase), fixer: descriptor.loopFixerPairs[reviewerOf(phase)] }`。

**phase fixer の導出が核心**: impl phase には fixer が 2 つ（build-fixer / code-fixer）存在するため per-step role の lookup では一意に決まらない。phase の再開 fixer は「その phase の reviewer にペアされた fixer」= `loopFixerPairs[reviewerOf(phase)]` で導出する。standard では `loopFixerPairs[code-review]=code-fixer`、`loopFixerPairs[spec-review]=spec-fixer` となり現行 `STEP_MAPPING` と一致する。

import の除去：`DesignStep` / `SpecReviewStep` / … の具体 Step import、`STANDARD_LOOP_FIXER_PAIRS` import、役割導出に使う `STEP_NAMES.*` リテラルを除去する。`AGENT_STEP_NAMES` / `CLI_STEP_NAMES`（`--from` の有効値 universe チェック用、pipeline 非依存の kernel 定数）は残す。

呼び出し側 `src/core/command/resume.ts` は `getPipelineDescriptor(getPipelineId(state))` で記述子を解決し `resolveResumeStep` に渡す。

**Rationale**: 現行ロジックの分岐構造を保ったまま導出元だけ差し替えることで、standard の再開ルーティングをバイト不変に保ちつつ任意記述子へ一般化する。

**Alternatives considered**:
- *resolve-step が記述子レジストリを直接 import*: 呼び出し側が pipelineId→descriptor を解決して注入する方が、resolve-step を standard 非依存の純関数に保てる。却下。

### D4: 非標準記述子で (phase, role) に対応工程が無い場合の挙動

`STEP_MAPPING[phase][role]` が解決できない（例: design-only で reviewer / fixer が存在しない）場合、`resolveResumeStep` は対象工程と理由を明示した Error を投げる。crash 再開（from 未指定 + resumePoint present で reviewer / fixer でない）は従来どおり `resumePoint.step` を返すため、design-only の通常再開（design crash → design）は正しく解決する。

**Rationale**: 現行は design-only でも `STEP_MAPPING` 直書きにより `--from critic` が `spec-review`（design-only に存在しない工程）を返してしまう。記述子駆動化でこの欠陥が解消し、存在しない役割への alias 再開は明示エラーになる。

### D5: `Pipeline` 本体から standard 固有リテラルを除去する

`pipeline.ts` から 3 種の standard 固有直書きを除去する：

1. **`loopName` の `?? STEP_NAMES.SPEC_REVIEW` 既定値を除去**。記述子は常に `loopName` を供給する。omit 時は宣言された loop の先頭（`loopNames[0]`）へフォールバックし、それも無ければ空文字（primary loop 指定なし = どの step も primary loop 扱いしない）とする。standard 固有リテラルを含めない。
2. **例外 catch 経路の resumePoint 既定 step `?? STEP_NAMES.DESIGN` を、`run()` が受け取る `startStep` へのフォールバックに変更**。当該 pipeline の開始工程から再開する方が正しく、standard リテラルを含まない。
3. **まとめ表示を `summaryStep` 記述子フィールド駆動にする**（D6）。

これにより `pipeline.ts` から `STEP_NAMES` import が不要になる（他用途なし）。

exhaustion 経路（`handleExhausted` + `LOOP_ERROR_CODES`）と fixer bypass は既に `loopNames` / `loopFixerPairs` を読む一般則であり、step 名リテラルを本体に持たない。本変更ではこれらが standard 非依存であることを回帰テストで担保する（ロジックは現状維持）。fixer bypass の「どの記述子フィールドで一般表現するか」という設計判断の答えは **reviewer↔fixer のペアリング（`loopFixerPairs`）** であり、bypass は「paired fixer が max に達した reviewer に限り +1 回の再 review を許す」一般則として `loopFixerPairs` から導出される。

**Rationale**: acceptance「本体に standard 固有の直書き（`SPEC_REVIEW` 等）が残っていない」を満たす最小の改変。収束則のロジック自体は既に一般的なので、リテラル除去とパラメータ化に限定し回帰リスクを抑える。

### D6: まとめ表示を `summaryStep` 記述子フィールドで駆動する

`PipelineDescriptor` に `summaryStep?: string` を追加し、`Pipeline` constructor へ伝播する。`printPipelineFinished` は `this.summaryStep` が設定済みかつ `this.steps.has(this.summaryStep)` のときのみ `pipeline:summary` を emit し、対象工程名 / 反復数 / 最終 verdict を `summaryStep` から取る。

- STANDARD_DESCRIPTOR: `summaryStep = "spec-review"` → 現行と同一の `Pipeline finished: spec-review …` を emit。
- DESIGN_ONLY_DESCRIPTOR: `summaryStep` 未設定 → summary を emit しない（現行は `steps.has(SPEC_REVIEW)===false` で emit しないため挙動同一）。

**Rationale**: 現行のゲート条件 `this.steps.has(SPEC_REVIEW)` と出力を、step 名リテラルなしで完全再現する。標準のバイト単位スナップショットを保ちつつ任意記述子で summary 対象を選べる。

**Alternatives considered**:
- *summary を `loopName` から導出*: design-only では `loopName=design` のため `Pipeline finished: design …` を新たに emit してしまい、現行の「emit しない」挙動を破る。却下。

### D7: 互換性 — `JobState` 不変、`pipelineId` → 記述子で再開

`JobState` スキーマは変更しない。役割 / phase は記述子（コード側）にのみ存在する。在来ジョブは `pipelineId`（欠落時 `getPipelineId` が `"standard"`）から STANDARD_DESCRIPTOR を解決し、その役割 / phase 値（D1 の表）が従来の決め打ち（`isSpecPhase` / `REVIEWER_STEPS` / `STEP_MAPPING`）と一致するため、再開ルーティングは不変。これが「既存 state（in-flight 含む）が再開で壊れない」根拠。

役割 / phase は state に永続化されないため、旧 code が書いた state ファイルの migration は不要。新 code は読み込んだ state の `pipelineId` から記述子を解決し直し、導出値が旧ハードコードと一致する。

**Rationale**: architect 評価済みの互換機構をそのまま採用する。

## Risks / Trade-offs

- [リテラル移設で「ソース文字列読み取り・リテラル assert」依存テストが破綻する] → tasks の最初の作業として該当テストを全列挙し、記述子値の import + ランタイム assert へ書き換える（T-01）。`resolveResumeStep` の signature 変更と `Pipeline` constructor の `summaryStep` 追加に依存するテストも同列挙に含める。
- [fixer bypass の一般表現を誤ると稼働中ジョブの再開互換が壊れる（最大リスク）] → bypass を `loopFixerPairs` 駆動の現行ロジックのまま維持し、step 名リテラルを増やさない。回帰の歯として打ち切り / 救済 / escalation の挙動テストと、in-flight を含む既存 state の再開互換テストを敷く（T-06）。
- [`STEP_MAPPING` 導出が phase ごとの creator / reviewer 一意性に依存する] → D1 の不変条件（各 phase に creator 1・reviewer 1）を記述子で保証し、impl の fixer 一意化は `loopFixerPairs[reviewer]` で解決する。標準記述子の役割割り当てが現行ハードコードと完全一致することをテストで担保（T-06）。
- [`AgentStep.phase` 削除が想定外の読み手を壊す] → 読み手が resolve-step のみであることを grep で確認済み。削除前に再確認する（T-02）。
- [`loopName` 既定値除去が loopName を渡さない構成を壊す] → 既定を `loopNames[0]`（standard 非依存）にフォールバックさせ、記述子は常に loopName を供給するため production 影響なし。omit する ad-hoc テストがあれば列挙して loopName を明示（T-01 / T-06）。

## Open Questions

- 規模が spec-review の審査範囲を超える場合、「役割 / phase の一級化 + 再開導出（D1〜D4, D7）」と「エンジンの収束意味論の記述子駆動化（D5, D6）」の 2 段への分割を spec-review の判断に委ねる。両者は同一抽象の表裏であり、本設計は一体として記述するが、分割しても各段が独立にビルド / テスト green を保てる順序（D1→D3 を先、D5→D6 を後）で tasks を構成する。

## Migration Plan

- コード内変更のみ。state ファイルの migration なし（D7）。
- 段階的安全性: D1（記述子フィールド追加 + STANDARD/DESIGN_ONLY 充足）は additive で既存挙動に影響しない。続いて D3（resolve-step）→ D5/D6（engine）の順で適用し、各段で `bun run typecheck && bun run test` を green に保つ。
- ロールバック: 記述子フィールドと導出ロジックの追加が中心であり、リテラル除去前の commit へ revert すれば従来挙動へ戻る。state は不変のため revert に伴うデータ移行不要。
