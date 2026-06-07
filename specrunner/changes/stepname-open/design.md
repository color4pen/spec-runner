# Design: `as StepName` force cast を validated cast に置き換える

## Context

`StepName` は `STEP_NAMES` から導出される固定の string literal union 型（`src/state/schema.ts`）。
動的に決まる step 名（`string`）を `ResumePoint.step`（型 `StepName`）等へ代入する際、現状は `as StepName`
による force cast で型を黙らせている。force cast は値の妥当性を一切検証せず、step 名の追加・改名時に
不正な値が compile error にも runtime error にもならず黙って通過する。

`toStepName(name: string): StepName`（whitelist 検証付きの cast）は以前 `resolve-step.ts` に存在したが、
resume-simplify（#545）で `resolveResumeStep` 簡素化に伴い削除された。pipeline / runtime / executor 側の
cast 箇所はその後も残っており、検証なし cast のままになっている。

対象の `as StepName` は src 配下に 8 箇所:

| # | File | Cast 元の値の型 |
|---|------|-----------------|
| 1 | `src/core/pipeline/pipeline.ts:102` | `finalState.step ?? startStep`（`string`） |
| 2 | `src/core/pipeline/pipeline.ts:294` | `currentStep`（`string`） |
| 3 | `src/core/pipeline/pipeline.ts:505` | `loopFixerPairs[...] ?? exhaustedLoopName`（`string`） |
| 4 | `src/core/step/executor.ts:297` | `step.name`（`string`） |
| 5 | `src/core/resume/resolve-step.ts:22` | `from`（`string`、直前に whitelist 検証済み） |
| 6 | `src/core/runtime/local.ts:718` | `current.step ?? startStep`（`string`） |
| 7 | `src/core/runtime/managed.ts:398` | `startStep`（`string`） |
| 8 | `src/core/command/resume.ts:147` | `state.step`（`string`、結果は `StepName \| undefined`） |

`JobState.step` は `string`、`startStep` parameter も `string`、`loopFixerPairs` は `Record<string, string>`、
`Step.name` は `string`。いずれも cast 元は `string`（または `string | undefined`）であり、検証付き変換に置換できる。

スコープ外の 1 箇所 `src/store/job-state-store.ts:674` は `(validated.step ?? "init") as StepName`。
`"init"` は `StepName` の member ではない journal 復元時の特殊フォールバック値であり、`toStepName` の単純置換では
throw して壊れる。本 change では touch しない。

## Goals / Non-Goals

**Goals**:

- `toStepName(name: string): StepName` を再導入する（runtime whitelist 検証付き、不正値で throw）。
- 上記 8 箇所の `as StepName` を `toStepName()` 呼び出しに置き換え、動的 step 名の代入を検証付きにする。
- `StepName` 型自体（string literal union）は変更しない。

**Non-Goals**:

- `StepName` を open な `string` 型へ変更する（汎用パイプライン化）。別 request。
- step 名の追加・削除・改名。
- `job-state-store.ts:674` の `"init"` フォールバック cast への対処（別途扱う）。

## Decisions

### D1: `toStepName` の配置先は `src/core/step/step-names.ts`

`toStepName(name: string): StepName` を step 名バレル `src/core/step/step-names.ts` に export する。
この module は現状 `export * from "../../kernel/step-names.js"` で、step 名定数（`AGENT_STEP_NAMES` /
`CLI_STEP_NAMES` / `STEP_NAMES`）の re-export 入口になっている。検証に使う whitelist 集合はまさにここで
re-export される定数から構成できるため、「検証関数を、検証対象の whitelist 定数と同じ import 入口に置く」
という single-source の配置になる。

シグネチャ（interface のみ）:

```ts
export function toStepName(name: string): StepName;
```

- **Rationale: why ここ、not 他**:
  - 全 consumer（pipeline / executor / runtime / resume / command）は既に低層の `state/schema` と
    step 名バレルへ依存しており、ここに置けば **新規の cross-module 結合を一切増やさない**。
  - `core/step` 層は `state/schema`（`StepName` 型の定義元）への依存が許容される層であり
    （`executor.ts` が既に import 済み）、`import type { StepName }` を 1 つ足すだけで型整合が取れる。
- **Alternatives considered**:
  - **`src/kernel/step-names.ts`（canonical leaf）に置く**: 却下。`toStepName` の戻り値型 `StepName` は
    `state/schema.ts` で定義されている。kernel は現状どの上位層にも依存しない leaf（`state` を含め import 0 件）で
    あり、ここから `state/schema` を import すると確立済みの「kernel は state に依存しない」層構造を破る
    （type-only import でも層の向きとしては逆流）。戻り値型を `typeof STEP_NAMES[keyof typeof STEP_NAMES]` と
    inline 展開すれば import を回避できるが、`StepName` という名前を捨てて型式を複製することになり可読性が劣る。
  - **`src/core/resume/resolve-step.ts`（削除前の旧位置）に戻す**: 却下。`resolve-step.ts` は `core/resume`
    feature module。現状 pipeline / executor / runtime のいずれも `core/resume` へ依存していない。ここへ
    `toStepName` を置くと、これら下位寄りの module から feature module への **新規の上方向結合** が 4 ファイル
    分発生する。検証関数は「resume の関心事」ではなく「step 名の関心事」であり、配置として不適。

### D2: `resume.ts:147` は optional を保つ条件付き変換にする

8 箇所のうち `resume.ts:147` だけは結果型が `StepName | undefined`（`startStepForCheck` は後続の
`if (startStepForCheck)` ガードで optional として扱われる）。`state.step` は型上 `string` だが、ジョブ生成直後など
step 未確定の局面では空文字になり得る。`toStepName(state.step)` の無条件適用は空文字／非 step 値で throw し、
従来「falsy なら guard を skip」していた挙動を壊す。

したがってこの 1 箇所は単純置換せず、**値が falsy なら `undefined`、truthy なら `toStepName` で検証** する
条件付き変換にする（`resumePoint?.step ?? (state.step ? toStepName(state.step) : undefined)` 相当）。

- **Rationale**: optional セマンティクスと「未確定 step では検証をスキップする」既存挙動を保ちつつ、確定済みの
  step 値に対してのみ検証を効かせる。
- **Alternatives considered**: 無条件 `toStepName(state.step)` → 却下（空文字で throw、resume が回帰）。

### D3: `resolve-step.ts:22` は検証済み経路だが `toStepName` に統一する

`resolve-step.ts:22` の `return from as StepName` は直前の `if (ALL_STEP_NAMES_SET.has(from))` で既に妥当性が
保証されている経路。ここを `return toStepName(from)` に置換しても二重検証になるだけで挙動は変わらない。
`--from` 不正値に対する詳細エラー（"Available step names: ..." 列挙）は `resolveResumeStep` 既存の else 分岐が
従来どおり担う。本 change では `ALL_STEP_NAMES_SET` の重複定義解消（バレルへの集約）までは踏み込まず、cast 置換に
留める。

- **Rationale**: 要件は「8 箇所から `as StepName` を消す」。`from as StepName` も対象。重複検証は無害で、
  set 集約は scope 外の構造変更となるため切り離す。

## Risks / Trade-offs

- **[Risk] 不正 step 値での throw が新たな失敗経路を生む（特に signal-handler / timeout / crash 経路）**
  → Mitigation: cast 元は pipeline 内部で算出される登録済み step 名（`currentStep` / `step.name` /
  `loopFixerPairs` の値）であり、正常系では常に whitelist member。throw するのは state 破損や未登録 step を
  指す異常系のみで、その場合は黙って不正 `StepName` を埋めるより fail-loud が望ましい。`resume.ts` の optional
  経路のみ D2 で明示的に falsy を guard する。

- **[Risk] 置換後に未使用となる `StepName` 型 import を残すと lint（`--max-warnings 0`）が落ちる**
  → Mitigation: `pipeline.ts` / `local.ts` / `managed.ts` は `StepName` が cast 箇所以外で未使用になるため
  type import から除去する。`resume.ts`（L167 で使用）と `resolve-step.ts`（戻り値型で使用）は残す。

- **[Trade-off] `ALL_STEP_NAMES_SET` がバレル（`toStepName` 用）と `resolve-step.ts`（`--from` 列挙用）に
  二重に存在し得る** → 重複は許容する。集約は構造変更で本 change の scope（cast 置換）外。

## Open Questions

なし。
