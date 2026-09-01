# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/request.md` — 要件・Acceptance Criteria・Non-goals 確認
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/design.md` — 全 Decision (D1–D6) を読み、依存方向・責務分離を確認
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md` — 全 Requirement と Scenario を確認
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md` — T-01〜T-17 のタスク分解と AC を確認
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/test-cases.md` — TC-001〜TC-046 の全 46 件を確認
- `src/core/port/runtime-strategy.ts`（先頭 220 行）— 現状ポート構造・unknown の位置を確認
- `src/core/types.ts`（先頭 200 行）— `PipelineDeps.runtimeStrategy` フィールドの現状を確認

### 確認した観点

**Architecture（設計パターン・責務分離・依存方向）**
- D1: Consumer-owned capability は step/pipeline domain 層に置かれ、ドメイン型を直接参照できる → port→domain back-edge を回避する設計として妥当
- D2: `PipelineDeps ↔ RuntimeStrategy` の import cycle を `runtimeStrategy?` フィールド除去で解消し、`buildDeps` 戻り値を typed 化する手順が一貫している
- D4: port 層から `finalizeStepArtifacts`/`commitFinalState`/`commitRoundArtifacts` を削除し、capability に移行する手順が明確
- D5: derive helper を capability ファイルと同居させる ("alongside the capability interface") という配置指針が明示されている
- D6: capability method は required とし、不在は `undefined` フィールドで表現する原則が定められている
- `pipeline-capability.ts` が `src/git/push-capability.ts` に依存することは Risk として明示され design.md が受け入れを宣言している
- T-02〜T-17 の依存順序（capability 定義 → PipelineDeps 更新 → port 更新 → runtime 実装 → consumer 更新 → テスト → ドキュメント）は適切

**Correctness（ロジック・境界条件）**
- command lifecycle 順序（provider readiness → duplicate-job guard → bootstrapJob → setupWorkspace → buildDeps → registerCleanup → reload）が spec.md Requirement および T-15 で明示されている
- step finalize 順序（prepare → agent run → validate outputs → finalize → captureHeadSha）が spec.md Requirement で定義されている
- `roundOwnsGitEffects` フラグが `finalizeStepArtifacts` をスキップする条件として T-08・spec Scenario で明記されている
- ManagedRuntime の no-op semantics が T-07・spec Requirement で定義されており、T-14 でテスト確認が必要とされている
- R2a 能力（`changedFiles`/`commitInspection`/`revisionContent`）が `PipelineDeps` に explicit field として追加され、re-derivation を排除する方針が D2・T-09 で整合している

**Completeness（タスク分解カバレッジ）**
- Request の 8 Requirement はそれぞれ T-01〜T-17 に対応している
- Acceptance Criteria 13 項目のうち実装担当部分（capability/cast/facade/test/docs）はすべて T に対応タスクがある
- 実装に必要なファイル群（`step-capability.ts`・`pipeline-capability.ts` 新規 + 既存 10 ファイル変更）は T-02〜T-12 に列挙されている
- test-cases.md: 46 TC のうち 41 must / 5 should、全 TC に Source 参照あり

---

## 検証できなかった項目

- `commitAndPush` の現行シグネチャ（T-06 sub-task で "option (a) vs (b)" の選択が必要と記述されているが、commit-push.ts の詳細を確認していない）
- `parallel-review-round.ts` が既に `src/git/` に依存しているかどうか（`pipeline-capability.ts` の新規 `git/` 依存が追加か既存かを確認していない）
- R2a の derive helper 実際の配置場所（`runtime-strategy.ts` ポート層 vs consumer 層 — R2a の実装スタイルを読んでいない）

---

## Findings 詳細

### F-1: spec.md の capability required 要件と TC-004 / tasks.md が矛盾している

spec.md の Requirement「Capability methods are required; absence is expressed via undefined field」は "All methods in a capability interface SHALL be required (no `?` modifier)" と規定している。

一方、test-cases.md TC-004 は `snapshotMainCheckoutGuard?` が「the sole optional method」であることを THEN 条件として確認し、tasks.md T-02 AC も「`snapshotMainCheckoutGuard?` is the only optional method (fail-open semantics)」と明記している。

設計の意図（D6: fail-open は null 返却であり能力不在ではないため method は optional でよい）自体は妥当だが、spec.md の Requirement 本文が例外なき "no `?` modifier" と断言しているため、実装者が spec.md の要件を優先すると TC-004 と衝突する。spec.md Requirement に例外句（"except `snapshotMainCheckoutGuard` on `StepArtifactLifecycleCapability`" 等）を追記することで解消できる。

### F-2: T-09 の `verifyFindingRefs` 呼び出しが required メソッドに `?.` を二重適用している

T-09 は `deps.runtimeStrategy.verifyFindingRefs(...)` の置き換えとして `deps.stepIo?.verifyFindingRefs?.(...) ?? []` と指示している。最初の `?.` は capability フィールドが undefined のときのショートサーキット（正しい）。しかし 2 番目の `?.verifyFindingRefs?.` は、`StepIoValidationCapability.verifyFindingRefs` が required method（TC-003 で確認）であるため冗長であり、method が optional であるかのような誤読を招く。

コード自体は TypeScript でコンパイル可能だが、D6「required method — 不在は field で表現する」との不整合が生じ、テスト実装者がメソッドを optional と誤解するリスクがある。`deps.stepIo?.verifyFindingRefs(...)` に修正すべきである。

### F-3: T-06 が derive helper の定義場所を明示せず D5 と齟齬が生じうる

D5 は「`derive*Capability(runtime)` helper is defined alongside the capability interface (in the same consumer-domain file)」と明言している（`step-capability.ts`・`pipeline-capability.ts` に同居させよ）。

しかし T-06 は LocalRuntime (`local.ts`) の実装タスクとして「Add `derive*Capability` helper functions (or inline objects) for each new capability」を列挙しており、定義先ファイルを明示していない。この記述を額面通りに読むと helper を `local.ts` に定義してしまう実装者が出る可能性がある。`local.ts` への定義では capability ファイルとの同居という D5 の設計意図が失われ、将来の再利用や capability ファイル単体でのテストが困難になる。T-06 に「helpers are defined in `step-capability.ts` / `pipeline-capability.ts` per D5; import them into `local.ts`」の一文を追加することで解消できる。
