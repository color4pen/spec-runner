# Tasks: chore type のテスト生成免除

## T-01: TYPE_CONFIG に testGenRequired フラグと isTestGenRequired 参照関数を追加

`src/config/type-config.ts`:

- [ ] `TypeConfigEntry` に `testGenRequired: boolean` を追加し、JSDoc で `specRequired` と同型の
      「false → テスト生成免除（test-case-gen / test-materialize / bite-evidence を通らない）、
      true → テスト生成必須」を記す。
- [ ] `TYPE_CONFIG` の 5 entry に値を設定: chore → `false`、new-feature / spec-change /
      refactoring / bug-fix → `true`。
- [ ] `isTestGenRequired(type: string): boolean` を `isSpecRequired` と同型で追加:
      `return TYPE_CONFIG[type]?.testGenRequired ?? true;`（unknown / 空文字は fail-closed で true）。
      JSDoc に fail-closed の意図を明記する。
- [ ] `tests/config/type-config.test.ts` に本フラグの単体テストを追加（既存 describe に倣う）:
      5 type それぞれの `isTestGenRequired` 値、unknown type と空文字が `true`（fail-closed）を返すこと。

**Acceptance Criteria**:
- `isTestGenRequired("chore") === false`、他 4 既知 type は `true`。
- `isTestGenRequired("unknown-type") === true` かつ `isTestGenRequired("") === true`。
- `TYPE_CONFIG` の全 entry が `testGenRequired` を持ち、`Object.keys(TYPE_CONFIG)` は 5 のまま。
- 既存 type-config テストが無改変で green。

## T-02: テスト生成免除の pipeline predicate を追加

`src/core/pipeline/test-gen-exemption.ts` を新設（spec-observation.ts / reverification.ts と同配置・同スタイル）:

- [ ] `isTestGenExempt(state: JobState): boolean` を追加。実装は
      `!isTestGenRequired(state.request.type)`。`src/config/type-config.js` から `isTestGenRequired` を import。
      副作用・I/O 無しの純関数とする。
- [ ] `specFixerForwardsToImplementer(state: JobState): boolean` を追加。実装は
      `specFixerForwardsToTestGen(state) && isTestGenExempt(state)`。`specFixerForwardsToTestGen` は
      `src/core/pipeline/spec-observation.js` から import して再利用する（ロジックを複製しない）。
- [ ] モジュール冒頭 JSDoc に「types.ts の `when` guard 用 pure predicate、circular import 回避のため
      types.ts を import しない」を記す。

**Acceptance Criteria**:
- `isTestGenExempt` は `state.request.type === "chore"` で `true`、既知非免除 type で `false`、
  未知 type で `false`（`isTestGenRequired` の fail-closed に従う）。
- `specFixerForwardsToImplementer` は `specFixerForwardsToTestGen` が true かつ免除 type のときのみ `true`。
- `typecheck` が green（新モジュールは types.ts を import しない）。

## T-03: STANDARD_TRANSITIONS に免除分岐 row を挿入（非免除 row は無変更）

`src/core/pipeline/types.ts`:

- [ ] T-02 の predicate を import する。
- [ ] `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt` を、既存
      `{ SPEC_REVIEW, approved, SPEC_FIXER, when: specReviewHasRoutableFixables }` の**後**、既存
      `{ SPEC_REVIEW, approved, TEST_CASE_GEN }`（unconditional）の**前**に挿入する。
- [ ] `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer` を、既存
      `{ SPEC_FIXER, approved, TEST_CASE_GEN, when: specFixerForwardsToTestGen }` の**前**に挿入する。
- [ ] `IMPLEMENTER success → VERIFICATION when isTestGenExempt` を、既存
      `{ IMPLEMENTER, success, BITE_EVIDENCE }` の**前**に挿入する。
- [ ] 既存 row（step / on / to / when）は一切変更しない。追加のみ。FAST_TRANSITIONS は変更しない。
- [ ] コメントで各新 row の意図（免除 type の生成工程 bypass、first-match-wins 前提の順序）を短く記す。

**Acceptance Criteria**:
- 新 row 3 本が上記の順序で挿入され、既存 row は文字列一致で不変。
- FAST_TRANSITIONS は無変更。
- 既存 `standard-transitions.test.ts` が無改変で green。

## T-04: changed-line coverage gate を免除 type で明示 skip

`src/core/verification/runner.ts`:

- [ ] `runVerification` に末尾 optional 引数 `requestType?: string` を追加し、
      `runVerificationCommands` / `runVerificationPhases` へ伝播する（両関数にも末尾 optional 引数で追加）。
- [ ] 両関数から `finalizeVerificationRun` へ `requestType` を渡す（`args` に `requestType?: string` を追加）。
- [ ] `finalizeVerificationRun` の coverage 分岐（`if (args.coverage !== undefined)`）で、免除 type
      （`args.requestType !== undefined && !isTestGenRequired(args.requestType)`）のときは gate を実行せず、
      `phase: CHANGED_LINE_COVERAGE_PHASE`, `status: "skipped"`, `exitCode: null` の PhaseResult を push する。
      stdout に免除理由と type 名を残す（例: `_(skipped — test-generation-exempt request type: ${args.requestType})_`）。
      この分岐は既存の `failed` / gate 実行分岐より前に置く。
- [ ] `src/config/type-config.js` から `isTestGenRequired` を import する。
- [ ] `verification.coverage` 未設定パス（既存 `coverageSkipNote`）と package.json-tampered 早期 return は変更しない。

`src/core/step/verification.ts`:

- [ ] `runVerification(deps.slug, verificationCwd, effectiveVerification, deps.request.baseBranch)` の呼び出しに
      第 5 引数として `deps.request.type` を渡す。

**Acceptance Criteria**:
- 免除 type かつ `coverage` 設定ありのとき、結果 phases に `changed-line-coverage` が `status:"skipped"` で含まれ、
  stdout に免除 type 名が含まれる。
- skipped の coverage phase は verdict を fail にしない（他 phase 全 pass なら verdict は passed）。
- 非免除 type では coverage gate が従来通り実行される（`runChangedLineCoverageGate` が呼ばれる）。
- `requestType` 未指定（既存呼び出し）では gate が従来通り実行される（fail-closed）。
- 既存 `tests/unit/verification/runner-commands.test.ts` 等が無改変で green。

## T-05: 受け入れ基準を固定するテストを追加

新規テスト（既存の pipeline / verification テストディレクトリに配置、framework は vitest）:

- [ ] **遷移固定**: request type `chore` の JobState fixture で、STANDARD の transition 解決が
      `SPEC_REVIEW approved → IMPLEMENTER`、`IMPLEMENTER success → VERIFICATION` となり、
      test-case-gen / test-materialize / bite-evidence を通らないことを assert する。
      `SPEC_FIXER approved`（`specFixerForwardsToTestGen` 成立条件）が免除 type で IMPLEMENTER へ向かうことも固定する。
      （transition の解決は `isTestGenExempt` / `specFixerForwardsToImplementer` predicate 経由で検証してよい。）
- [ ] **非免除の無変更**: request type `new-feature` で同じ解決が従来通り
      `SPEC_REVIEW approved → TEST_CASE_GEN`、`IMPLEMENTER success → BITE_EVIDENCE` となることを assert する。
- [ ] **unknown fail-closed**: request type が未知の JobState で `isTestGenExempt` が `false`
      （＝免除されない）ことを assert する。
- [ ] **coverage 明示 skip**: `coverage` 設定ありで免除 type の verification 実行が、
      `changed-line-coverage` phase を `skipped`（免除理由明示）として残し、verdict を fail にしないことを assert する。
      build が失敗している場合でも coverage の skip 理由は `test-generation-exempt request type: chore` のままとなり、
      `previous command failed` にならないことも assert する（D4: 免除チェックは failed チェックより前に評価される）。
- [ ] **既存テスト実行の維持**: 免除 type でも build / typecheck / lint / test に相当する command / phase が
      実行される（結果 phases に現れる）ことを assert する。

**Acceptance Criteria**:
- 上記 5 観点のテストが green。
- 免除・非免除の双方が同一テスト内で対比され、非免除 type の挙動不変が担保される。
- リポジトリ全体で `typecheck && test` が green（既存テストは無改変で green）。
