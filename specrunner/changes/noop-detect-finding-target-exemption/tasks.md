# Tasks: no-op 検知に finding 対象 path の免除を導入する

<!-- 実装対象ファイル一覧（参照用）
- src/core/step/routed-findings.ts            — T-01(新規): collectRoutedFixerFindings + 移設した predicate
- src/core/step/code-fixer.ts                 — T-01: isCoordinatorLoopActive / getNeedsFixMembers を移設し import に置換
- src/core/step/no-op-detect.ts               — T-02: findingTargetPaths / pipelineManagedPaths param 追加・免除/上限適用
- src/core/step/executor.ts                   — T-03: 呼び出し側で免除集合を算出して渡す（import 追加）
- src/core/step/__tests__/executor-no-op.test.ts  — T-04: 免除シナリオの固定（既存 6 ケースは無変更）
-->

---

## T-01: 免除集合の source of truth `collectRoutedFixerFindings` を新モジュールに追加する（D1）

「当該 code-fixer run に routing された findings」を、code-fixer.buildMessage と同一の routing precedence で
導出する純粋関数を追加する。code-fixer の private predicate を中立モジュールへ移設して再利用する。

- [ ] `src/core/step/routed-findings.ts` を新規作成する
  - `src/core/step/code-fixer.ts:73-91` の `isCoordinatorLoopActive(state: JobState): boolean` と
    `:97-106` の `getNeedsFixMembers(state: JobState): string[]` を**このモジュールへ移設**し `export` する
    （ロジックは不変。必要な import: `STEP_NAMES`, `getConformanceFixContext`,
    `REGRESSION_GATE_STEP_NAME`, `CUSTOM_REVIEWERS_STEP_NAME`）
  - `export function collectRoutedFixerFindings(state: JobState): Finding[]` を追加する。分岐は
    code-fixer.buildMessage の precedence を mirror する:
    1. `const conformance = getConformanceFixContext(state, STEP_NAMES.CODE_FIXER); if (conformance !== null) return conformance;`
    2. `if (isCoordinatorLoopActive(state)) { const members = getNeedsFixMembers(state); return collectParallelFixerFindings(state, members, buildCanonWriteScopeFromState(state)); }`
    3. `const chain = deriveImplFixerChain(state); const active = resolveActiveReviewer(state, chain); return getLatestJudgeFindings(state, active) ?? [];`
  - branch 2 の `canonScope` は buildMessage（`code-fixer.ts:208-209`）と同一にするため
    `buildCanonWriteScopeFromState(state)` を使う（deps 不要の state 駆動版）
  - JSDoc に「buildMessage の 3 分岐 precedence と同一の source of truth。分岐 predicate を共有するため
    SELECTION は drift しない。consumer は executor の no-op 免除集合導出」を明記する
- [ ] `src/core/step/code-fixer.ts` を更新する
  - 移設した `isCoordinatorLoopActive` / `getNeedsFixMembers` の**ローカル定義を削除**し、
    `import { isCoordinatorLoopActive, getNeedsFixMembers } from "./routed-findings.js";` に置換する
  - 不要になった import（`CUSTOM_REVIEWERS_STEP_NAME` / `REGRESSION_GATE_STEP_NAME` が他で未使用なら）を整理する
  - buildMessage / reads の**出力（prose / 読む result file / findingsPath / verdict）は一切変更しない**
  - buildMessage の findings 解決箇所（`:167,209,285`）付近に「routing precedence は
    `routed-findings.ts` の `collectRoutedFixerFindings` と一致させること」の相互参照コメントを付す
- [ ] import 循環が無いことを確認する（`routed-findings.ts` は agent/prompt 定義に依存しない light module に保つ）

**Acceptance Criteria**:
- `collectRoutedFixerFindings` が純粋関数（副作用・I/O なし）であり、conformance / coordinator-loop /
  active-reviewer の 3 分岐を code-fixer.buildMessage と同一 precedence で解決する
- `isCoordinatorLoopActive` / `getNeedsFixMembers` の移設後も code-fixer の buildMessage / reads の挙動が不変
- `bun run typecheck` が green、既存 code-fixer 関連テスト（`fixer-reviewer.test.ts` /
  `custom-reviewer-step.test.ts` 等）が無変更で green

---

## T-02: `detectNoOp` に免除集合と上限集合を追加し免除・上限を適用する（D2）

`detectNoOp` を generic なまま保ち、finding が名指しした path を仕事に数える。ただし
`pipelineManagedPaths` は上限として検知器内で減算する。

- [ ] `src/core/step/no-op-detect.ts` の `detectNoOp` の `params` 型に次を追加する（ともに optional）:
  - `findingTargetPaths?: string[]` — 当該 run に routing された findings の worktree 相対 `file` 集合（免除候補）
  - `pipelineManagedPaths?: string[]` — 免除の上限（この集合の path は名指しされても仕事に数えない）
  - JSDoc に「両者とも呼び出し側が算出。`exempt = findingTargetPaths − pipelineManagedPaths`。省略時は
    exempt = ∅ = 現行挙動」を明記する
- [ ] `sourceFiles` 算出（現 `:64-67`）を次に変更する:
  ```
  const managed = new Set(params.pipelineManagedPaths ?? []);
  const exempt = new Set((params.findingTargetPaths ?? []).filter((f) => !managed.has(f)));
  const sourceFiles = changedFiles.filter((f) =>
    exempt.has(f) ? true : !ARTIFACT_PREFIXES.some((prefix) => f.startsWith(prefix)),
  );
  ```
- [ ] 以下は**不変**に保つ:
  - `if (!step.noOpDetect) return undefined;` / `if (params.completionReason !== "success") return undefined;`
  - `sourceFiles.length === 0` 分岐内の `findingsRoutingApproved === true` 抑止と診断ログ
  - `sourceFiles.length > 0` のとき早期 `undefined`（source 変更ありは従来どおり no-op でない）

**Acceptance Criteria**:
- `findingTargetPaths` / `pipelineManagedPaths` 省略時、`detectNoOp` は従来と同一 verdict を返す
- 変更ファイルが `findingTargetPaths` に含まれ（かつ `pipelineManagedPaths` に含まれない）とき、artifact
  prefix 配下でも `sourceFiles` に残り override が起きない
- 変更ファイルが `pipelineManagedPaths` に含まれるとき、`findingTargetPaths` にあっても免除されない
- `findingsRoutingApproved` 抑止・`completionReason` 早期 return・`sourceFiles.length > 0` 早期 undefined が不変
- `bun run typecheck` が green

---

## T-03: executor が免除集合を算出して渡す（D3）

`detectNoOp` の唯一の呼び出し元で、code-fixer に限って免除集合を導出し、上限とともに渡す。

- [ ] `src/core/step/executor.ts` に import を追加する:
  - `import { collectRoutedFixerFindings } from "./routed-findings.js";`
  - `import { pipelineManagedPaths } from "../pipeline/round-git-scope.js";`
- [ ] `executor.ts:471-480` の `detectNoOp` 呼び出しに次の 2 引数を追加する:
  - `findingTargetPaths: step.noOpDetect === true ? collectRoutedFixerFindings(state).map((f) => f.file) : []`
  - `pipelineManagedPaths: pipelineManagedPaths(deps.slug)`
  - `step.noOpDetect === true` ガードにより、非 code-fixer step で routing 導出を走らせない
    （既存 `findingsRoutingApproved` 算出と同じイディオム）
- [ ] 既存の他引数（`headBeforeStep` / `cwd` / `branch` / `completionReason` / `findingsRoutingApproved`）は不変

**Acceptance Criteria**:
- executor が code-fixer step（`noOpDetect === true`）に対してのみ `collectRoutedFixerFindings` を呼ぶ
- 非 code-fixer step では `findingTargetPaths` が空
- `bun run typecheck` が green

---

## T-04: テストの追加（受け入れ基準の固定）

`executor-no-op.test.ts` に免除シナリオを追加する。既存 6 ケースは無変更で green を保つ。

- [ ] `src/core/step/__tests__/executor-no-op.test.ts` に、active reviewer の finding に**任意の
  `file` を指定できる** state 構築ヘルパを追加する（既存 `makeStateWithCodeReview` は `file: "src/foo.ts"` を
  ハードコードしているため、`file` を引数化した variant を追加するか拡張する。StepRun 形は既存の
  `{ attempt, sessionId, startedAt, endedAt, outcome: { verdict, findingsPath, error, toolResult: { ok, findings } } }`
  に準拠）
- [ ] **シナリオ歯（#927 実例）**: code-review latest `needs-fix`（= `findingsRoutingApproved` が `false`）
  で finding が `specrunner/changes/example/implementation-notes.md` を名指し、`listChangedFiles` が
  `["specrunner/changes/example/implementation-notes.md"]` のみ → 記録 verdict が `approved`
  （no-op 発火せず override なし）
  - 補足コメントで「#927 の composed-path（regression-gate）も同じ active-reviewer branch を通る」ことを明記する
- [ ] **finding 名指し外の change folder ファイルのみ**: 同じ finding（implementation-notes.md 名指し）で
  `listChangedFiles` が `["specrunner/changes/example/other-doc.md"]` のみ → 記録 verdict が `needs-fix`
- [ ] **pipelineManagedPaths 名指し**: finding が `specrunner/changes/example/state.json` を名指し、
  `listChangedFiles` が `["specrunner/changes/example/state.json"]` のみ（code-review `needs-fix`）→ 記録
  verdict が `needs-fix`（上限で免除されない）
- [ ] **ソース通常ケース**: finding が `src/foo.ts` を名指し、`listChangedFiles` が `["src/foo.ts"]` →
  記録 verdict が `approved`（免除ロジック導入後も source 変更の通常経路が不変）
- [ ] **conformance 分岐（branch 1）**: conformance が `needs-fix:code-fixer` で finding が
  `specrunner/changes/example/implementation-notes.md` を名指し、`listChangedFiles` が
  `["specrunner/changes/example/implementation-notes.md"]` のみ → 記録 verdict が `approved`
  （`collectRoutedFixerFindings` が branch 1 を通り conformance findings を返す）
  - state 構築: `STEP_NAMES.CONFORMANCE` ステップに `needs-fix:code-fixer` verdict・当該ファイルを指す
    finding・`endedAt` を code-review の `endedAt` より後に設定（`getConformanceFixContext` の recency check
    が通るよう順序を保証）。ステップ構造は既存 Req 4 state と同形。
- [ ] **coordinator-loop 分岐（branch 2）**: custom reviewer が `needs-fix` で finding が
  `specrunner/changes/example/implementation-notes.md` を名指し、`listChangedFiles` が
  `["specrunner/changes/example/implementation-notes.md"]` のみ → 記録 verdict が `approved`
  （`collectRoutedFixerFindings` が branch 2 を通り coordinator findings を返す）
  - state 構築: `state.reviewers` に custom reviewer 1 件を追加、`CUSTOM_REVIEWERS_STEP_NAME`（=
    `"custom-reviewers"`）ステップに `needs-fix` verdict run を追加、当該 custom reviewer ステップに
    `needs-fix` verdict・当該ファイルを指す finding を追加（`isCoordinatorLoopActive` の条件を満たす最小
    構成）。conformance 未起動（conformance runs 空）・regression-gate 未起動（gate runs 空）とする。
- [ ] 既存 6 ケース（no source / artifact only / source changed / noOpDetect false / undefined /
  runtimeStrategy 無し）と Req 1-4 ケースが**無変更で green** であることを確認する

**Acceptance Criteria**:
- 上記 6 つの新シナリオ（active-reviewer 4 件 + conformance 1 件 + coordinator-loop 1 件）がすべて green
- 既存 `executor-no-op.test.ts` の全既存ケースが無変更で green
- `pipelineManagedPaths(deps.slug)` の slug が state の slug（`example`）と一致し、state.json の path
  導出が finding の名指し path と突き合う
- conformance シナリオでは `collectRoutedFixerFindings` が branch 1（conformance）を通ることで
  `getConformanceFixContext` の recency 条件（conformance.endedAt > predecessor.endedAt）が適切に満たされる
- coordinator シナリオでは `collectRoutedFixerFindings` が branch 2（coordinator-loop）を通ることで
  `isCoordinatorLoopActive` の条件（reviewers 非空・coordinator run 済・最新 verdict needs-fix）が適切に満たされる

---

## T-05: 検証（最終確認）

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（新規テスト含む、既存テスト後退なし）
- [ ] `no-op-detect.ts` の `ARTIFACT_PREFIXES` は不変（縮小・置換していない）／`round-git-scope.ts` の
  `pipelineManagedPaths` の列挙は不変であることを確認する
- [ ] `code-fixer.ts` の buildMessage / reads の出力（prose / findingsPath / verdict）に変更が無いことを確認する

**Acceptance Criteria**:
- `typecheck && test` が green
- ARTIFACT_PREFIXES / pipelineManagedPaths の定義に変更が無い（免除は point 免除であり prefix 縮小ではない）
- spec-fixer / build-fixer の `noOpDetect` 設定は不変（code-fixer のみ）
