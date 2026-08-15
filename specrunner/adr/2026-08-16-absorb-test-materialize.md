# ADR-20260816: test-materialize の廃止 — テスト実体化を implementer に統合する

> 本 ADR は `absorb-test-materialize` request の設計判断を記録する。`test-materialize` 独立 step を廃止し、テスト実体化（test-cases.md → テストコード）を implementer の単一責務へ統合する。また bite-evidence の materialized test file 同定を Evidence Base ネイティブ方式（fork point diff）へ置換し、`testDerivation = "frozen"` の意味論を工程境界 blob freeze から scenario 凍結へ再定義する。

## ステータス

accepted

supersedes（部分）: `specrunner/adr/2026-08-15-evidence-base.md` D3（「materialized test ファイルのセットは引き続き最新 test-materialize commit から同定する」）— 本 ADR の D3 で Evidence Base ネイティブ方式に置換する

## コンテキスト

`test-materialize` は「implementer より前に、実装を見ずに test-cases.md をテストコードへ実体化する」独立 agent step として設計された。この step 分離が担ってきた保証は 2 つある。

1. **時系列真実性**（テストが実装より先に書かれた） — Evidence Base 上の red→green 機械実行（#997, ADR-20260815-evidence-base）が担う。テストが「いつ」書かれたかは red→green 証明に寄与しない。この保証は strip-test-authority（#991, ADR-20260814）で工程順序への依存を撤廃することにより既に解体済み。
2. **canon 由来性**（テストが test-cases.md だけから書かれる・実装からの逆算を物理的に不能にする） — test-case-gen の design phase 移動（#996, ADR-20260815-test-case-gen-pre-spec-review）で test-cases.md が spec-review の照合対象になった。実体化はその機械的翻訳であり、独立 session を要する工程ではなくなった。

分離のコストは実測で明確になっている。test-materialize は毎 job で最重量級の独立 agent session を 1 つ消費し（実測 ~18 分/job の事例あり）、「implementer は既存テストを変更してよいか」「materialize 後の再走で base が汚染する」等、工程境界そのものが escalation 類型の温床だった（#985 の破壊ループ、#989 の偽 baseline、いずれも境界起因）。

### 前提コードの確定事実

- `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` に `SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional）、`TEST_MATERIALIZE success → IMPLEMENTER` / `error → escalate`、`SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward`。exempt type は `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt` と `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer` で既に test-materialize をバイパス。
- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids` の `baseOid` = 最新 test-materialize run の `commitOid`。gate の file-set 同定と archive floor の両方が依存。`resolveEvidenceBaseRev`（= `synthesizedCommits[0]^`）は fork point で test-materialize とは無関係（ADR-20260815-evidence-base D1）。
- `src/core/step/bite-evidence/gate.ts` — file-set は `listCommitChangedFiles(baseOid)` → `selectMaterializedTestFiles`。`baseOid = null` は strategy-deferred。red は `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid)`、green は `runTestsAtCommit(headOid)`（#997）。
- `src/core/archive/achieved-assurance.ts` — P2: `baseOid = null` → 両 dimension absent。(a) `listCommitChangedFiles(baseOid)` で file-set 列挙、(b) `diffPathsBetweenCommits(baseOid, finalHeadOid, files)` で blob freeze、(c) scenario revision binding（test-cases.md@testCaseGenOid == @finalHeadOid）。`testDerivation = "frozen"` は (b)+(c)、`biteEvidence = "required"` は (a)+(b)+(c)+type gate+base-red+HEAD-green。
- `src/core/step/implementer.ts` — `testsMaterialized = Boolean(state.steps?.[TEST_MATERIALIZE]?.length)` で implement-only mode / TDD mode を分岐（`buildImplementerInitialMessage`）。
- `src/core/pipeline/test-gen-exemption.ts` — `isTestGenExempt` は test-case-gen・test-materialize・bite-evidence の 3 箇所のバイパスを制御（#987）。`specFixerForwardsToImplementer = specFixerObservationForward AND isTestGenExempt`。
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER }`（ADR-20260815-absorb-build-fixer D4）。`--from` と `resumePoint.step` の 2 経路で alias を適用。
- `src/state/profile.ts` — `STANDARD_PROFILE.assurance.testDerivation = "frozen"`。`deriveAchievedAssurance` は現状 `"frozen"` しか産出しない（`"coupled"` は profile 宣言専用値、achieved には出現しない）。
- production 参照 27 ファイル（registry / write-scope / staging-containment / output-contract / templates / prompts / tc-source-contract / step-names / agent-definition / config-effective / verification test-coverage 等）。
- `kernel/agent-definition.ts` の `AgentStepName` union と `kernel/step-names.ts` の `AGENT_STEP_NAMES` は `state/schema/types.ts` の `_AgentStepExtraInArray` / `_AgentStepExtraInUnion` で双方向に同期強制されている（compile guard）。

## 決定

### D1: 遷移表 — spec-review / spec-fixer approved を全 type で implementer に収束させる

`SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional）を `SPEC_REVIEW approved → IMPLEMENTER`（unconditional、全 type）へ置換する。

**Rationale**: 全 type が同一の `→ IMPLEMENTER` に収束するため、exempt を区別する guard は spec-review/spec-fixer approved 経路では意味を失う。first-match-wins で guard 付き row を残すと dead な冗長 row になる。両者を単一 unconditional row に畳むのが遷移表の意味と一致する。exempt 専用の `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`（line 260）は unconditional row に包摂され不要になるので削除する。`TEST_MATERIALIZE` を step とする 2 行（success / error）も削除する。

spec-fixer 観測 forward は置換後に exempt / 非 exempt とも IMPLEMENTER に収束する。`SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward`（line 273）を `→ IMPLEMENTER` に変更する。包摂される `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer`（line 271）とその述語 `specFixerForwardsToImplementer`（test-gen-exemption.ts）を削除する。`specFixerObservationForward`（spec-observation.ts）は残し、routing 先とコメントを implementer へ更新する。

結果 `isTestGenExempt` の使用は 2 箇所（`DESIGN success → SPEC_REVIEW` = test-case-gen バイパス、`IMPLEMENTER success → VERIFICATION` = bite-evidence バイパス）に縮退する。exempt type の観測挙動（test-case-gen を通らない・bite-evidence を通らない）は不変。`FAST_TRANSITIONS` は test-materialize を含まないため無変更。

**却下案**:
- `specFixerForwardsToImplementer` の述語と row を残し `specFixerObservationForward` row だけ implementer に向ける → 述語が dead に残り、`isTestGenExempt` の使用が 3 箇所のまま。要件「2 箇所に縮退」に反する。却下。

### D2: implementer 単一 mode — 実体化を責務に統合、coverage は verification が保持

`implementer.ts` の `testsMaterialized` 分岐（`buildImplementerInitialMessage` の implement-only mode / recovery message / conformance 経路の受け渡し）を廃止し、単一 mode にする。`state.steps?.[TEST_MATERIALIZE]` 参照を削除する。initial message と `implementer-system.ts` の prompt は「test-cases.md の全 must TC をテストコードに実体化し、実装と整合させる」責務を明示する。TC 変換ルール（Scenario 由来 = spec.md の GWT を読む、非 Scenario 由来 = test-cases.md の GWT、テストに TC ID を記載、manual/gate は自動テスト対象外）は test-materialize-system.ts から implementer prompt へ引き継ぐ。

coverage 保証（全 must TC が assertion 付きテストに存在）は **verification の `test-coverage` phase（`runTestCoveragePhase`）が implementer 出力に対して既に実行しており不変**。よって implementer 側に新規 output contract は追加しない。

**Rationale**: 実体化と実装を同一 session が書くため mode 分岐は不要。coverage の機械歯は verification に既存であり、implementer に `test-coverage` output contract を足すと（i）verification と二重化し（ii）test-cases.md 不在の fast/exempt job で contract 違反になる（local.ts の test-coverage 分岐は「file 不在 → violation」）ため、条件付き contract という追加機構を要する。verification 再利用が最小で正しい。

**却下案**:
- implementer に `test-coverage` output contract を条件付き（test-cases.md 存在時のみ）で追加 → verification と重複し条件分岐機構を要する。verification 失敗 → implementer 再入で同じ修復ループが既に成立するため却下。

### D3: file-set 同定の Evidence Base ネイティブ化

materialized test files の同定を「test-materialize commit の changed files」から「**Evidence Base 参照（`resolveEvidenceBaseRev(state)` = `synthesizedCommits[0]^`）↔ candidate の unfiltered diff にテストパターンを適用**」する方式へ置換する。`selectMaterializedTestFiles` フィルタ（exclusion + test-pattern）は維持する。

runtime primitive: `diffPathsBetweenCommits(baseOid, headOid, paths, cwd)` を **`listChangedFilesBetweenCommits(baseOid, headOid, cwd)`**（= `git diff --name-only <baseOid> <headOid>`、path フィルタなし）へ置換する。`RuntimeStrategy`（optional）/ `RealRuntimeStrategy`（required）/ `LocalRuntime`（実装）/ `ManagedRuntime`（structural unavailable）を更新する。

- `gate.ts`: `baseOid`（step 3）を削除。順序を「EB ref 解決 → runtime capability（`listChangedFilesBetweenCommits` を含む）→ HEAD 捕捉 → `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` → `selectMaterializedTestFiles` → 空なら strategy-deferred → red/green」に組み替える。`resolveBaseCandidateOids` import を削除。
- `achieved-assurance.ts`: P2 の `baseOid` 前提を削除。file-set は `listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)` → `selectMaterializedTestFiles`。`resolveBaseCandidateOids` は他に production caller が無いため `oids.ts` から削除する（`resolveEvidenceBaseRev` は残す）。

**Rationale**: architect 評価「file-set 同定は fork point diff が正しい」— 工程 commit ではなく EB↔candidate の diff が resume・再走・複数回 implementer 実行のいずれでも同一の答えを返し、Evidence Base の意味論と一貫する。ADR-20260815-evidence-base D3 が「test-materialize を implementer に統合する後続 request で対処する」と前登録していた既知の債務を本 ADR で解消する。`diffPathsBetweenCommits` は blob freeze（D4 で廃止）以外の production caller を持たないため、path フィルタを落として rename する方が「空 paths = 全 files」の意味過負荷を避け、名前と実態を一致させる（correct-on-edge-cases）。

**却下案**:
- `diffPathsBetweenCommits` の signature を保ち「空 paths = 全 files」に意味変更 → fake の signature は壊れないが名前が誤解を招く。却下。
- 既存 `listChangedFiles(baseBranch,...)` を再利用 → merge-base（main, HEAD）依存で main 前進時に fork point と乖離し得る。かつ HEAD 固定で floor の `finalHeadOid` に使えない。Evidence Base の main 非依存設計に反するため却下。

### D4: testDerivation の意味論再定義 — 工程 blob freeze を廃し scenario 凍結へ縮退

`testDerivation = "frozen"` の判定を **scenario revision binding のみ**（test-cases.md@testCaseGenOid の content hash == test-cases.md@finalHeadOid）に縮退する。blob freeze（materialized test blob が baseOid→finalHeadOid で不変）は判定から**廃止**する。`STANDARD_PROFILE.assurance.testDerivation = "frozen"` の floor 値は**変更しない**。

縮退後の `"frozen"` の意味: 「テストの設計正典（test-cases.md）が test-case-gen 以降 final HEAD まで不変であり、テストはその凍結された正典から派生している」。正典すり替え tamper 防御は scenario revision binding が引き続き提供する。テストが「変更に噛んでいる」ことは `biteEvidence`（red→green）が別途保証する。

`deriveAchievedAssurance` は従来どおり `"frozen"` を産出する（scenario 凍結が intact のとき）。`STANDARD_PROFILE` の `testDerivation: "frozen"` floor は満たせるまま。`"coupled"` は profile 宣言専用値のままで achieved には出現しない。lattice（`coupled < frozen`）・`satisfiesFloor`・`policyDigest`・`STANDARD_PROFILE` は無変更。

**Rationale**: blob freeze は工程分離の産物であり、統合後は成立しない（専用 test-materialize commit が消え、implementer が verification 失敗時にテストを複数回書き換え得るため、初回と最終 HEAD で必ず差分が出る）。より根源的な派生不変条件（正典凍結）は scenario revision binding が既にコードに存在し、それが `"frozen"` の実質を担い続ける。floor を下げない選択は archive floor・assurance-floor ADR（ADR-20260717 系）の既存期待値を保存し、blast radius を最小化する。

**却下案**:
- achieved を `"coupled"` に落とし `STANDARD_PROFILE` floor を `"coupled"` に下げる → lattice の "coupled"（実装結合）ラベルは統合後の実態に一見合致するが、`policyDigest`/`STANDARD_PROFILE`/floor 比較の広域変更を要し、archive floor が既存 job で testDerivation を検証する期待を弱める。正典凍結という検証可能な実質が残る以上、floor を下げる必要はない。却下。

### D5: 削除と互換 — step 資産の削除と legacy alias

**削除**: `src/core/step/test-materialize.ts`、`src/prompts/test-materialize-system.ts`、registry.ts の import/steps/roles、config-effective.ts の import/stepMap、`write-scope.ts` の `GUARDED_WRITE_STEPS` の `"test-materialize"`、`staging-containment.ts` / `output-contract.ts` / `runtime-strategy.ts` / `templates/step-output-templates.ts` / `tc-source-contract.ts` / `pipeline-map.ts` / `rules.ts` の test-materialize 言及（doc comment・表・consumer 列挙）。

**resume 互換**: `resolve-step.ts` の `LEGACY_STEP_ALIASES` に `"test-materialize": STEP_NAMES.IMPLEMENTER` を追加する（absorb-build-fixer D4 と同一の場所・パターン）。`--from test-materialize` と `resumePoint.step = "test-materialize"` の 2 経路で implementer に写る。`state.step = "test-materialize"` の hard-crash fallback（priority 4）は alias 非適用のまま — build-fixer と同一の既存挙動を踏襲しパターンを逸脱しない。

**legacy state**: fold は `StepName = string` passthrough で test-materialize 実行歴を保持する。`resolveBaseCandidateOids` 削除後、test-materialize run は gate/floor から参照されず無害に無視される。

`test-coverage` OutputContractKind と local.ts の分岐は test-materialize が唯一の producer だが、汎用機構であり verification が同等保証を持つため**削除しない**（触れると output-contract.ts + local.ts + 無関係 test 3 本に波及し挙動利得ゼロ）。output-contract.ts は test-materialize を名指す doc comment のみ更新する。

**Rationale**: alias は「過去 step 名を無視し後継へ流す」互換を最小の写像で成立させる。absorb-build-fixer が確立した `LEGACY_STEP_ALIASES` パターンの直接の拡張であり、1 行の追加で resume 主経路を覆う。`test-coverage` の保持は汎用機構の blast を避ける laziness の適用。

**却下案**:
- `test-coverage` OutputContractKind ごと削除 → dead な producer は消えるが汎用 kind の除去は blast が大きく利得なし。doc scrub に留める。

### D6: step 削除に伴う compile guard の同時更新

`"test-materialize"` を `AGENT_STEP_NAMES`（kernel/step-names.ts）と `AgentStepName` union（kernel/agent-definition.ts）の双方から**同一変更**で除去し、`STEP_NAMES.TEST_MATERIALIZE` を削除する。

**Rationale**: `state/schema/types.ts` の `_AgentStepExtraInArray` / `_AgentStepExtraInUnion` が双方向に同期強制しており、片側だけ変えると `tsc` が落ちる。`STEP_NAMES.TEST_MATERIALIZE` を参照する production/test の全箇所を先に潰してから定数を消す（TypeScript が落ちる箇所が回帰の網になる）。

## 却下した代替案（全体方針）

### 案 A: test-materialize を維持し implementer の mode 分岐を整理するだけ

step を残し、「implement-only / TDD」の mode 分岐を廃止して単一指示にするだけに留める。

- **Pros**: 変更範囲が小さい。file-set 同定・testDerivation 意味論・legacy alias を変えない。
- **Cons**: 毎 job で最重量級 session 1 つ分（~18 分）のコストが継続する。工程境界起因の escalation 類型（「implementer はテストを変更してよいか」等）が解消しない。Evidence Base ネイティブ化（D3）が先送りされ ADR-20260815-evidence-base D3 の既知債務が残る。
- **Why not**: 分離のコストが明確で、両保証（時系列真実性・canon 由来性）がすでに別機構へ移管済みであることが確認済み。step 分離に残る価値がない。

### 案 B: test-materialize を残しつつ Evidence Base file-set 同定のみ実施する

step は維持し、D3 の file-set 同定（EB↔candidate diff）だけを先行実施する。

- **Pros**: 段階的に変更できる。D4 の testDerivation 再定義を遅らせられる。
- **Cons**: step 分離コスト・工程境界 escalation は残る。testDerivation の blob freeze が実態（複数回の implementer 書き換え）と乖離し続ける。D3 だけ先行すると「test-materialize は残るがそのコミットを参照しない」という半端な状態が生じる。
- **Why not**: D3 は D1/D2 のセットで完結する。部分実施は設計の整合を崩す。

## 影響

### Positive

- test-materialize 独立 session（~18 分/job）が削除され、直接 implementer へ移行することで per-job コストが削減される
- 工程境界起因の escalation 類型（「実装を見ずにテストを書け」「implementer はテストを変更してよいか」「materialize 後の再走で base が汚染する」）が構造的に消える
- file-set 同定が fork point diff に収束し、resume・再走・複数回 implementer 実行のいずれでも同一の答えになる
- `testDerivation = "frozen"` の保証の実質（正典凍結）が維持されたまま blob freeze の dead weight が削除される
- `resolveBaseCandidateOids` の削除により、工程時系列依存の OID 解決コードが除去される
- 既存 job state は無変換で互換（test-materialize 実行歴は保持・無視、resume は alias で implementer へ）

### Negative

- 初回走行の「実装を見ずにテストを書く」物理的保証を失う。実装を見た鏡写しテストが EB 上でも red→green を通り得る（検出限界）。approved batch の明示的設計判断。この限界は分離下でも resume 経路には既に存在しており、初回だけ守っても保証としては不完全だった
- coverage 不足は verification 失敗 → implementer 再入で解消される（test-materialize の in-session follow-up 修復が消え 1 往復増える可能性があるが、独立 session 1 つ分の削減が上回る）

### Known Debt / Deferred

- hollow テスト（実装から逆算した鏡写しテスト）の意味的検出 — 防御は test-cases.md の質（spec-review 照合）と red→green の機械実行に一本化する
- managed runtime での `listChangedFilesBetweenCommits` 実装（本 ADR の対象は local runtime のみ、managed は unavailable として扱う）

## 参照

- Request: `specrunner/changes/absorb-test-materialize/request.md`
- Design: `specrunner/changes/absorb-test-materialize/design.md`
- Spec: `specrunner/changes/absorb-test-materialize/spec.md`
- Implementation: `src/core/pipeline/types.ts`・`src/core/step/implementer.ts`・`src/prompts/implementer-system.ts`・`src/core/step/bite-evidence/gate.ts`・`src/core/step/bite-evidence/oids.ts`・`src/core/archive/achieved-assurance.ts`・`src/core/resume/resolve-step.ts`・`src/core/runtime/local.ts`・`src/core/port/runtime-strategy.ts`
- Supersedes（部分）: `specrunner/adr/2026-08-15-evidence-base.md` D3（file-set 同定 test-materialize commit → EB↔candidate diff）
- Related: `specrunner/adr/2026-08-14-strip-test-authority.md`（工程順序依存の権威撤廃・連作第 1 弾）
- Related: `specrunner/adr/2026-08-15-evidence-base.md`（fork point 解決・red→green 構造の確立）
- Related: `specrunner/adr/2026-08-15-test-case-gen-pre-spec-review.md`（遷移表の直接の前提、TC canon 確立）
- Related: `specrunner/adr/2026-08-15-absorb-build-fixer.md`（legacy alias パターンの確立）
- Related: `specrunner/adr/2026-08-13-test-generation-type-gate.md`（exempt type・isTestGenExempt の設計）
