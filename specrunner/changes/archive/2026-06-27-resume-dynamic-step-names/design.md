# Design: resume の再開 step 検証を実 descriptor 由来にする

## Context

`src/core/resume/resolve-step.ts` の `resolveResumeStep` は、再開 step の検証に `ALL_STEP_NAMES_SET`（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES` の静的集合）を使用している。動的注入される `regression-gate`（`REGRESSION_GATE_STEP_NAME`）と custom reviewer の member 名（`state.reviewers[*].name`）はこの集合に含まれない。

executor は `runAgentStep` で `state.step = step.name` を先行永続化するため（`executor.ts:206`）、hard-crash 時は `state.step` に動的 step 名が残る。resume 時に `resolveResumeStep` がこれを静的集合で検証すると `ALL_STEP_NAMES_SET.has(stateStep)` が `false` になり "Cannot resolve resume step" で throw する。`--from <dynamic-name>` も同じ静的集合で弾かれる。結果として **custom reviewer / regression-gate 実行中の hard-crash から手動回復も含め一切の再開が不可能** になっている。

本 repo は `scale-tolerance` / `cross-boundary-invariants` の custom reviewer を使用しており、これらが存在する job の pipeline 後半（custom reviewer → regression-gate）での hard-crash が #716（resume-from-progress）の解決を意図した機能を実質無効化している。

### 対象ファイル

| ファイル | 役割 |
|---|---|
| `src/core/resume/resolve-step.ts` | 再開 step の解決・検証ロジック |
| `src/core/command/resume.ts` | `resolveResumeStep` の呼び出し元（`prepare()` 内） |
| `src/core/step/regression-gate.ts` | `REGRESSION_GATE_STEP_NAME = "regression-gate"` を export |
| `src/state/schema.ts` | `JobState.reviewers?: ReviewerSnapshot[]` |

## Goals / Non-Goals

**Goals**:
- `resolveResumeStep` が受け入れる step 名集合を「当該 job の実 descriptor 由来」にする（static + regression-gate + state.reviewers member 名）
- `state.step` フォールバック（hard-crash 回復）と `--from` の両方に拡張集合を適用する
- `ResumeCommand.prepare()` が `state.reviewers` から集合を導出して `resolveResumeStep` に渡す
- 既存の静的 step 検証挙動（`allowedSteps` 引数なし時）を保持する

**Non-Goals**:
- `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` / `STEP_NAMES` への `regression-gate` 静的追加（rejected by architect）
- reviewer snapshot の中身や検証ロジックの変更
- `resumePoint` 経路の変更（engine が書いた値をそのまま信頼）
- mid-step の途中再開（step 粒度のまま）

## Decisions

### D1: オプション第 4 引数 `allowedSteps` で純粋関数を維持する

`resolveResumeStep` に `allowedSteps?: ReadonlySet<string>` を第 4 引数として追加する。省略時は既存の `ALL_STEP_NAMES_SET` にフォールバックし、現行の挙動を維持する。

**Rationale**: 関数を純粋（引数のみに依存）に保ち、スキーマ変更に対して堅牢にする。`JobState` を直接渡す場合に比べ、テスト時に任意の集合を注入できる（型境界が明確）。

**却下した代替案**:
- `JobState` を直接渡す → 関数が state スキーマに結合する。引数の意味が広すぎる。
- モジュール変数 `ALL_STEP_NAMES_SET` を実行時に変更 → テスト分離が破壊される。
- `regression-gate` を `AGENT_STEP_NAMES` に静的追加するだけ → custom reviewer の任意名（`scale-tolerance` 等）を救えず、同クラスの漏れが残る。

### D2: `buildAllowedStepSet` を `resolve-step.ts` に export する

`buildAllowedStepSet(reviewers?: ReadonlyArray<{ name: string }>): ReadonlySet<string>` を同ファイルに追加し、export する。

**Rationale**: 集合導出ロジックを呼び出し元（`resume.ts`）でなく、集合の定義責任を持つファイルに集約する。export することで単体テスト可能。

集合の内容:
- 常に: `AGENT_STEP_NAMES` + `CLI_STEP_NAMES`
- `reviewers` が非 empty の場合のみ: `REGRESSION_GATE_STEP_NAME` + 各 `r.name`

`regression-gate` を `reviewers` 非 empty 時のみ追加する理由: regression-gate は custom reviewer が存在する job のみで pipeline に注入される。custom reviewer のない standard job で `--from regression-gate` を受理するのは意味的に誤りであるため、条件付き追加とする。

### D3: エラーメッセージを実際の許可集合から生成する

`--from` 不正時のエラーメッセージで列挙する step 名を、`[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` のハードコードではなく `[...allowed]` から生成する。custom reviewer ありの job でユーザーが使える名前（`regression-gate` / reviewer 名）も表示されるようにする。

### D4: `resume.ts` 側で集合導出・受け渡しを行う

`ResumeCommand.prepare()` 内で `resolveResumeStep` を呼ぶ直前に `buildAllowedStepSet(state.reviewers)` を実行し、得られた集合を第 4 引数として渡す。`resolve-step.ts` 自体は `state` を知らなくてよい。

## Risks / Trade-offs

- **[Risk] 循環 import**: `resolve-step.ts` が `regression-gate.ts` を import する。`regression-gate.ts` は `compose-reviewers.ts` → `reviewer-chain.ts` などをすでに import しているが、`resume/` を import していないため循環は生じない。事前確認済み。
- **[Risk] `toStepName` 型安全**: `StepName = string`（`schema.ts:27`）のため dynamic name の型キャストは問題なし。`toStepName` はパススルー（`step-names.ts:15`）。
- **[Trade-off] エラーメッセージ順序**: `allowed` が `Set` なので出力順は挿入順。static steps が先、dynamic steps が後になるため可読性は保たれる。

## Open Questions

なし。
