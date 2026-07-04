# Tasks: approved 経路の code-fixer no-op を escalate しない

<!-- 実装対象ファイル一覧（参照用）
- src/core/pipeline/reviewer-chain.ts        — D1: codeReviewFindingsRoutingActive 追加
- src/core/step/no-op-detect.ts              — D2: findingsRoutingApproved param 追加・override 抑止
- src/core/step/executor.ts                  — D2: 呼び出し側でフラグ算出して渡す（reviewer-chain import）
- src/core/pipeline/__tests__/reviewer-chain.test.ts  — T-03: predicate 単体テスト
- src/core/step/__tests__/executor-no-op.test.ts      — T-03: executor 統合テスト
-->

---

## T-01: `codeReviewFindingsRoutingActive` 純粋関数を reviewer-chain.ts に追加する（D1）

code-fixer の起動が「code-review の findings-routing（approved + fixable）」由来かを判定する純粋関数を
追加する。既存の `conformanceFixInProgress` / `regressionGateActive` / `codeReviewLoopActive` と同じ
predicate 群に属する。

- [ ] `src/core/pipeline/reviewer-chain.ts` に `export function codeReviewFindingsRoutingActive(state: JobState): boolean` を追加する
  - 判定は次の 3 条件の AND（すべて満たすときのみ `true`）:
    1. `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) === null`（= conformance 由来でない。
       既存 `conformanceFixInProgress(state)` を再利用しても可）
    2. `state.steps["code-review"]` の latest run が存在し、`outcome.verdict === "approved"` かつ
       `collectFixableFindings(latest.outcome.toolResult?.findings ?? []).length > 0`
    3. `resolveActiveReviewer(state, deriveImplFixerChain(state)) === STEP_NAMES.CODE_REVIEW`
  - 使用する既存シンボルはすべて同ファイル内 or import 済み（`STEP_NAMES`, `collectFixableFindings`,
    `getConformanceFixContext`, `resolveActiveReviewer`, `deriveImplFixerChain`）。新規 import 不要
  - findings 抽出は既存の `regressionGateActive`（`reviewer-chain.ts:258-263`）と同じ形
    （`last.outcome.toolResult as { findings?: Finding[] } | null | undefined` → `?.findings ?? []`）に揃える
  - JSDoc に「消費者は executor の no-op 除外判定」「3 条件の理由（特に条件 1・3 が conformance /
    coordinator / regression-gate の真の空振りを除外する）」を明記する
- [ ] 既存の `deriveJudgeVerdict` / routing 遷移生成関数（`buildReviewerChainTransitions` 等）は変更しない

**Acceptance Criteria**:
- `codeReviewFindingsRoutingActive` が純粋関数（副作用・I/O なし）である
- code-review latest `approved` + fixable(low) かつ他 reviewer/conformance 実行なし → `true`
- code-review latest `approved` + fixable なし → `false`
- code-review latest `needs-fix` → `false`
- conformance latest `needs-fix:code-fixer`（code-review より新しい）+ code-review approved+fixable → `false`
- regression-gate が code-review より後に実行され active → `false`
- 型チェックが通る

---

## T-02: `detectNoOp` に `findingsRoutingApproved` を追加し override を抑止する（D2）

`detectNoOp` を generic なまま保ち、source 変更ゼロかつ approved findings-routing のときは override
しないようにする。

- [ ] `src/core/step/no-op-detect.ts` の `detectNoOp` の `params` 型に
  `findingsRoutingApproved?: boolean` を追加する（optional、省略時は `false` 相当 = #734 の既存挙動）
  - JSDoc に「呼び出し側が算出する。true のとき source 無変更でも override を抑止する（approved
    findings-routing 経路の legitimate な no-op）」を明記する
- [ ] `sourceFiles.length === 0` の分岐（現 `:58-61`）を次のように変更する:
  - `params.findingsRoutingApproved === true` のとき → `undefined` を返し、
    `stderrWrite(\`[${step.name}] no-op in approved findings-routing path — no mandatory findings, not escalating\`)` を出す
  - それ以外 → 従来どおり `"needs-fix"` を返し、既存の
    `\`[${step.name}] no-op detected: no source files changed — overriding verdict to needs-fix\`` を出す
  - `sourceFiles.length > 0`（source 変更あり）の経路は変更しない（早期に `undefined` を返す現挙動を維持）
- [ ] `src/core/step/executor.ts:551-559` の `detectNoOp` 呼び出しに
  `findingsRoutingApproved: step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false` を追加する
  - `src/core/step/executor.ts` に `import { codeReviewFindingsRoutingActive } from "../pipeline/reviewer-chain.js";` を追加する
  - `step.noOpDetect === true` ガードにより、非 code-fixer step で reviewer-chain ロジックを走らせない

**Acceptance Criteria**:
- `detectNoOp` は `findingsRoutingApproved` 省略時に #734 の挙動（source 無変更 → `"needs-fix"`）を保つ
- `findingsRoutingApproved: true` かつ source 無変更 → `undefined`（override 抑止）
- source 変更ありの経路は挙動不変（`undefined`）
- executor が code-fixer step に対してのみフラグを算出する
- 型チェックが通る

---

## T-03: テストの追加（要件 1-4 の固定）

predicate の単体テストと、executor 統合テスト（no-op override 抑止／維持）を追加する。

- [ ] `src/core/pipeline/__tests__/reviewer-chain.test.ts` に `codeReviewFindingsRoutingActive` の
  `describe` ブロックを追加する（既存 `regressionGateActive` の describe と同じ state 構築イディオムを使う）
  - `approved` + fixable(low) + 他 reviewer/conformance なし → `true`
  - `approved` + fixable なし（`findings: []`）→ `false`
  - `needs-fix` → `false`
  - conformance latest `needs-fix:code-fixer`（`endedAt` が code-review より新しい）+ code-review
    approved+fixable → `false`
  - regression-gate が code-review より後に実行（`startedAt`/`endedAt` が新しい）→ active が
    regression-gate → `false`
- [ ] `src/core/step/__tests__/executor-no-op.test.ts` に、reviewer 履歴を持つ state を構築するテストを追加する
  - 既存 `makeState()` を拡張するか、`steps["code-review"]` を注入するヘルパ（例:
    `makeStateWithCodeReview({ verdict, findings })`）を追加する。StepRun は
    `{ attempt, sessionId, startedAt, endedAt, outcome: { verdict, findingsPath, error, toolResult: { ok, findings } } }`
    形（既存 reviewer-chain.test.ts の cast イディオムに準拠、必要なら `as unknown as JobState["steps"]`）
  - **要件 1**: code-review latest `approved` + fixable(low)、`listChangedFiles` が artifact のみ →
    code-fixer の記録 verdict が `approved`（override されない）
  - **要件 2（#734 回帰防止）**: code-review latest `needs-fix`、`listChangedFiles` が変更ゼロ →
    記録 verdict が `needs-fix`（override される）
  - **要件 3**: code-review latest `approved` + fixable、`listChangedFiles` が `src/foo.ts` を含む →
    記録 verdict が `approved`（既存の「source files changed → approved」テストの延長で確認）
  - **要件 4（conformance 不変）**: conformance latest `needs-fix:code-fixer`（code-review より新しい）
    + code-review approved+fixable、`listChangedFiles` が変更ゼロ → 記録 verdict が `needs-fix`
    （conformance の真の空振りは escalate）
- [ ] 既存の `executor-no-op.test.ts` の 6 ケース（override / non-override / noOpDetect false/undefined /
  runtimeStrategy 無し）が**無変更で green** であることを確認する（これらは code-review 履歴なし →
  `codeReviewFindingsRoutingActive` が `false` → #734 挙動を維持）

**Acceptance Criteria**:
- 上記 predicate テスト・executor テストがすべて green
- 既存 `executor-no-op.test.ts` の 6 ケースが無変更で green
- 既存 `reviewer-chain.test.ts` が無変更で green

---

## T-04: 検証（最終確認）

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（新規テスト含む、既存テスト後退なし）
- [ ] `tests/pipeline-integration.test.ts` / `tests/custom-reviewers-e2e.test.ts` を含む
  integration / e2e が後退なし（conformance / regression-gate / coordinator no-op 挙動不変を確認）

**Acceptance Criteria**:
- `typecheck && test` が green
- 遷移表（`reviewer-chain.ts` の transition 生成、`types.ts` の STANDARD/FAST_TRANSITIONS）に変更が無い
  こと（本 request は no-op override の抑止のみで routing 行は追加しない）
