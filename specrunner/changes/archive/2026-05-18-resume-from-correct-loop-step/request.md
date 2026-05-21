# resume が loop step (code-review / spec-review / verification) で中断したときに fixer ではなく review step から再開する

## Meta

- **type**: bug-fix
- **slug**: resume-from-correct-loop-step
- **base-branch**: main
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #236

**type 選択根拠**: 本 request は resume の既定動作を「fixer 続行」から「loop step 戻り」に反転させる **behavioral default change** を含むため spec authority 反映を伴う。ただし「現状の挙動はバグであり、`--from fixer` で legacy 挙動を明示的に呼び出せる opt-in 経路を残す」構造のため、機能追加 (= new-feature) ではなく既存バグの修正 (= bug-fix) と分類する。

## 背景

`specrunner resume <slug>` が code-review (or 他 loop step) needs-fix で中断した job を再開するとき、**期待: code-review からやり直し** に対して **実態: code-fixer から再開** となり、ユーザーが期待する「review からやり直し」が出来ない。

### 観測例

- code-review iter 1 が needs-fix → ユーザーが意図的に kill (= 想定外の挙動を見て中断)
- `specrunner resume <slug>` 実行
- pipeline が code-fixer から再開 (= code-review feedback に対する修正作業から開始)
- ユーザーは「直前の code-review iter 1 から再判定 (or 修正前提を見直して再 review)」したかった

### 修正対象

- `src/core/resume/resolve-step.ts:75` の `resolveResumeStep` (= 中核 logic)
- `src/core/command/resume.ts:158` の呼び出し側

### 構造的問題

現状の `resolveResumeStep` は state の最終 step に基づいて再開点を決めるが、loop step (= code-review / spec-review / verification) で `needs-fix` で中断した場合「次は fixer」と単純解釈してしまう。ユーザーは「もう一度 review からやり直したい」ケースが多い (= 修正方針を見直す or 中断時点の判断を再評価)。

関連 issue: #236

## 目的

resume の再開点解決ロジックを修正し、loop step で needs-fix 中断した場合の**既定動作を「loop step (review) から再開」**に変更する。`--from` flag で fixer から再開する経路は維持 (= 既存挙動を opt-in に)。

## 設計判断

1. **採用案: resume 既定を「中断 loop step から再開」に変更**
   - state の最終 step が loop step (= loopNames 内) かつ verdict が `needs-fix` の場合、その loop step から再開
   - 例: code-review iter 1 needs-fix で中断 → resume 既定で code-review iter 1 (or 該当 iter 番号) から再開

2. **`--from` flag の挙動維持 (= opt-in で fixer 起動)**:
   - `--from fixer` (or 新 alias `--from code-fixer` 等) で fixer から再開 (= 既存経路)
   - `--from <step-name>` で任意 step から再開 (= cli-command-hierarchy request で議論中の step 名指定経路)

3. **不採用案: 全 resume を完全自動判定**
   - ユーザーの意図 (= 再判定したい / 修正続行したい) は自動では分からない
   - 「既定 = review 戻り」「opt-in = fixer 続行」が user choice として明確

4. **state の最終 step 判定ロジック**:
   - `state.steps?.[<step>]` の最新 entry を見て verdict を判定
   - loopNames 内の step (= `spec-review` / `code-review` / `verification`) で needs-fix なら「その step から再開」
   - 既存 fixer step (= `code-fixer` / `spec-fixer` / `build-fixer`) で中断した場合は fixer から再開 (= 既存挙動維持)
   - 他 step (= `design` / `implementer` / `dsv` 等) は既存挙動

5. **iter 番号の扱い**:
   - loop step iter 1 needs-fix で中断 → resume で同じ iter 1 から再開する (= 「iter 1 を再判定」)
   - iter 番号は state.steps から取得
   - pipeline 側の `loopIters` / `fixerIters` カウンタが正しく復元されるか確認 (= 既存 resume 経路の bug 範囲を見極め)

6. **既存 `--from critic|fixer|creator` の legacy alias**:
   - 維持 (= 後方互換)
   - 既定動作変更で「fixer → review」に既定切り替わるため、ユーザーが意図的に fixer 続行したい場合は `--from fixer` を明示

## 要件

### 1. `resolveResumeStep` の既定動作変更

`src/core/resume/resolve-step.ts`:

- `--from` 不指定の場合:
  - state.steps から最終実行 step + verdict を取得
  - 最終 step が loopNames 内 (= `spec-review` / `code-review` / `verification`) かつ verdict が `needs-fix` なら、**その loop step から再開**
  - 最終 step が fixer (= `code-fixer` 等) なら fixer から再開 (= 既存挙動)
  - 他 step は既存 fallback ロジック
- `--from <role>` 指定の場合は既存 mapping ロジック維持

### 2. loop iter 番号の復元

resume 時に loop step iter 番号を正しく復元:

- `state.steps?.[loopStep]` の length から iter 番号を計算
- pipeline 起動時の `loopIters` カウンタが復元値からスタート
- fixerIters も同様に復元 (= 既存 resume 経路で対応済の可能性、確認必要)

### 3. test

`tests/unit/core/resume/resolve-step.test.ts` (or 既存) に:

- TC: state 最終 step = `code-review` (needs-fix) → resume が `code-review` から再開
- TC: state 最終 step = `spec-review` (needs-fix) → resume が `spec-review` から再開
- TC: state 最終 step = `verification` (failed = needs-fix 相当) → resume が `verification` から再開
- TC: state 最終 step = `code-fixer` → resume が `code-fixer` から再開 (= 既存挙動維持)
- TC: `--from fixer` 指定で resume が `code-fixer` から再開 (= 既存挙動維持、opt-in 経路)
- TC: state 最終 step = `code-review` (needs-fix) で `--from fixer` 指定 → fixer から再開 (= 明示指定が既定を上書き)

`tests/pipeline-integration.test.ts` (or 同等) に:

- TC: code-review needs-fix で中断 → resume → code-review iter (= 同じ iter or +1) から再開して完走

### 4. spec authority への反映 (= 新規 capability ADDED)

`specrunner/specs/` 配下に resume 専用 capability spec は**現状存在しない** (= `cli-finish-command/spec.md` 等が resume を言及する程度)。本 request で **新規 capability `cli-resume-command` (or 同等の slug、`cli-finish-command` の対称) を ADDED で作成**する:

- 新規 Requirement:
  - 「resume の既定動作は state の最終 step + verdict に基づき決定する。loop step で needs-fix 中断した場合は同 loop step から再開する」
  - 「`--from <role>` 指定時は既定を上書きして指定 role に対応する step から再開する」
- Scenario:
  - state 最終 = code-review needs-fix → resume 既定で code-review から再開
  - state 最終 = spec-review needs-fix → resume 既定で spec-review から再開
  - state 最終 = verification failed → resume 既定で verification から再開
  - state 最終 = code-fixer → resume 既定で code-fixer から再開 (= 既存挙動維持)
  - `--from fixer` 指定 → fixer から再開 (= 既定上書き)
  - 実バグシナリオ: `resumePoint.step = "code-fixer"` だが `state.steps["code-fixer"]` 空 → code-review から再開 (= バグ修正の証明)

既存 `cli-finish-command/spec.md` の構造を参考に新規 spec を作成。

## スコープ外

- `--from <step-name>` (= cli-command-hierarchy request で議論中の step 名指定経路) の本 request での実装。既存 `critic|fixer|creator` legacy alias のみ touch
- resume の job state 復元範囲拡張 (= 既存 state restoration ロジックは触らない)
- `specrunner cancel` 系の挙動 (= 別 issue)
- resume の concurrency 制御 (= 同 slug で複数 resume 並列起動の handle)

## 受け入れ基準

- [ ] `src/core/resume/resolve-step.ts` の `resolveResumeStep` 既定動作が「loop step + needs-fix → 同 loop step から再開」に変更されている
- [ ] state 最終 step が code-review needs-fix で resume → code-review から再開する
- [ ] **実バグシナリオ**: `resumePoint.step = "code-fixer"` (= pipeline.ts:100 で記録) かつ `state.steps["code-review"][-1].verdict = "needs-fix"` かつ `state.steps["code-fixer"]` が空のとき → code-review から再開する (= 観測例 #236 の正確な reproduction)
- [ ] state 最終 step が spec-review needs-fix で resume → spec-review から再開する
- [ ] state 最終 step が verification failed で resume → verification から再開する
- [ ] state 最終 step が code-fixer で resume → code-fixer から再開する (= 既存挙動維持、regression なし)
- [ ] `--from fixer` (legacy alias) 指定で fixer から再開する経路が維持されている
- [ ] state 最終 step が code-review needs-fix + `--from fixer` 指定で fixer から再開する (= 明示指定が既定を上書き)
- [ ] 既存 resume 関連 test が regression していない
- [ ] integration test で code-review needs-fix → resume → completion の reproduction が動く
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に既定動作変更が反映されている

## Workflow Options

- enabled: []
