# ADR-20260604b: 工程の役割と phase を PipelineDescriptor に一級化し、resume とエンジンの収束意味論をそこから導出する

**Date**: 2026-06-04
**Status**: accepted

## Context

`PipelineDescriptor` への pipeline 構成の集約（ADR-20260604）が完了したが、「工程の役割」という情報が依然 2 箇所に標準 pipeline 前提でハードコードされていた。

- **再開側 — `src/core/resume/resolve-step.ts`**: `FIXER_TO_LOOP` / `REVIEWER_STEPS` / `isSpecPhase` / `STEP_MAPPING`（phase × role × step）を、具体 Step クラスの import・`STANDARD_LOOP_FIXER_PAIRS` import・step 名リテラルで構成。標準前提の決め打ちであり、非標準記述子では正しく再開できない。
- **エンジン側 — `src/core/pipeline/pipeline.ts`**: `loopName` 既定値・例外時の resumePoint 既定 step・まとめ表示 (`printPipelineFinished`) が `SPEC_REVIEW` / `DESIGN` リテラルで固定。

前 ADR はこれを既知の負債として先送りしており、本変更が解決する。

## Decision

### D1: 役割 / phase を per-step の一級フィールドとして PipelineDescriptor に持たせる

`StepRole = "creator" | "reviewer" | "fixer" | "gate"`、`StepPhase = "spec" | "impl"`、`StepRoleEntry = { role: StepRole; phase: StepPhase }` を定義し、`PipelineDescriptor` に `roles: Readonly<Record<string, StepRoleEntry>>` を追加する。

役割の定義は英語的意味ではなく **収束 / 再開上の振る舞い** による：

- **creator**: phase の成果物を起点として生成する工程。phase ごとに厳密に 1 つ。`--from creator` の再開先。
- **reviewer**: verdict で前進を判定するループ工程。`--from critic` の再開先。retry 枯渇時にペア fixer へ再ルートされる。phase ごとに厳密に 1 つ。
- **fixer**: reviewer / gate が needs-fix / failed を出したときに起動する修復工程。
- **gate**: 上記以外。決定論的検査と線形前進工程を含む。

不変条件: **各 phase に role=creator は厳密に 1 つ、role=reviewer は厳密に 1 つ**。これが D3 の STEP_MAPPING 導出を well-defined にする。

役割は pipeline 文脈であり（同じ工程でも pipeline が違えば役割が異なり得る）、global な Step 定義ではなく記述子に持たせる。

### D2: `AgentStep.phase` を廃止し phase の単一情報源を記述子にする

現行の `AgentStep.phase` フィールド（`src/core/port/step-types.ts`）は `design` / `spec-review` / `spec-fixer` の 3 ファイルのみが宣言し、唯一の読み手は `resolve-step.ts` である。D1 で phase を記述子に移すため、`AgentStep.phase` フィールドと 3 ファイルの宣言を削除する。情報源を記述子に一本化して drift を防ぐ。

### D3: `resolve-step.ts` を記述子駆動にする

`resolveResumeStep` の第 1 引数に `descriptor: PipelineDescriptor` を追加する。内部の役割導出を全て記述子から行う純関数として再構成し、分岐の優先順位とロジックは現行と完全に一致させる。

記述子からの導出：

- `phaseOf(step) = descriptor.roles[step]?.phase ?? "impl"` → `isSpecPhase`
- `REVIEWER_STEPS = { step | descriptor.roles[step].role === "reviewer" }`
- `FIXER_TO_LOOP = reverse(descriptor.loopFixerPairs)`
- `reviewerOf(phase)` / `creatorOf(phase)` = 各 phase で role が一致する唯一の step
- `STEP_MAPPING[phase].fixer = loopFixerPairs[reviewerOf(phase)]`（impl phase に fixer が複数あっても一意に決まる）

具体 Step クラスの import・`STANDARD_LOOP_FIXER_PAIRS` の import・役割導出のための step 名リテラルを除去する。

呼び出し側 `resume.ts` は `getPipelineDescriptor(getPipelineId(state))` で記述子を解決して注入する。

### D4: 非標準記述子で (phase, role) に対応工程が無い場合はエラーとする

記述子に該当する (phase, role) の工程が存在しない alias 再開要求（例: design-only に対する `--from critic`）は、対象と理由を明示した Error を投げる。通常の crash 再開（`--from` 未指定 + resumePoint present）は従来どおり `resumePoint.step` を返すため、design-only の通常再開（design crash → design）は正しく解決する。

### D5: `Pipeline` 本体から standard 固有リテラルを除去する

3 種の直書きを除去する：

1. **`loopName` の `?? STEP_NAMES.SPEC_REVIEW` 既定値**: 記述子が常に `loopName` を供給する。omit 時は `loopNames[0]` へフォールバックし、それも無ければ空文字。
2. **例外 catch 経路の resumePoint 既定 step `?? STEP_NAMES.DESIGN`**: `run()` が受け取る `startStep` へのフォールバックに変更。
3. **まとめ表示の `SPEC_REVIEW` リテラル**: D6 の `summaryStep` フィールドで駆動する。

これにより `pipeline.ts` から `STEP_NAMES` import が不要になる。exhaustion 経路（`handleExhausted`）と fixer bypass は既に `loopNames` / `loopFixerPairs` を読む一般則であり変更しない。

fixer bypass の一般表現: 「paired fixer が maxIterations に達した reviewer に限り +1 回の再 review を許す」。`loopFixerPairs` から導出され、standard 固有の直書きを含まない。

### D6: まとめ表示を `summaryStep` 記述子フィールドで駆動する

`PipelineDescriptor` に `summaryStep?: string` を追加する。`printPipelineFinished` は `this.summaryStep` が設定済みかつ `this.steps.has(this.summaryStep)` のときのみ `pipeline:summary` を emit する。

- STANDARD_DESCRIPTOR: `summaryStep = "spec-review"` → 現行と同一の出力
- DESIGN_ONLY_DESCRIPTOR: `summaryStep` 未設定 → summary を emit しない（現行と同一）

### D7: 互換性 — `JobState` 不変、`pipelineId` → 記述子で再開

`JobState` スキーマは変更しない。役割 / phase は記述子（コード側）にのみ存在する。在来ジョブは `pipelineId`（欠落時は `getPipelineId` が `"standard"` を返す）から STANDARD_DESCRIPTOR を解決し、その役割 / phase 値が従来の決め打ちと一致するため、稼働中ジョブを含む既存 state の再開ルーティングは不変。state ファイルの migration は不要。

### Convention: 結果未報告時の approved 既定値は全 pipeline 共通

verdict も completionVerdict も無い工程は成功扱いで次へ進む既定は standard 固有ではなく全パイプライン共通の convention であり、エンジンの汎用 convention として維持する。記述子駆動化の対象は standard 固有の収束意味論に限る。

## Alternatives Considered

### Alternative 1: Step 定義に role / phase を持たせる（D1）

- **Pros**: Step が自己記述的になる。pipeline を意識せず Step オブジェクト単体から役割を参照できる
- **Cons**: Step は global singleton であり pipeline 横断で共有され得るため、pipeline 文脈である役割を持たせると別 pipeline で誤る
- **Why not**: 役割は pipeline ごとの文脈であり（同じ implementer 工程でも別 pipeline では別役割になり得る）、global な Step 定義ではなく記述子に持たせるのが正しい

### Alternative 2: `STEP_MAPPING`（phase × role × step の表）を記述子に直接格納する（D1）

- **Pros**: 役割導出の計算が不要で直接 lookup できる。`STEP_MAPPING` の構造がそのまま記述子に見える
- **Cons**: per-step role と二重管理になり情報源が分散する。per-step role を変えても STEP_MAPPING 側を合わせて変える必要が生じる
- **Why not**: per-step role + phase から導出（D3）する方が単一情報源であり、不変条件（各 phase に creator/reviewer が 1 つずつ）の検証も一箇所で済む

### Alternative 3: `AgentStep.phase` を残し記述子と併存させる（D2）

- **Pros**: 既存コードへの変更量が少ない。Step 定義ファイルを触らなくて済む
- **Cons**: dead field 化し二重情報源になる。記述子と Step 定義の間で drift するリスクが生じる
- **Why not**: `AgentStep.phase` の唯一の読み手は `resolve-step.ts`（本変更で記述子駆動に書き換わる）のみであることを grep で確認済みのため、削除が安全

### Alternative 4: resolve-step が記述子レジストリを直接 import する（D3）

- **Pros**: 呼び出し側のコードがシンプルになる。`pipelineId` → descriptor 解決の責務を呼び出し側に持たせなくて済む
- **Cons**: resolve-step がレジストリ（= standard 記述子の知識）に直接依存し、standard 非依存の純関数でなくなる
- **Why not**: 呼び出し側（`resume.ts`）が pipelineId→descriptor を解決して注入する方が、resolve-step を完全に記述子駆動の純関数として保てる

### Alternative 5: まとめ表示の対象工程を `loopName` から導出する（D6）

- **Pros**: 追加フィールド不要。既存の `loopName` フィールドから自動的に summary 対象が決まる
- **Cons**: design-only では `loopName=design` のため `Pipeline finished: design …` を新たに emit してしまい、現行の「emit しない」挙動を破る
- **Why not**: `summaryStep` フィールドを追加することで、step 名リテラルなしに現行のゲート条件（`steps.has(SPEC_REVIEW)`）と出力を完全再現できる

## Consequences

### Positive

- 任意の `PipelineDescriptor` が正しく再開・収束するようになる（pipeline-neutral engine の実現）
- `resolve-step.ts` が pure function になり、standard 依存が除去される
- `pipeline.ts` から `STEP_NAMES` import が不要になり、エンジンと標準定義の結合が切れる
- design-only 記述子で `--from critic` が存在しない工程へのルーティングをエラーで明示できるようになる

### Negative

- リテラルを記述子へ移設したため、ソース文字列読み取り・リテラル assert に依存するテストを記述子値の import + ランタイム assert へ書き換える必要があった
- `resolveResumeStep` の signature が変わり、呼び出し側に記述子解決の責務が生じた

### Known Debt / Deferred

- 各工程の入出力契約・副作用クラスの宣言は本変更のスコープ外
- 新しい記述子・進め方（preset 等）の追加は別 request で扱う

## References

- Request: `specrunner/changes/pipeline-roles-neutral-engine/request.md`
- Design: `specrunner/changes/pipeline-roles-neutral-engine/design.md`
- Spec: `specrunner/changes/pipeline-roles-neutral-engine/spec.md`
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（本変更が解決した Known Debt の出所）
- Related: `specrunner/adr/2026-04-27-cli-core-pipeline.md`（Pipeline クラス設計）
