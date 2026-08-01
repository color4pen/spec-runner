# no-op 検知に finding 対象 path の免除を導入 — 正当な文書修正が sabotage 停止する冤罪を解消

## Meta

- **type**: spec-change
- **slug**: noop-detect-finding-target-exemption
- **base-branch**: main
- **adr**: false

## 背景

code-fixer の no-op 検知（sabotage 対策: 「修正した」と申告しながら実変更が無い fixer を needs-fix に上書きする）は、変更ファイルから artifact prefix（`specrunner/changes/` / `.specrunner/`）配下を一律除外して「ソース変更ゼロ = no-op」と判定する。このため、**reviewer の finding が change folder 内の文書（例: implementation-notes.md）の修正を求めるケース**では、fixer が指摘通りに当該文書を修正・commit しても「no source files changed」と判定され needs-fix に上書きされる。再試行も同一修正は差分ゼロで同様に消され、halt する。

実例（issue #927）: regression-gate が「implementation-notes.md の記載が実装より stale」（low fixable）を指摘 → code-fixer が当該節を正しく更新 → no-op 検知が発火し verdict を needs-fix に上書き → 再 fixer も同様 → halt。この finding クラスは pipeline 内で構造的に解消不能であり、毎回 operator 対応が必要になる。

修正方針は「**finding が名指しする path への変更は、artifact prefix 配下でも仕事として数える**」。除外 prefix 自体の縮小（例: pipelineManagedPaths の個別列挙への置換）は採らない — prefix を狭めると「finding と無関係な change folder 文書への書き込み」でも no-op を免れる穴が開き、sabotage 検知の目的を弱める。免除は finding が実際に名指しした path に限定する。

## 現状コードの前提

- `src/core/step/no-op-detect.ts:16` — `ARTIFACT_PREFIXES = ["specrunner/changes/", ".specrunner/"]`。この prefix 一律除外が canonical doc を含む change folder 全体を「非ソース」に分類する
- `src/core/step/no-op-detect.ts:64-77` — `sourceFiles = changedFiles.filter(not ARTIFACT_PREFIXES)`、`sourceFiles.length === 0` で `findingsRoutingApproved` でない限り `"needs-fix"` を返す
- `src/core/step/no-op-detect.ts:34-50` — `detectNoOp` の引数に finding 情報（修正対象 file 一覧）は含まれない
- `src/core/step/executor.ts:471-480` — `detectNoOp` の唯一の呼び出し元。呼び出し地点で `state` が在圏（`state.branch` / `codeReviewFindingsRoutingActive(state)` を使用済み）であり、finding.file 集合を state から取り出して渡す経路が存在する
- `src/core/step/code-fixer.ts:120` — `noOpDetect: true` は code-fixer のみ（spec-fixer / build-fixer は未設定）
- `src/core/step/fixer-helpers.ts:52-65` — `getLatestJudgeFindings(state, judgeStepName)` が直近 judge run の findings を返す既存 seam。並列 round 由来は `collectParallelFixerFindings` が既存
- `src/kernel/report-result.ts:40-75` — `Finding.file` は必須の worktree 相対パス
- `src/core/pipeline/round-git-scope.ts:109-111` — `pipelineManagedPaths(slug)` = state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md の個別列挙
- `src/core/step/__tests__/executor-no-op.test.ts:190-212` — 「artifact のみ変更（state.json / events.jsonl / liveness.json）→ needs-fix」を固定。finding が change folder 文書を名指しするケースの期待値は存在しない

## 要件

1. **detectNoOp に「finding が名指しする path 集合」を注入する**。呼び出し元（executor の no-op 判定地点）で、当該 fixer run に routing された findings の `file` 集合を state から機械的に導出し（`getLatestJudgeFindings` / 並列 round 由来の収集 seam を利用）、`detectNoOp` へ渡す。導出は既存 seam の再利用とし、agent の自己申告を入力にしない
2. **finding 対象 path の変更は仕事として数える**。sourceFiles 判定で、変更ファイルが finding 名指し集合に含まれる場合は artifact prefix 配下でも除外しない。これにより「finding が change folder 文書の修正を求め、fixer がその文書だけを正しく修正した」ケースで no-op が発火しなくなる
3. **免除の上限**: `pipelineManagedPaths`（state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md）は finding が名指ししても仕事に数えない。これらは pipeline 自身が毎 step 動かすファイルであり、fixer の仕事の証拠能力が無い
4. **既存挙動の保存**: finding が名指ししない change folder ファイルのみの変更 → 従来通り no-op（needs-fix）。`findingsRoutingApproved` の見逃し経路・`completionReason !== "success"` の早期 return・`noOpDetect` フラグの適用範囲（code-fixer のみ）は不変

## スコープ外

- spec-fixer / build-fixer への `noOpDetect` の新規適用
- ARTIFACT_PREFIXES の縮小・pipelineManagedPaths への置換（上記の理由で却下）
- no-op 検知以外の sabotage 対策（bite-evidence 等）の変更

## 受け入れ基準

- [ ] **シナリオ歯（#927 実例の再現）**: 「judge finding が `specrunner/changes/<slug>/implementation-notes.md` を名指し → fixer 相当の変更が当該ファイルのみ → no-op 発火せず verdict 上書きなし」をテストで固定する
- [ ] finding が名指ししない change folder ファイルのみの変更 → 従来通り needs-fix、をテストで固定する
- [ ] finding が `pipelineManagedPaths` 内のファイル（例 state.json）を名指ししても仕事に数えず needs-fix、をテストで固定する
- [ ] finding がソース（`src/` 等）を名指しし、変更もソースのみの通常ケース → 従来通り no-op 発火なし、をテストで固定する
- [ ] 既存テスト（`executor-no-op.test.ts` 等）は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 免除は「finding が名指しした path」に限定する point 免除。no-op 検知の目的（仕事の証拠が無い fixer の検出）を保ったまま、正当な文書修正だけを通す
- **採用**: finding 集合の導出は state 経由の既存 seam（`getLatestJudgeFindings` 等）。fixer agent の自己申告は入力にしない（自己申告を検知器の入力にすると sabotage 対策として fail-open になる）
- **却下**: ARTIFACT_PREFIXES を `pipelineManagedPaths` の個別列挙に縮小 — finding と無関係な change folder 文書への任意の書き込みが「仕事」と数えられる穴が開き、検知の目的を弱める
- **却下**: canonical doc（spec.md / design.md / tasks.md）だけを除外から温存（`isCanonicalDocPath` 再利用）— #927 の実例は implementation-notes.md であり canonical doc 集合では覆えない。また code-fixer の write scope は canonical doc への書き込みを禁じており、温存しても当該 step では使われない
