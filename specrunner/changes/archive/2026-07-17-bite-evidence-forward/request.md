# base/candidate OID を捕捉し、forward strategy の BiteEvidence を機械生成する（R4, MVP）

## Meta

- **type**: spec-change
- **slug**: bite-evidence-forward
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260716 D3（BiteEvidence は記録 base/candidate OID で gate が test を機械実行して生成、agent 自己申告でない）で ratify 済み。本 request はその forward strategy(base-red→candidate-green)を MVP として実装する。refactoring(mutation)/security/config の category strategy は R4-follow-up で、本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

R3（#844）は test-case-gen→**test-materialize（base コミット：test 在り・実装無し）**→**implementer（candidate コミット：実装）**の commit 境界を作った。しかし:

- **base/candidate の commit OID がどこにも記録されていない**（`StepRun` に OID フィールドが無い）。R4 の gate が「その OID で test を実行する」には OID を branch-borne に捕捉する必要がある。
- **BiteEvidence を生成する gate が無い**。歯が本物（実装を外すと test が red）であることは、記録 OID で test を機械実行して初めて言える（ADR D3）。agent 自己申告や「test が pass した」だけでは、base で通る空洞 test を排除できない。

本 request は forward strategy（bug-fix / new-feature）に絞り、**base OID で materialize 済み test が red、candidate OID で green** を機械検証して `BiteEvidence` を branch-borne に記録する。

## 現状コードの前提

- **test-materialize / implementer**（#844）: test-materialize が base コミット（`src/core/step/test-materialize.ts`、gitState に test を書き1コミット）、implementer が candidate コミット（実装のみ）。needs-fix は implementer に戻る（test-materialize は1回のみ）。
- **StepRun**（`src/state/schema/types.ts:172`）に commit OID フィールドは無い。**`RuntimeStrategy.captureHeadSha(cwd)`**（`src/core/runtime/local.ts`、`git rev-parse HEAD`）で HEAD OID を取れる。round は `approvedAtCommit` で SHA を扱う前例あり。
- **per-node commit**: `executor.ts:433` → `finalizeStepArtifacts` → `commitAndPush`（`commit-push.ts:36`）が node 終端で1コミット。commit 後の HEAD が各 node の commit OID。
- **frozen scenario hash**: test-case-gen の `writes()`=test-cases.md が既存 lineage（`commit-orchestrator.ts:217-245`→`digestArtifacts`→`appendLineage`→events.jsonl）で sha256 記録される（#844 で挙動固定済み）。R4 の tamper 基点。
- **test の TC-ID 埋め込み**: materialize 済み test は TC-ID を含む（verification が grep 検証）。gate は TC-ID で「どの test を base/candidate で走らせるか」を特定できる。
- **request.type**（`src/config/type-config.ts`）: bug-fix / new-feature / spec-change / refactoring / chore。forward strategy = bug-fix / new-feature（ADR D3）。
- **fail-closed 前例**: `checkpointNotAttachableError` / gate の verdict による停止 / `StepHalt`。

## 要件

1. **base/candidate OID の branch-borne 捕捉**: test-materialize の commit 後の HEAD OID（= base）と implementer の commit 後の HEAD OID（= candidate）を、branch-borne（state.json または events.jsonl lineage）に記録する。`captureHeadSha` を使い、既存の per-node commit 直後に記録する。resume/checkpoint を跨いで保持されること。

2. **BiteEvidence gate（forward strategy）**: implementer の後（candidate 確定後）に、forward strategy 対象（request.type ∈ {bug-fix, new-feature}）の job で次を実行する gate を置く:
   - base OID を隔離 worktree に checkout し、**materialize 済み test のみ**を実行 → **red（fail）を期待**。
   - candidate OID を checkout し、同 test を実行 → **green（pass）を期待**。
   - test ごとに `BiteEvidence` レコード（`{ testId, strategy:"forward", baseResult:"red"|"green", candidateResult, verified:boolean }`）を branch-borne に記録する。
   - **base で green（= 実装無しで通る空洞 test）を検出したら fail-closed** で拒否する（歯が立っていない）。candidate で red（実装で緑にならない）も拒否。

3. **tamper 検知**: gate 実行時、現在の test-cases.md の hash が test-case-gen 境界で記録された frozen hash と一致することを検証する。不一致 → fail-closed（scenario が事後改変された）。

4. **strategy 選択と非対象の扱い**: request.type が forward 対象でない（refactoring/spec-change/chore）場合、gate は BiteEvidence を生成せず `strategy-deferred` として素通りする（本 request は forward のみ実装、他 category は R4-follow-up）。挙動の回帰を起こさない。

5. **コスト配慮**: base/candidate での実行は **materialize 済み test ファイルのみ**に限定し、全 suite を二重実行しない。

## スコープ外

- **他 category strategy**: refactoring（behavior 保存＋mutation）、security（攻撃 fixture）、config（旧構成 fail）。R4-follow-up。
- **R2** floor / minimumAssurance、**R6** fast、**R5** provenance/offline verify。
- profile 値に基づく分岐（本 request は request.type→strategy のみ、assurance 値は参照しない）。
- base OID の red を「pipeline の失敗」として扱うこと（base の red は intended。gate 内の隔離実行であり pipeline branch の HEAD は candidate のまま）。

## 受け入れ基準

- [ ] test-materialize / implementer の commit 後、base OID と candidate OID が branch-borne に記録され、resume を跨いで保持されることをテストで固定する。
- [ ] forward job で gate が base OID で materialize 済み test を実行して red、candidate OID で green を確認し、`BiteEvidence` を branch-borne に記録することをテストで固定する。
- [ ] **空洞 test の排除**: base で green になる test（実装無しで通る）を gate が fail-closed で拒否することをテストで固定する（歯の本体）。
- [ ] test-cases.md の frozen hash と現在 hash の不一致で gate が fail-closed になることをテストで固定する。
- [ ] 非 forward（refactoring/chore 等）job では gate が `strategy-deferred` で素通りし、BiteEvidence を生成しないことを固定する。
- [ ] base/candidate 実行が materialize 済み test のみで、全 suite 二重実行でないことを固定する。
- [ ] 既存 pipeline / verification / attach / R3 の挙動保存テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **歯は記録 OID での機械実行で判定**（base-red→candidate-green）。→ 却下: agent 自己申告 or「candidate で test が pass」だけで受ける（base で通る空洞 test を見逃す）。
- **base の red は gate 内隔離実行**（pipeline HEAD は candidate 不変）。→ 却下: base の red を pipeline 失敗にする（test-materialize の意図を壊す）。
- **base/candidate 実行は materialize 済み test のみ**。→ 却下: 全 suite を二重実行（コスト爆発）。
- **本 request は forward strategy のみ**。→ 却下: refactoring mutation / security / config を前倒し（R4-follow-up の射程を侵食）。
- **strategy は request.type から選ぶ、assurance level は見ない**（ADR D2）。→ 却下: profile/assurance 値から strategy を導出。
