# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ソースコード実測（前提確認）

- `src/core/step/commit-push.ts:48` — `["add", "-A"]` で worktree 全体を stage する現行コードを確認。request.md の前提と一致。
- `src/core/step/commit-push.ts:172-206` — `commitScopedPaths` が既に `["add", "-A", "--", ...stagePaths]` で scoped staging を実装していることを確認。流用可能。
- `src/core/step/spec-review.ts:80-87` — `reads()` が spec.md / design.md / tasks.md のみを返し、request.md を含まないことを確認。D6 の前提と一致。
- `src/core/pipeline/round-git-scope.ts` — `pipelineManagedPaths`（state.json / events.jsonl / usage.json）と `partitionRoundChanges` の実装を確認。D3 で sequential 経路が参照する設計に対応している。
- `src/core/step/step-halt.ts:305-315` — `makeCommitFailHalt` が `err.code` を `ErrorInfo.code` に保持することを確認。D5 の halt 経路設計の前提が成立している。
- `src/kernel/step-names.ts` — `STEP_NAMES` 定数に implementer / build-fixer / code-fixer / test-materialize / adr-gen がすべて存在することを確認。
- `src/core/runtime/managed.ts:346-354` — managed runtime の `finalizeStepArtifacts` が no-op であることを確認。guarded 差分検査は local runtime 経路のみで発火する。
- `src/core/step/implementer.ts:170-178` — `writes()` が gitState に加えて `${changeFolderPath(slug)}/tasks.md` を `verify: false` で宣言していることを確認。T-09 の受け入れ基準（implementer の tasks.md が forbidden に含まれないこと）が成立する根拠。
- `src/core/step/build-fixer.ts` / `code-fixer.ts` — `writes()` が gitState のみを返すことを確認。`declaredWritePaths` は空となり、protectedCanonPaths 全体が forbidden になる。
- `src/core/step/adr-gen.ts:156-166` — `writes()` が `specrunner/adr/${slug}.md`（verify: false）を返すことを確認。実際のファイルは日付 prefix 付き（`specrunner/adr/YYYY-MM-DD-slug.md`）だが protectedCanonPaths に含まれないため violation 検出は正しく動作する。
- `src/core/runtime/local.ts:774-802` — `listWorktreeChanges` の NUL 分割 parse ロジック（format: `XY<SP>path`、slice(3)）を確認。T-04 が参照する実装が存在する。
- `src/core/step/regression-gate.ts:9-10` — `regression-gate` が STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES に意図的に含まれないことを確認。`stagingModeFor` のデフォルト `"scoped"` で正しく分類される。
- `src/util/paths.ts` — `requestMdPath`, `factCheckAttestationPath`, `changeFolderPath` を確認。`test-cases.md` 専用のヘルパは存在しないが `${changeFolderPath(slug)}/test-cases.md` として構成可能。

### 設計整合性検証

- spec.md の全 Requirement に Given/When/Then シナリオが存在し MUST/MUST NOT normative keyword を含むことを確認。
- request.md 受け入れ基準 5 項目すべてに対応するシナリオが spec.md に存在することを確認。
- design.md の決定（D1〜D6）が request.md の architect 評価済み判断と矛盾しないことを確認。
- tasks.md の T-01〜T-11 の Acceptance Criteria と受け入れ基準の対応を確認。
- セキュリティ観点：write-scope 境界強制は commit 時点の機械強制であり、`git status --porcelain -z --no-renames` の NUL 分割 parse はパス中の空白文字を正しく扱う。managed runtime では finalizeStepArtifacts が no-op のため guarded 検査が発火しないが、Non-Goals（managed runtime 挙動変更なし）と整合する。

## 検証できなかった項目

- `src/core/step/write-scope.ts` — まだ存在しない（新規作成対象）。
- T-06〜T-10 の新規テスト — まだ存在しない（実装対象）。
- `forbiddenWritePaths` が implementer の tasks.md を正しく除外するかの実動作 — コードがないため implementer.ts の writes() 宣言から推論のみ。

## Findings 詳細

### F-01: D2 の import 制約と T-01 の STEP_NAMES 使用が矛盾している

D2 は `write-scope.ts` を「`src/util/paths.ts` の path helper のみを import する leaf module」と規定する。しかし T-01 は「`GUARDED_WRITE_STEPS` を定義する（STEP_NAMES 定数を使用）」と記述している。`STEP_NAMES` は `src/kernel/step-names.ts` に存在し、paths.ts ではない。

実装者が STEP_NAMES を import すると D2 の import 制約に違反し leaf module 性が損なわれる。ハードコードすれば DRY が損なわれ、ステップ名変更時の追従が手作業になる。

推奨解消法: `write-scope.ts` において STEP_NAMES 定数を import せず文字列リテラルで定義し、コメントに「STEP_NAMES とのドリフトは T-01 分類テスト（stagingModeFor）が検出する」と明記する方針を tasks.md T-01 に追記する。これにより leaf 制約を保ちながら回帰はテストが検出する。

---

### F-02: declaredWritePaths が verify:false パスを含むべきことが明示されていない

T-03 の scoped mode 実装指示は「`step.writes?.(state, deps)` の file path（`artifact === "gitState"` を除外）」と記述しており verify:false パスを除外しないことは読み取れる。しかし T-01 の `findWriteScopeViolations` シグネチャや `forbiddenWritePaths` の説明には verify:false の扱いが明記されていない。

実装者が `declaredWritePaths` を「verify:true のみ」と誤解した場合、implementer の tasks.md（verify: false で宣言）が `declaredWritePaths` に含まれず、`forbiddenWritePaths` に tasks.md が残り、implementer が tasks.md を更新するたびに halt する。T-09 テストはこの誤実装を検出できるが、実装中の罠になりうる。

推奨解消法: T-01 の `forbiddenWritePaths` または T-03 の stagePaths 構成箇所に「`artifact !== "gitState"` を除いた IoRef.path すべてを含む（`verify: false` を含む）」と一文追記する。

---

### F-03: scoped mode で stagePaths が空のとき HEAD advance 検出を行うかが不明確

T-03 は「stagePaths が空なら現行の空 stage 相当（no-op で commit しない）に倒す」と述べる一方、「HEAD-advance 検出を scoped mode でも保存する」とも述べる。現行の `commitScopedPaths`（並列 round 用）は stagePaths 空で即 return する（HEAD advance 検査なし）が、`commitAndPush` は add -A → diff 0 → HEAD advance 検査の順を踏む。

stagePaths が空のとき HEAD advance 検査を行うかどうかが仕様上曖昧。

推奨解消法: stagePaths が空のとき HEAD advance 検査なしで即 return する（並列 round の既存挙動に合わせる）と tasks.md に明記する。stagePaths が空の scoped step が agent 自己 commit する状況は想定外であり、silent skip で問題ない。
