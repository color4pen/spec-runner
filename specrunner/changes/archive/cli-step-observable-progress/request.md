# pipeline 進捗 stdout の loop step 抜けと非 loopNames CliStep を可視化する

## Meta

- **type**: spec-change
- **slug**: cli-step-observable-progress
- **base-branch**: main
- **date**: 2026-05-17
- **author**: color4pen
- **issue**: #279

## 背景

`src/core/pipeline/pipeline.ts:156-167` で iteration 進捗 stdout (`[iter N/M] starting <step>`) は `isLoopStep = currentStep === this.loopName` (= primary = spec-review) のときのみ出力。さらに L166 / L242 / L244 / L252 / L346 で使われる文字列は `this.loopName` リテラルなので、**spec-review 以外の loopNames step も実態 silent**。

つまり stdout 進捗は spec-review しか出ない:

| step | loopNames 含 | 現状 stdout | 期待 |
|---|---|---|---|
| `spec-review` | yes (primary) | `[iter N/M]` 出る | 維持 |
| `verification` | yes | **silent** (bug) | `[iter N/M]` を出すべき |
| `code-review` | yes | **silent** (bug) | `[iter N/M]` を出すべき |
| `delta-spec-validation` | no | silent | `[step]` を出すべき |
| `pr-create` | no | silent | `[step]` を出すべき |
| `design` / `spec-fixer` 等 AgentStep (= 非 loopNames) | no | silent | 本 request 対象外 |

### 経緯

PR #274 で `delta-spec-validation` (dsv) を loopNames から外して以降、dsv 実行は完全 silent となり「何回走ったか / 何が起きたか」が pipeline ログで分からなくなった。当初は dsv のみの問題と認識していたが、調査の結果 `this.loopName` リテラル依存が根本にあり verification / code-review も同じく silent だったことが判明 (= bug 相当)。

spec authority (`specrunner/specs/pipeline-orchestrator/spec.md`) では「dsv は loopNames に含まない」と明記されているが stdout 表示には言及がない。

関連 issue: #279

## 目的

pipeline 進捗 stdout の可観測性を 2 軸で揃える:

1. **bug-fix 軸**: 既存 `[iter N/M]` 表示が primary loopName (spec-review) しか出ない不具合を修正し、loopNames 全体 (= verification / code-review / spec-review) で iter 進捗が見えるようにする
2. **spec-change 軸**: 非 loopNames CliStep (= dsv / pr-create) に新規入場表示 `[step] <name>` を追加し silent 区間を解消する

両軸を同一 request 内で扱う。設計判断 4 (= 「loopNames に含まれる step は loop iter 表示を優先、`[step]` 表示は抑制」) は両軸が揃って初めて綺麗に成立するため、分離しない。

## 設計判断

1. **bug-fix 軸: `this.loopName` リテラルを `currentStep` に置換**
   - `pipeline.ts:166` `stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${this.loopName}\n`)` → `${currentStep}` に置換
   - 同様に L242 / L244 / L252 / L346 の `this.loopName` 参照も `currentStep` に揃える
   - `isLoopStep` ガードは `isAnyLoopStep` に変更 (= loopNames 全体で出力)
   - これにより verification / code-review も `[iter N/M] starting verification` 等が出るようになる
   - 最終 verdict 出力 (`Pipeline finished: ${loopName} iterations=N, final verdict=V`) は primary loopName 1 件で良いため `this.loopName` 維持

2. **spec-change 軸: 全 CliStep に汎用 `[step]` 入場表示 (module-architect 評価で recommended)**
   - 出力例: 入場時 `[step] delta-spec-validation` / 完了時 `[step] delta-spec-validation: approved`
   - 既存 `[iter N/M]` の対象 (= loopNames に含まれる step) は `[step]` 表示を出さない (= 二重出力回避)
   - つまり「`[step]` 表示対象 = CliStep かつ loopNames に含まれない」= 現状 dsv / pr-create
   - 将来 loopNames に CliStep が追加された場合は loop 表示が優先 (= bug-fix 軸後の挙動と整合)

3. **不採用案: dsv 専用の進捗表示** — CliStep 間で挙動が不一致、構造的に脆い

4. **不採用案: 全 AgentStep にも `[step]` 表示追加 (= design / spec-fixer 等)** — UX 改善軸が別、本 request 対象外。AgentStep non-loop の silent はスコープ外で別 issue 化候補

5. **出力タイミング**:
   - 入場時 (= step.run() 呼出直前): `[step] <step-name>` (CliStep 非 loopNames のみ)
   - 完了時 (= verdict 確定後): `[step] <step-name>: <verdict>` (verdict が存在する場合のみ)
   - verdict なしの step (= pr-create 等の `completionVerdict: undefined`) は入場時のみ

6. **可観測性の段階的拡張**: 将来 `--verbose` flag で各 step の所要時間 / 詳細 result も出せる構造を意識 (= 本 request では入場 + verdict 表示まで)

## 要件

### 1. bug-fix: loopNames 全体の iter 表示

`src/core/pipeline/pipeline.ts`:

- L166 `stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${this.loopName}\n`)` の `this.loopName` を `currentStep` に置換
- L164 `if (isLoopStep)` ガードを `if (isAnyLoopStep)` に変更 (= loopNames 全体に拡大)
- L242 / L244 / L346 の `this.loopName` 参照も `currentStep` に置換、ガードも同様に `isAnyLoopStep` に揃える
  - ただし L304 / L330 の `Pipeline finished: ${loopName} iterations=N, final verdict=V` 系最終出力は primary loop の 1 サマリで良いため `this.loopName` 維持
- `prevLoopStep = isLoopStep ? currentStep : ""` (L361) の挙動が変わらないか確認 (= primary 単独参照のため変更不要のはず)

### 2. spec-change: 非 loopNames CliStep の `[step]` 表示

`src/core/pipeline/pipeline.ts`:

step 実行直前 (= `this.executor.execute(step, state, deps)` 呼出前) で:

- `step.kind === "cli"` かつ `currentStep` が `loopNames` に含まれない場合に `stdoutWrite(`[step] ${currentStep}\n`)` を出力

step 実行後 (= verdict 確定後) で:

- 同条件 (CliStep かつ非 loopNames)
- `parseResult().verdict` が非 `null` (= success / error 等の判定が取れた) なら: `stdoutWrite(`[step] ${currentStep}: ${verdict}\n`)`
- `parseResult().verdict` が `null` (= 判定不能) のときのみ完了表示なし

(`completionVerdict` フィールドは `AgentStep` 専用で `CliStep` には存在しない。`pr-create.ts:89-111` の `parseResult` は成功時 `verdict: "success"`、失敗時 `verdict: "error"` を返すため、pr-create も完了表示 (`[step] pr-create: success` 等) が出る前提とする。verdict なしの抑制は `verdict === null` 経路のみ。)

### 3. retries exhausted / verdict 系の step 名表示

bug-fix 軸の延長で L242 / L244 / L252 / L346 周辺の verdict 表示も `currentStep` に揃える:

- `[iter ${loopIter}] ${this.loopName} verdict: approved → done` → `[iter ${loopIter}] ${currentStep} verdict: approved → done`
- needs-fix / escalation / spawning fixer 系も同様

`retries exhausted` 系は時点によって `currentStep` が fixer step (= spec-fixer 等) を指すため、loop step 識別には別変数を使う必要がある:

- **L304**: `[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted, escalating` → `[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted on ${nextStep}, escalating` (= `nextStep` が exhaust した loop step を指す)
- **L330**: `[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted, escalating` → `[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted on ${exhaustedLoopName}, escalating` (= `exhaustedLoopName` が該当変数)

この変更により「どの loop step が exhaust したか」が stdout で識別可能になる。

### 3-b. TC-029 fixture 更新 (= 要件 3 と同 PR で対応)

`tests/cli-stdout-snapshot.test.ts:298` (TC-029) が既存メッセージ `[iter N/M] retries exhausted, escalating` を `toContain` で pin 止めしている。要件 3 のメッセージ変更に追従して fixture を更新する:

- 期待値を `[iter N/M] retries exhausted on <loop-step>, escalating` に変更 (= 具体 loop step 名を含む)
- もし TC-029 が複数 scenario をカバーしている場合、それぞれの scenario で exhaust する step (例: spec-review / verification / code-review) ごとに期待値を分ける

### 4. test

`tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` (新規):

- TC: spec-review iteration で `[iter 1/M] starting spec-review` が stdout に出る (既存挙動維持)
- TC: verification iteration で `[iter 1/M] starting verification` が stdout に出る (新規 bug-fix)
- TC: code-review iteration で `[iter 1/M] starting code-review` が stdout に出る (新規 bug-fix)
- TC: 各 loopNames step の verdict 表示 (`approved → done` / `needs-fix → spawning fixer`) が `currentStep` の name で出る
- TC: 既存 TC-068 (stdout iter format) が regression していない

`tests/unit/core/pipeline/pipeline.cli-step-output.test.ts` (新規):

- TC: dsv 入場時に `[step] delta-spec-validation` が stdout に出力される
- TC: dsv 完了時に `[step] delta-spec-validation: approved` (or `: needs-fix`) が出力される
- TC: pr-create 入場時に `[step] pr-create` が出力される
- TC: pr-create 成功時に完了表示 `[step] pr-create: success` が出力される
- TC: 何らかの CliStep で `parseResult().verdict` が `null` のとき完了表示が出ない
- TC: verification (= loopNames に含まれる CliStep) は `[step]` 表示が出ない (= loop iter 表示が優先)
- TC: design (= AgentStep 非 loopNames) は `[step]` 表示が出ない (= AgentStep は本 request 対象外)

`tests/core/pipeline/pipeline.test.ts` 既存 TC-068 (= stdout iter format) が regression していないことを確認。

### 5. spec authority への反映

`specrunner/specs/pipeline-orchestrator/spec.md` (該当 capability) を MODIFIED で更新:

- 既存 Requirement「Pipeline は primary loopName について `[iter N/M] starting <loopName>` を stdout に出力する」を「Pipeline は loopNames に含まれる全 step について `[iter N/M] starting <currentStep>` を stdout に出力する」に書き換え
- 新規 Requirement: 「CliStep かつ loopNames に含まれない step は入場時 `[step] <step-name>` を stdout に出力する。verdict が存在する場合は完了時 `[step] <step-name>: <verdict>` を追加出力する」
- Scenario: dsv / pr-create / verification / code-review / design の各表示挙動

## スコープ外

- AgentStep の 非 loopNames (= design / test-case-gen 等) の表示追加 — 別軸の UX 改善、本 request 対象外 (= 別 issue 化候補)
- `--verbose` flag による詳細出力 (= step 所要時間 / 詳細 result) — 本 request では最小可観測性まで
- stdout の color / format 統一 — 既存 `[iter N/M]` format との視認性差は許容
- log file への永続化 — pipeline ログは stdout のみ、別軸の機能
- `Pipeline finished: ${loopName} iterations=N, final verdict=V` 系最終サマリの multi-loop 化 — 1 サマリで足りるため primary 維持

## 受け入れ基準

- [ ] `pipeline.ts:166` 等の `this.loopName` リテラルが `currentStep` に置換され、verification / code-review の iteration 開始時にも `[iter N/M] starting <step>` が stdout に出る
- [ ] verdict 表示 (`approved → done` / `needs-fix → spawning fixer`) が `currentStep` の name で出る
- [ ] `retries exhausted` 表示が exhaust した loop step 名を含む (`[iter N/M] retries exhausted on <loop-step>, escalating` の形式)、L304 は `nextStep` / L330 は `exhaustedLoopName` を使い currentStep と取り違えていない
- [ ] TC-029 (`tests/cli-stdout-snapshot.test.ts:298`) の fixture が新メッセージフォーマットに更新されている
- [ ] dsv 入場時に `[step] delta-spec-validation` が stdout に出力される
- [ ] dsv 完了時に `[step] delta-spec-validation: <verdict>` が stdout に出力される
- [ ] pr-create 入場時に `[step] pr-create` が出力される
- [ ] pr-create 完了時に `[step] pr-create: success` (or `: error`) が出力される (= `parseResult` が verdict を返すため)
- [ ] verification / code-review (= CliStep でも AgentStep でも loopNames に含まれる) は `[step]` 表示が出ない (= 既存 `[iter N/M]` のみ)
- [ ] AgentStep 非 loopNames (= design / spec-fixer 等) は本 request では表示追加対象外、silent のまま
- [ ] 最終サマリ `Pipeline finished: spec-review iterations=N, final verdict=V` は primary loop で出力されることが維持されている
- [ ] 既存 TC-068 (stdout iter format) が pass
- [ ] 新規 test (loop-iter-stdout 5 件 + cli-step-output 6 件) が pass
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に「loopNames 全体での `[iter N/M]` 出力」と「非 loopNames CliStep の `[step]` 表示」両方の Requirement が反映されている

## Workflow Options

- enabled: []
