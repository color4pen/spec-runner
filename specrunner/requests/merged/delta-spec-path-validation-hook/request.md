# delta spec の正規 path / format を pipeline 内 deterministic step で検証する

## Meta

- **type**: spec-change
- **slug**: delta-spec-path-validation-hook
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #272

## 背景

`delta-apply-normalization` (#262, archived) で「正規 path は `<change>/specs/<capability>/spec.md` のみ」「section header は `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`」と決定し、fail-fast を `src/core/finish/spec-merge.ts:474` に導入した。それでも designer / spec-fixer agent が旧形式 path (`<change>/delta-spec/<capability>.md` 等) に書く現象が再発する。

### 観測実例

- request `managed-reset-status-stale-guard` (PR #271)
- 書いた agent: **designer step** (commit `ee6f5ed`)
- 書かれた path: `specrunner/changes/managed-reset-status-stale-guard/delta-spec/managed-cli-commands.md` (旧形式)
- section: `## ADDED` (正規 `## ADDED Requirements` ではない)
- 結果: finish の Phase 1 spec-merge fail-fast で halt → 手動で正規 path に移動 + section header 修正で復旧

### prompt の現状調査結果

- `src/prompts/design-system.ts:55,126,127,136`: 正規 path 指示はあるが旧形式の具体的禁止例の列挙は無く「フラットファイル禁止」程度の vague な記述
- `src/prompts/spec-fixer-system.ts:48-53`: 旧形式 3 variant (`delta-spec.md` / `delta-spec/<capability>.md` / `<name>.delta.md`) を明示的に禁止列挙済
- それでも designer (spec-fixer 側ではなく) が旧形式に書いた

### 現状の検出経路

- `src/core/finish/spec-merge.ts:474` の semantic empty delta check が唯一の機械的検出ポイント (= finish Phase 1 の遅延検出)
- step 完了直後の検証は無し
- prompt 規律だけでは agent 行動を保証できない (= 学習データの旧形式引きずり + 禁止例の誤読 pattern)

関連 issue: #272

## 目的

delta spec の正規 path / format 違反を **pipeline 内** で検出し、spec-review loop の試行回数を消費せずに **独立 loop** で修正させる。spec-merge (Phase 1) まで検出を遅延させない。検出と修正の責務を pipeline state machine 上に明示する。

## 設計判断

1. **採用: 独立 deterministic step `delta-spec-validation` + 専用 fixer `delta-spec-fixer` の pair 追加**

   module-architect の機械的軸評価 (testability / readability / cohesion / coupling / reusability / SRP) で全 6 軸優位。具体的根拠:
   - 既存 `VerificationStep` + `BuildFixerStep` (deterministic check + 専用 fixer pair) と同型
   - Pipeline は `loopNames` + `loopIters` map で複数 loop 独立 counter を前提に table-driven 設計済 (`src/core/pipeline/pipeline.ts:141`)
   - 案 (= `finalizeStep` hook 埋め込み) は executor 中核 module への侵襲が大きく、verdict 真実性が 2 系統 (state vs hook 上書き) になる

2. **不採用: `finalizeStep()` hook 案**: state machine 真実性の劣化 / executor SRP 違反 / 結局 counter 独立化のため transitions 追加が必要で差分が真部分集合になる。

3. **不採用: rescue layer (issue 提案 c)**: agent が違反したら CLI が自動修復 (= 旧 path → 正規 path 移動) する案は agent 行動の責務を曖昧にする。retry させる方が改善ループが回る。

4. **`delta-spec-fixer` の実体**: 既存 `spec-fixer` agent definition / system prompt をそのまま流用し、step name だけ別にする。実装はほぼ wrapper:
   - 同じ agent role / model / runner
   - validation 違反 feedback を user prompt に注入する
   - counter は `delta-spec-fixer` 独立 (= spec-review loop の spec-fixer 試行を消費しない)

5. **`delta-spec-validation` 通過対象**: delta spec を書きうる全 step 経由で通す:
   - `design` 成功 → `delta-spec-validation` → 通過なら `spec-review`、違反なら `delta-spec-fixer`
   - `spec-fixer` 成功 → `delta-spec-validation` → 同上 (spec-fixer も path 違反しうる前提で safer に gate)
   - `delta-spec-fixer` 成功 → `delta-spec-validation` (= 独立 loop)

6. **counter 独立化**: `loopNames` に `delta-spec-validation` を追加、`loopFixerPairs` (= #269 改訂で導入予定) に `delta-spec-validation → delta-spec-fixer` を登録。spec-review loop の counter とは完全独立 (= 既定 `maxIterations` 回まで独立に試行可能)。

7. **判定ルール (= 正規 path / format)**:
   - **path**: `<change>/specs/<capability>/spec.md` のみ正規。違反例: `<change>/delta-spec.md`, `<change>/delta-spec/<capability>.md`, `<change>/specs/<name>.delta.md`, `<change>/<name>.md` 直置き等
   - **section header**: `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` のいずれかを少なくとも 1 つ含むこと
   - **content**: 各 section に最低 1 つの Requirement block

8. **既存 `spec-merge` fail-fast は維持**: `spec-merge.ts:474` の semantic empty delta check は二重防衛として残す。validation step で防げなかった想定外 edge case の最後の砦。

9. **prompt 統一 (副対策)**: `design-system.ts` の禁止例記述を `spec-fixer-system.ts` と同等の明示列挙に揃える。両 prompt で共通定数を import する形に refactor。

10. **pipeline 内 deterministic step の前例**: `verification` step が build / test を spawn して exit code で判定する deterministic step として既に動いている (`src/core/step/verification.ts`)。新規 `delta-spec-validation` も同型 (= agent runner を呼ばない CliStep)。

11. **#269 (`code-fixer-final-iter-reviewed`) との関係**: 本 request は #269 で導入予定の `loopFixerPairs` / `fixerIters` を利用する。#269 が先行マージされる前提で書く。順序逆転した場合は本 request 実装側で `loopFixerPairs` の最小定義を含めて先行可能にする。

## 要件

### 1. 新規 module: `src/core/spec/delta-spec-validator.ts`

以下 export を持つ新規 module を追加する:

- `validateDeltaSpecPaths(changePath: string, deps: { readdir, readFile }): Promise<{ ok: true } | { ok: false, violations: DeltaSpecViolation[] }>`
- DI parameter は既存 `FinishFs` interface (`src/core/finish/types.ts`) のサブセット (= `readdir`, `readFile` を全小文字 / camelCase 既存規約に揃える) を参照する
- `DeltaSpecViolation = { path: string, reason: DeltaSpecViolationReason, suggested?: string }`
- `DeltaSpecViolationReason = "legacy-flat-file" | "legacy-flat-dir" | "non-canonical-path" | "missing-requirements-section" | "empty-section"`
- 内部処理:
  1. `<changePath>/` 配下を再帰列挙
  2. 以下 pattern を違反として収集:
     - `<change>/delta-spec.md`: `legacy-flat-file`
     - `<change>/delta-spec/*.md`: `legacy-flat-dir`
     - `<change>/specs/*.delta.md`: `legacy-flat-file` (拡張子付き、`delta-spec.md` と同 reason 値)
     - `<change>/specs/<name>.md` 直置き (= subdir なし): `non-canonical-path`
  3. 正規 path (`<change>/specs/<capability>/spec.md`) を読み、`## ADDED|MODIFIED|REMOVED Requirements` のいずれも無ければ `missing-requirements-section`
  4. section はあるが Requirement block が 0 個なら `empty-section`
  5. 全部 ok なら `{ ok: true }`

DI parameter は既存 finish module で使われている injection pattern (`src/core/finish/spec-merge.ts` 参照) と整合 (= `FinishFs` のサブセット型を参照)。

### 2. 新規 step: `delta-spec-validation` (CliStep)

`src/core/step/delta-spec-validation.ts` を新設:

- `VerificationStep` (`src/core/step/verification.ts`) を雛形にする (= CliStep / agent runner 呼ばない)
- `run()` で `validateDeltaSpecPaths()` を呼ぶ
- 結果に応じて verdict を決定:
  - `{ ok: true }` → `completionVerdict: "approved"` (= spec-review に進む)
  - `{ ok: false, violations }` → `completionVerdict: "needs-fix"` (= delta-spec-fixer に進む)
- 違反詳細を result file (`delta-spec-validation-result.md`) に書き出し (= delta-spec-fixer の入力にもなる)

### 3. 新規 step: `delta-spec-fixer` (AgentStep)

`src/core/step/delta-spec-fixer.ts` を新設:

- 既存 `spec-fixer` (`src/core/step/spec-fixer.ts`) を雛形にする
- agent definition / system prompt は `spec-fixer-system.ts` を **流用** (= 新規 system prompt は作らない)
- user prompt template には validation result file の違反詳細を注入する
- `completionVerdict` semantics は spec-fixer と同じ (`"approved"` で次に進む)

### 4. step name 定数の追加

`src/core/step/step-names.ts` に以下を追加:

- `DELTA_SPEC_VALIDATION: "delta-spec-validation"`
- `DELTA_SPEC_FIXER: "delta-spec-fixer"`

### 5. STANDARD_TRANSITIONS の更新

`src/core/pipeline/types.ts:60-86` の transitions に以下を追加:

- `{ step: DESIGN, on: "success", to: DELTA_SPEC_VALIDATION }` (= 既存 `DESIGN → SPEC_REVIEW` を差し替え)
- `{ step: SPEC_FIXER, on: "approved", to: DELTA_SPEC_VALIDATION }` (= 既存 `SPEC_FIXER → SPEC_REVIEW` を差し替え)
- `{ step: DELTA_SPEC_VALIDATION, on: "approved", to: SPEC_REVIEW }`
- `{ step: DELTA_SPEC_VALIDATION, on: "needs-fix", to: DELTA_SPEC_FIXER }`
- `{ step: DELTA_SPEC_VALIDATION, on: "escalation", to: "escalate" }`
- `{ step: DELTA_SPEC_FIXER, on: "approved", to: DELTA_SPEC_VALIDATION }`
- `{ step: DELTA_SPEC_FIXER, on: "escalation", to: "escalate" }`

### 6. loopNames / loopFixerPairs の更新

`src/core/pipeline/run.ts:54-62`:

- `loopNames` に `DELTA_SPEC_VALIDATION` を追加 (= 4 entry に)
- `loopFixerPairs` に `[DELTA_SPEC_VALIDATION]: DELTA_SPEC_FIXER` を追加

#### `loopFixerPairs` の最小定義 (#269 未マージ時の暫定対応)

#269 (`code-fixer-final-iter-reviewed`) が先行マージされていない場合、本 request 内で `loopFixerPairs` 機能の最小実装を含める:

- 型: `type LoopFixerPairs = Record<string, string>` (= review step name → fixer step name のマップ)
- Pipeline コンストラクタ引数に `loopFixerPairs?: LoopFixerPairs` を追加 (optional、未指定時は `{}`)
- 現時点では `{ [DELTA_SPEC_VALIDATION]: DELTA_SPEC_FIXER }` のみ定義
- `src/core/pipeline/pipeline.ts` 内で `fixerIters` Map と組み合わせた exhaustion check ロジックは #269 のスコープ。本 request では `loopFixerPairs` の **存在のみ** を追加し、exhaustion 改訂ロジックは #269 のマージで実装される前提
- 後に #269 マージ時にマップ entry が統合される (= マージ衝突を避けるため、本 request では `loopFixerPairs` 初期化箇所を 1 行で書き、#269 側で entry 追加するだけで済む構造にする)

#269 が先行マージされた場合: 本 request では `loopFixerPairs` への entry 追加 1 行のみ。

### 7. LOOP_ERROR_CODES の更新

`src/core/pipeline/types.ts:29-45`:

- `DELTA_SPEC_VALIDATION` entry を追加 (= `"DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"`, message `"delta-spec-validation did not pass after ${n} iterations"`)

### 8. steps map への登録

`src/core/pipeline/run.ts` の steps map に新規 2 step を登録。

### 9. prompt 統一 (副対策)

`src/prompts/design-system.ts` の delta spec path セクションを `spec-fixer-system.ts:48-53` と同等の明示列挙に揃える:

- 共通定数 `src/prompts/delta-spec-format.ts` (新設) で 正規 path / 禁止 path 列挙 / section header 規約を export
- `design-system.ts` と `spec-fixer-system.ts` の両方から import して使う
- 文言の二重管理を排除

### 10. spec-merge fail-fast の維持

`src/core/finish/spec-merge.ts:474` の empty delta check は **削除しない**。validation step で防げなかった edge case の最後の砦として維持。

### 11. test

`tests/unit/core/spec/delta-spec-validator.test.ts` (新規):

- TC: 正規 path + 正規 section + 非空 Requirement → `{ ok: true }`
- TC: `<change>/delta-spec/<capability>.md` のみ → `legacy-flat-dir` violation
- TC: `<change>/delta-spec.md` のみ → `legacy-flat-file` violation
- TC: `<change>/specs/<name>.delta.md` のみ → `legacy-flat-file` violation
- TC: 正規 path だが section が `## ADDED` (Requirements suffix 無し) → `missing-requirements-section`
- TC: 正規 path + section header あり + Requirement block 0 個 → `empty-section`
- TC: 正規 path + 旧形式 path 両方存在 → 旧形式が violation 登録される
- TC: 複数 capability の正規 path が全て ok → `{ ok: true }`

`tests/unit/step/delta-spec-validation.test.ts` (新規):

- TC: validator が `{ ok: true }` を返す → step verdict が `approved`
- TC: validator が `{ ok: false, violations }` を返す → step verdict が `needs-fix`、result file に違反詳細が書かれる
- TC: result file が delta-spec-fixer 入力 format で生成される

`tests/unit/step/delta-spec-fixer.test.ts` (新規):

- TC: validation result file を読み user prompt に注入する
- TC: agent definition / system prompt が spec-fixer と同一 (= 流用確認)

`tests/pipeline-integration.test.ts` に以下を追加:

- TC: design → delta-spec-validation approved → spec-review が走る
- TC: design → delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation approved → spec-review が走る
- TC: spec-fixer 経由でも delta-spec-validation を通る
- TC: delta-spec-validation が `maxIterations` 回 needs-fix で escalation する
- TC: delta-spec-validation loop の試行が spec-review loop の counter に影響しないこと (= spec-review iter は独立)
- TC: 観測例 (`managed-reset-status-stale-guard` 相当) を再現する scenario が完走する

### 12. spec authority への反映

調査の上、以下のいずれかで対応:

- `specrunner/specs/step-execution-architecture/spec.md` を MODIFIED で更新し、新 step の追加 + transition 変更 + counter 独立性を明記
- 該当 capability が無い場合は新規 capability `delta-spec-validation` を ADDED で立てる

調査結果と判断根拠を design.md に記録する。

## スコープ外

- agent 学習データへの介入 (= prompt engineering のみで対応)
- spec-merge 全体の再設計 (#257 の atomicity)
- rescue layer (= 旧形式 path を CLI が自動で正規 path に移動)
- write tool restriction (= adapter level で旧 path への write を block)
- 旧形式 path の grep / cleanup スクリプト
- propose / tasks-gen / implementer 等 delta spec を書かない step での同等 check 拡大 (= 将来 reusable な設計だが本 request スコープ外)
- spec authority 文書全体の整理

## 受け入れ基準

- [ ] `src/core/spec/delta-spec-validator.ts` が新設され `validateDeltaSpecPaths()` を export している
- [ ] validator が path 違反 (4 パターン / 3 reason 値: `legacy-flat-file` (= `delta-spec.md` および `<name>.delta.md` の 2 パターンを兼ねる), `legacy-flat-dir`, `non-canonical-path`) と format 違反 (2 reason 値: `missing-requirements-section`, `empty-section`) を漏れなく検出する
- [ ] 新規 step `delta-spec-validation` (CliStep) が追加され、`validateDeltaSpecPaths()` 結果から verdict を決定する
- [ ] 新規 step `delta-spec-fixer` (AgentStep) が追加され、spec-fixer agent definition / system prompt を流用している
- [ ] `step-names.ts` / `STANDARD_TRANSITIONS` / `loopNames` / `loopFixerPairs` (型 `Record<string, string>` で最小定義 or #269 既存の型) / `LOOP_ERROR_CODES` が新 step に対応して更新されている
- [ ] design → delta-spec-validation → spec-review、spec-fixer → delta-spec-validation → spec-review の経路が pipeline 上で機能する
- [ ] delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation の loop が独立 counter で動く
- [ ] delta-spec-validation loop が spec-review loop の counter を消費しない
- [ ] `src/prompts/design-system.ts` と `src/prompts/spec-fixer-system.ts` が共通定数 `src/prompts/delta-spec-format.ts` を import している
- [ ] `spec-merge.ts:474` の fail-fast が削除されず維持されている
- [ ] 新規 unit test (validator / step 2 種 / pipeline integration) が pass
- [ ] 観測例 (`managed-reset-status-stale-guard` 相当) を再現する scenario test が完走する
- [ ] 既存 spec-merge / executor / pipeline test が regression していない
- [ ] `bun run typecheck && bun run test` が green
- [ ] 該当 spec capability が MODIFIED で更新されている (or 新規 capability が ADDED されている)

## Workflow Options

- enabled: []
