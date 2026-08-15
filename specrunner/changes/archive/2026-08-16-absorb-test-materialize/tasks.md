# Tasks: test-materialize step の廃止 — テスト実体化を implementer に統合する

順序ヒント: T-01 → T-02 で step 資産と定数を消すと `tsc` が参照残を全部指すので、それを網にして T-03〜T-09 を潰し、T-10 でテストを整え、T-11 で緑を確認する。

## T-01: step 名定数と agent union を同時に削除する（D6）

- [x] `src/kernel/step-names.ts` の `AGENT_STEP_NAMES` から `"test-materialize"` を、`STEP_NAMES` から `TEST_MATERIALIZE: "test-materialize"` を削除する
- [x] `src/kernel/agent-definition.ts` の `AgentStepName` union から `| "test-materialize"` を削除する（step-names.ts と同一 commit で。`state/schema/types.ts` の bidirectional compile guard `_AgentStepExtraInArray` / `_AgentStepExtraInUnion` が両者不一致で落ちるため）

**Acceptance Criteria**:
- `AGENT_STEP_NAMES` と `AgentStepName` に `test-materialize` が存在しない
- `STEP_NAMES.TEST_MATERIALIZE` が存在しない
- `state/schema/types.ts` の compile guard が通る（`bun run typecheck`）

## T-02: test-materialize step 資産・参照を削除する（D5）

- [x] `src/core/step/test-materialize.ts` を削除する
- [x] `src/prompts/test-materialize-system.ts` を削除する
- [x] `src/core/pipeline/registry.ts` の `TestMaterializeStep` import、`STANDARD_DESCRIPTOR.steps` の `[TEST_MATERIALIZE, TestMaterializeStep]`、`roles` の `[TEST_MATERIALIZE]` エントリ、step 順コメントを削除する
- [x] `src/cli/config-effective.ts` の `TestMaterializeStep` import と step map エントリを削除する
- [x] `src/core/step/write-scope.ts` の `GUARDED_WRITE_STEPS` から `"test-materialize"` を削除する
- [x] `src/core/step/staging-containment.ts` の doc comment（guarded 対象列挙）から test-materialize を除去する
- [x] `src/state/schema/types.ts` の `commitOid` doc comment（line 226 付近）から「test-materialize」への名指しを除去する
- [x] `src/config/schema/types.ts` の staging-containment doc comment（line 249 付近）の guarded 対象列挙から test-materialize を除去する
- [x] `src/core/port/output-contract.ts` の `test-coverage` kind doc から test-materialize 名指しを除去する（`test-coverage` kind と local.ts の分岐そのものは残す — D5 rationale）
- [x] `src/core/port/runtime-strategy.ts` の `listCommitChangedFiles` / diff 系メソッド doc から「test-materialize commit」への言及を更新する
- [x] `src/prompts/pipeline-map.ts` の `PIPELINE_MAP` 表から test-materialize 行を削除する
- [x] `src/prompts/rules.ts` の責任範囲表から test-materialize 行を削除する
- [x] `src/prompts/tc-source-contract.ts` の doc から consumer 列挙の test-materialize を除去し implementer のみにする
- [x] `src/templates/step-output-templates.ts` の Result YAML 所有権コメントの「後続ステップ（test-materialize を含む）」表現を更新する

**Acceptance Criteria**:
- `test-materialize.ts` / `test-materialize-system.ts` が存在しない
- `STANDARD_DESCRIPTOR.steps` / `roles` に test-materialize が無い
- `PIPELINE_MAP` / rules 責任範囲表に test-materialize 行が無い
- production コード（`src/**` の非テスト）に `TestMaterializeStep` / `TEST_MATERIALIZE_SYSTEM_PROMPT` の参照が残らない
- `test-coverage` OutputContractKind と local.ts の当該分岐は保持されている（verification の coverage 保証は不変）

## T-03: 遷移表を implementer 収束に置換し exemption を 2 箇所へ縮退する（D1）

- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`:
  - [x] `SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional）を `SPEC_REVIEW approved → IMPLEMENTER`（unconditional）へ変更する
  - [x] `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt` 行を削除する（unconditional 行に包摂）
  - [x] `TEST_MATERIALIZE success → IMPLEMENTER` / `TEST_MATERIALIZE error → escalate` の 2 行を削除する
  - [x] `SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward` を `→ IMPLEMENTER` へ変更する
  - [x] `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer` 行を削除する
  - [x] 関連コメント（"test-materialize", "test-case-gen already ran ... test-materialize"）を implementer 収束に合わせて更新する
- [x] `src/core/pipeline/test-gen-exemption.ts` の `specFixerForwardsToImplementer` 述語を削除し、module doc の「test-case-gen / test-materialize / bite-evidence の 3 箇所」を「test-case-gen / bite-evidence の 2 箇所」へ更新する
- [x] `src/core/pipeline/spec-observation.ts` の `specFixerObservationForward` の doc/コメントの routing 先を test-materialize → implementer に更新する（関数ロジックは不変）
- [x] `FAST_TRANSITIONS` は無変更であることを確認する（test-materialize 非依存）

**Acceptance Criteria**:
- `STANDARD_TRANSITIONS` に `step === "test-materialize"` / `to === "test-materialize"` の行が 1 つも無い
- 全 request type（免除・非免除）で `spec-review` `approved` の解決先が `implementer`（routable fixable なし時）
- `spec-fixer` の観測 auto-fix approved の解決先が `implementer`
- `isTestGenExempt` の使用箇所は `design → spec-review` と `implementer → verification` の 2 guard のみ
- `specFixerForwardsToImplementer` が export されない

## T-04: implementer を単一 mode 化し実体化責務を prompt に統合する（D2）

- [x] `src/core/step/implementer.ts` の `buildImplementerInitialMessage` から `testsMaterialized` 分岐を削除し、単一 message にする。message は「test-cases.md（存在時）の全 must TC をテストコードに実体化し、実装と整合させる」責務を含める
- [x] `buildMessage` / `buildImplementerRecoveryMessage` から `testsMaterialized`（`state.steps?.[TEST_MATERIALIZE]` 参照含む）を削除する
- [x] `src/prompts/implementer-system.ts` の「テストの扱い」節の `test-materialize 済み / 未 materialize` 二分岐を単一責務記述に置換する。TC 変換ルール（Scenario 由来 = spec.md の GWT、非 Scenario 由来 = test-cases.md の GWT、テストに TC ID 記載、manual/gate は自動テスト対象外）を実体化責務として保持する
- [x] implementer が新規 output contract を持たないこと（coverage は verification の `test-coverage` phase が担保）を確認する

**Acceptance Criteria**:
- `implementer.ts` に `TEST_MATERIALIZE` / `testsMaterialized` の参照が無い
- `IMPLEMENTER_SYSTEM_PROMPT` に「test-cases.md の（全）must TC をテストコードに実体化」責務記述が含まれる
- implementer の initial message が `state.steps["test-materialize"]` で分岐しない
- fast / exempt job（test-cases.md 不在）で implementer が例外・contract 違反を起こさない（verification の test-coverage は skipped）

## T-05: file-set 同定の runtime primitive を置換する（D3）

- [x] `src/core/port/runtime-strategy.ts` の `diffPathsBetweenCommits(baseOid, headOid, paths, cwd)` を `listChangedFilesBetweenCommits(baseOid, headOid, cwd)`（path フィルタなし、`ChangedFilesResult` を返す）へ置換する。`RuntimeStrategy`（optional）と `RealRuntimeStrategy`（required）の両宣言を更新する
- [x] `src/core/runtime/local.ts` の実装を `git diff --name-only <baseOid> <headOid>`（`--` pathspec なし・空 paths 短絡なし）へ置換する
- [x] `src/core/runtime/`（ManagedRuntime 実装）で当該メソッドが構造的 unavailable を返すことを確認・更新する

**Acceptance Criteria**:
- `diffPathsBetweenCommits` が production から消え、`listChangedFilesBetweenCommits` が両 runtime 型と LocalRuntime に存在する
- LocalRuntime 実装が 2 commit 間の全変更ファイルを path フィルタなしで返す（exit 0 → success、非 0 / spawn error → unavailable）
- ManagedRuntime は unavailable を返す

## T-06: bite-evidence gate を EB-native file-set に組み替える（D3）

- [x] `src/core/step/bite-evidence/gate.ts` から `baseOid`（step 3 の `resolveBaseCandidateOids` / null 時 strategy-deferred）を削除する
- [x] step 順を「非 forward type → deferred → tamper → EB ref 解決（null → deferred）→ runtime capability（`listChangedFilesBetweenCommits` を含む）→ HEAD 捕捉（null → deferred）→ `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` → `selectMaterializedTestFiles` → 空なら strategy-deferred → red（`runTestsOnSynthesizedTree`）→ green（`runTestsAtCommit`）」に組み替える
- [x] `GateDeps.runtimeStrategy` の Pick 型を `listCommitChangedFiles` → `listChangedFilesBetweenCommits` に更新する（他メソッドは不変）
- [x] `resolveBaseCandidateOids` import を削除し `resolveEvidenceBaseRev` は残す

**Acceptance Criteria**:
- gate は `test-materialize` run を参照しない
- `test-materialize` run 無しの forward-type state で、file 集合が EB↔HEAD diff から同定され、baseOid 不在の deferral を出さず red→green 判定（passed / failed）に到達する
- 非 forward type / EB ref 不在 / runtime capability 不足 / 空選択 は従来どおり strategy-deferred

## T-07: archive floor を EB-native file-set + scenario 凍結に組み替える（D3 / D4）

- [x] `src/core/archive/achieved-assurance.ts` の (P2) baseOid 解決・null early-return を削除する
- [x] file 集合を `listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)` → `selectMaterializedTestFiles` で同定する（biteEvidence が floor 制約されるときのみ EB ref を解決）
- [x] testDerivation の判定を scenario revision binding のみ（`(c)`）に縮退し、blob freeze `(b)`（`diffPathsBetweenCommits(baseOid, finalHeadOid, files)`）を廃止する。`testDerivation = "frozen"` は scenario 凍結 intact で成立させる
- [x] biteEvidence は type gate + base-red（`runTestsOnSynthesizedTree`）+ HEAD-green（`runTestsAtCommit`）を維持し、blob freeze への依存を外す。file 集合は上記 EB diff から取る
- [x] `AssuranceProvenanceRuntime` の Pick 型を更新する（`listCommitChangedFiles` / `diffPathsBetweenCommits` を除去、`listChangedFilesBetweenCommits` を追加、`runTestsAtCommit` / `runTestsOnSynthesizedTree` / `readFileAtCommit` は維持）
- [x] testDerivation-only floor 制約時に bite 用 I/O（base-red / HEAD-green）を走らせない skip 構造を保つ
- [x] `STANDARD_PROFILE` / `state/profile.ts`（lattice・satisfiesFloor・policyDigest）は無変更であることを確認する

**Acceptance Criteria**:
- floor は `test-materialize` run（baseOid）を参照しない
- `test-materialize` run 無しの forward-type state（`synthesizedCommits` + `finalHeadOid` + runtime あり）で baseOid 不在の early-return をせず base-red / HEAD-green の評価に到達する
- scenario 凍結 intact → `testDerivation = "frozen"`、scenario mismatch → absent（fail-closed）
- blob freeze（test blob byte 不変）を要求しない
- `STANDARD_PROFILE.assurance.testDerivation` は `"frozen"` のまま

## T-08: oids.ts から baseOid 解決を削除する（D3）

- [x] `src/core/step/bite-evidence/oids.ts` の `resolveBaseCandidateOids` を削除する（gate / floor から参照除去後、他 production caller が無いことを確認）
- [x] `resolveEvidenceBaseRev` は維持する

**Acceptance Criteria**:
- `resolveBaseCandidateOids` が production から消える
- `resolveEvidenceBaseRev` は残り、gate / floor から使用される
- production 全体で `resolveBaseCandidateOids` の参照が無い

## T-09: resume legacy alias を追加する（D5）

- [x] `src/core/resume/resolve-step.ts` の `LEGACY_STEP_ALIASES` に `"test-materialize": STEP_NAMES.IMPLEMENTER` を追加する（build-fixer と同じ場所・パターン）
- [x] `state.step` hard-crash fallback（priority 4）は alias 非適用のまま（build-fixer と同一の既存挙動）であることを確認する

**Acceptance Criteria**:
- `--from test-materialize` が `implementer` に解決される
- `resumePoint.step = "test-materialize"` が `implementer` に解決される
- `test-materialize` 実行歴を含む legacy state の読み込み・fold が例外なく通る

## T-10: 影響テストを更新し受け入れ基準を固定する

design「テスト更新対象の全列挙」に従って既存テストを更新し、受け入れ基準の新規 pin を追加する。列挙外のテストは無変更で green を保つ。

- [x] 遷移表: `test-gen-exemption.test.ts`（TC-007 → implementer、TC-012 の TEST_MATERIALIZE row / exempt guard 前後関係、TC-006/TC-015 の `specFixerForwardsToImplementer` 除去）、`bite-evidence-pipeline.test.ts`（TC-009 の TEST_MATERIALIZE 存在 → 非存在）、`standard-transitions.test.ts`（TEST_MATERIALIZE 行不在 / 全 type spec-review approved → implementer を新規 pin）
- [x] gate/oids: `gate.test.ts`（file-set 源を EB diff に + 「test-materialize run 無しで red→green 到達」を新規追加）、`gate-empty-selection.test.ts`、`evidence-base-gate.test.ts`、`evidence-base-oids.test.ts`（`resolveBaseCandidateOids` 削除対応、`resolveEvidenceBaseRev` 維持）、`oid-capture.test.ts`（fixture base commit を EB-native へ）
- [x] archive: `achieved-assurance.test.ts`（baseOid 前提削除、testDerivation を scenario 凍結のみで pin、biteEvidence の file-set 源、blob freeze ケース削除、TC-015a — materializedTestFiles = [] でも scenario binding intact なら testDerivation = "frozen" — の pin ケースを同テストファイル内に追加）、`evidence-base-archive-floor.test.ts`（baseOid 無しで判定到達を pin）
- [x] runtime primitive: `diff-paths-between-commits.test.ts`（`listChangedFilesBetweenCommits` へ書換・paths 引数廃止）、`evidence-base-e2e.test.ts` / `bite-evidence-e2e-gate.test.ts`（base commit を implementer-materialized テストへ、primitive 名更新）
- [x] prompt/template: `prompt-skeleton-drift-guard.test.ts`（`TEST_MATERIALIZE_SYSTEM_PROMPT` の import/配列/カウント除去: `ALL_14_AGENT_PROMPTS` 13→12、`PRODUCER_AND_FIXER_PROMPTS` 7→6、`PIPELINE_MAP` 15→14 行、`EXPECTED_STEPS`/`PREVIOUSLY_MISSING_STEPS` から除去、TC-003 の TEST_MATERIALIZE assert 削除）、`tc-source-contract.test.ts`（consumer 列挙から test-materialize 除去）
- [x] resume: `resolve-step.test.ts`（`--from` / `resumePoint.step` の test-materialize → implementer alias を新規追加）
- [x] 新規 pin: implementer prompt に「全 must TC の実体化責務」が含まれることを固定; test-materialize 実行歴を含む legacy state の読み込み・fold・resume が壊れないことを固定
- [x] exempt type の観測挙動（test-case-gen / bite-evidence を通らない）を既存テストの無改変 green で確認する（TC-004/TC-005）

**Acceptance Criteria**:
- 上記の全 pin が green
- design 列挙外のテストは無変更のまま green
- 受け入れ基準に対応する新規 pin（遷移表に TEST_MATERIALIZE 行なし / implementer 実体化責務 / gate baseOid 無し red→green / floor baseOid 無し判定 / testDerivation 新意味論 / legacy resume alias）が存在する

## T-11: 全体緑を確認する

- [x] `bun run typecheck` が緑
- [x] `bun run test` が緑

**Acceptance Criteria**:
- `typecheck && test` が緑
- production コード・テストに未解決の test-materialize 参照が残らない（doc の意図的な #-issue 参照を除く）
