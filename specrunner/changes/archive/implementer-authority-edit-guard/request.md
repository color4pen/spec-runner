# implementer / agent が authority spec (`specrunner/specs/`) を直接編集する逸脱を executor で機械的に reject する

## Meta

- **type**: spec-change
- **slug**: implementer-authority-edit-guard
- **base-branch**: main
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #292

## 背景

issue #283 で構築した 4 層防衛網 (dsv = PR #285 / spec-review = PR #289 / design = PR #290) は **「design が delta spec を作らない」パターン**を catch する設計。しかし「**delta spec も作る + authority spec も直接編集する**」というパターンは 4 層全部素通りする死角として残っている。

### 観測例 (= 2026-05-17/18 dogfood)

直近 session の 4 PR finish 中、**2 PR (50%) が同型の spec-merge escalation** を踏んだ:

- **PR #289** (spec-review-delta-spec-presence-check): implementer が `specrunner/specs/spec-review-session/spec.md` を**直接編集**、delta spec でも同 Requirement を `## ADDED Requirements` 宣言 → spec-merge Pass 1 で「ADDED Requirement already exists in baseline」
- **PR #291** (resume-from-correct-loop-step): implementer が新規 capability spec `specrunner/specs/cli-resume-command/spec.md` を**直接作成**、delta spec でも同 3 Requirement を ADDED 宣言 → 同型 escalation

両者とも手動修復 (authority 側を revert / 削除 → push → finish 再実行) で復旧したが、構造的に防げていない。

### #283 (4 層防衛網) は本問題を防がない

| 層 | catch する問題 | 「authority 直接編集」を catch するか |
|---|---|---|
| Sub-A (dsv) | type=spec-change で specs/ 不在 → needs-fix | ✗ specs/ には delta spec ある → approved |
| Sub-B (spec-review) | type=spec-change で specs/ 不在 → HIGH | ✗ 同上 |
| Sub-C (design) | design が delta spec を作り忘れない self-check | ✗ design が作っても implementer の事後編集は素通り |

### #263 (step 責務境界) との関係

本問題は #263 「implementer が main spec を直接編集する逸脱を防ぐ」の中核例。ただし #263 は広範な step 責務境界全般を扱うため、本 request は **authority 直接編集に scope を絞った構造補強**として独立化:

- #263 = step 責務境界の包括的設計議論 (= 長期 architectural)
- 本 request = authority 直接編集の machine-level 防衛 (= 即効性のある対策)

関連 issue: #292

## 目的

agent step (= implementer / spec-fixer / 他) の commit 経路で **`specrunner/specs/` 配下の編集を含む staged diff を機械的に reject** し、authority spec への直接編集経路を構造的に塞ぐ。delta spec (= `specrunner/changes/<slug>/specs/`) 経由は正常許可、spec-merge (= finish 時) は正規経路として例外。

## 設計判断

1. **採用案: executor 内 commitAndPush で staged diff を検査 (= 案 C)**
   - `src/core/step/executor.ts:241 commitAndPush` で `git diff --cached --name-only` を取得
   - `specrunner/specs/` prefix の path が含まれていたら commit 前に reject (throw → step halt)
   - HEAD advanced (= agent self-commit) 経路でも `git diff headBeforeStep..HEAD --name-only` で同 check を実施
   - executor 内で完結するため hook 依存なし、test しやすい

2. **不採用案: pre-commit hook (= 案 A)**
   - 外部 hook 依存で worktree ごとに setup が必要
   - hook 不在環境で素通りするリスク
   - executor 内 check と機能等価だが運用負担増

3. **不採用案: prompt 規律のみ (= 案 B)**
   - PR #289 / #291 で実際に踏んだように prompt 規律だけでは保証できない
   - **補助として併用**: 既存 `src/prompts/implementer-system.ts` / `spec-fixer-system.ts` に「`specrunner/specs/` 配下の編集禁止」を MUST 明示 (= `commit-discipline.ts` と同パターンの shared fragment 検討)

4. **delta spec path との区別**:
   - delta spec: `specrunner/changes/<slug>/specs/<capability>/spec.md` (= change folder 配下)
   - authority spec: `specrunner/specs/<capability>/spec.md` (= repo root の specs)
   - prefix `specrunner/specs/` で厳密に区別可能 (= `specrunner/changes/` は別 prefix)

5. **spec-merge の例外扱い**:
   - spec-merge は `kind: "cli"` の CliStep で finish 時にのみ実行
   - `commitAndPush` は AgentStep のみ通る (= `src/core/step/executor.ts:81 if (step.kind === "cli")` で別経路)
   - 自然に CliStep は本 guard の影響外、追加例外指定不要

6. **error message と recovery hint**:
   - reject 時の error message に「delta spec (`specrunner/changes/<slug>/specs/`) 経由で編集してください」と明示
   - 違反 path を 1 件ずつ列挙して agent / user の両方が修復可能な情報を残す

7. **fixer step での再走り**:
   - reject されたら step は halt → user が `specrunner resume` で再実行
   - resume 時に implementer / spec-fixer が再 run → prompt 規律 (案 B 併用) で改善行動を期待
   - 再度違反したら再 reject (= 無限 loop ではなく毎回 halt)、user 判断にエスカレート

## 要件

### 1. executor で authority 編集 reject を実装

`src/core/step/executor.ts`:

- `commitAndPush` 内、`hasChanges` 判定後・`git commit` 前に staged diff の path を取得:
  - `git diff --cached --name-only` → 改行区切り file path list
- agent self-commit 経路 (= HEAD advanced) では `git diff <headBeforeStep>..HEAD --name-only` で同等の check
- いずれかの path が `specrunner/specs/` で始まる場合、新規 error type を throw:
  - error name: `AuthoritySpecEditViolation` (or 既存 error naming に揃える)
  - message: `Agent step '<step.name>' attempted to edit authority spec files directly: <violated paths>. Authority spec must be modified via delta spec under specrunner/changes/<slug>/specs/<capability>/spec.md.`
  - hint: 違反 path 一覧 + 修復方法を含める

### 2. delta spec 編集の正常許可確認

- `specrunner/changes/<slug>/specs/...` 配下の編集は reject 対象外 (= prefix check で除外)
- 同 step が delta spec と authority 両方を編集した場合は authority 部分のみで reject (= 違反 path のみ列挙)

### 3. CliStep (spec-merge 等) の例外扱い

- `commitAndPush` は AgentStep のみ通る既存構造で自然に CliStep は影響外
- 念のため test で「CliStep 経路では authority 編集が許可される」を verify

### 4. prompt 補強 (補助)

`src/prompts/implementer-system.ts` / `src/prompts/spec-fixer-system.ts`:

- 「`specrunner/specs/` 配下を直接編集してはならない。spec 変更は `specrunner/changes/<slug>/specs/<capability>/spec.md` (delta spec) を作成 / 編集する」を MUST 明示
- 違反時の挙動 (= executor reject) を明示し agent に予測可能性を与える
- 共通 fragment 化 (= `commit-discipline.ts` と同パターン) は MAY、無理に新規 module 化しなくてもよい

### 5. test

`tests/unit/core/step/executor.test.ts` (or 同等):

- TC-AUTH-01: implementer step が `specrunner/specs/foo/spec.md` を staged で commit → `AuthoritySpecEditViolation` throw、commit 実行されない
- TC-AUTH-02: implementer step が `specrunner/changes/my-slug/specs/foo/spec.md` を staged で commit → 正常 commit (= delta spec 経路)
- TC-AUTH-03: implementer step が staged で `specrunner/specs/foo/spec.md` + `src/foo.ts` 両方変更 → reject、違反 path 一覧に authority spec のみ列挙
- TC-AUTH-04: agent self-commit (= HEAD advanced + staged 0) で HEAD diff に `specrunner/specs/foo/spec.md` を含む → reject
- TC-AUTH-05: CliStep (= kind="cli") は `commitAndPush` を通らず authority 編集が許可される (= 既存挙動 regression なし)
- TC-AUTH-06: 違反 path が 0 件 (= 通常 step) は既存挙動 (= 正常 commit) 維持

`tests/pipeline-integration.test.ts` (= 既存 file、TC-INT-01 等が配置済の同 file に追記):

- TC-AUTH-INT-01: PR #289 / #291 と同型シナリオ (= type=spec-change で delta spec + authority 両方編集) の reproduction、reject されて escalation 経路に乗る

### 6. spec authority への反映

`specrunner/specs/` 配下の該当 capability (= step executor 関連) を MODIFIED で更新:

- Requirement 追加: 「commitAndPush は AgentStep の commit 前に staged diff path を検査し、`specrunner/specs/` 配下を含む場合 `AuthoritySpecEditViolation` を throw して halt する」
- Scenario:
  - delta spec のみ編集 → 正常 commit
  - authority spec のみ編集 → reject
  - 両方編集 → reject (authority part のみ違反として列挙)
  - agent self-commit で HEAD diff に authority spec 含む → reject
  - CliStep 経路 → reject 対象外

該当 capability は implementer が baseline を Read して特定 (= `step-executor` 等の名前候補)。

## スコープ外

- pre-commit hook 経由の防衛 (= 採用案 C に集約)
- step 責務境界全般の包括設計 (= #263、本 request scope 外)
- agent prompt の他項目 (= commit-discipline 以外) の変更
- delta spec format 検証強化 (= dsv の追加機能、別 issue)
- spec-merge 自体の atomicity (= #257、別 issue)
- agent が main 以外の場所 (= `src/` / `tests/` 等) を編集するパターンの制限 (= 本 request は spec 軸のみ)

## 受け入れ基準

- [ ] `src/core/step/executor.ts commitAndPush` で AgentStep commit 前に staged diff path を検査する
- [ ] `specrunner/specs/` prefix の path を含む場合 `AuthoritySpecEditViolation` を throw して halt する
- [ ] agent self-commit (= HEAD advanced) 経路でも HEAD diff path を検査して同等に reject する
- [ ] `specrunner/changes/<slug>/specs/...` (delta spec) 経由の編集は正常に許可される
- [ ] CliStep 経路 (= spec-merge 等) は本 guard の影響を受けない
- [ ] error message に違反 path 一覧 + 修復方法 (= delta spec 経由を案内) が含まれる
- [ ] `implementer-system.ts` / `spec-fixer-system.ts` prompt に authority 編集禁止が MUST 明示されている
- [ ] 既存 `tests/pipeline-integration.test.ts` に TC-AUTH-INT-01 が追記され、PR #289 / #291 同型 reproduction が reject されて escalation 経路に乗る
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に本機構の Requirement が反映されている

## Workflow Options

- enabled: []
