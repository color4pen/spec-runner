# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### ファイル・Diff の確認

- `git diff main...HEAD --stat` で変更ファイルを把握（16 ファイル、3400 行追加、15 行削除）
- ソースコード変更対象: `src/core/step/fixer-helpers.ts`, `src/core/step/code-fixer.ts`, `src/core/step/spec-fixer.ts`, `src/core/step/__tests__/fixer-push-capability.test.ts`
- 参考実装: `src/core/step/implementer.ts` L259-277（contract 宣言）、L280-344（notice 注入）

### T-01: `buildUnpushablePathContracts` in `fixer-helpers.ts`

- `import type { OutputContract }` と `import type { StepDeps }` の追加を確認（L15-16）
- 関数本体が `implementer.ts` L269-276 のパターンを正確にミラーしていることを確認:
  - `!deps.pushCapability || deps.pushCapability.patterns.length === 0` → `[]` を返す
  - patterns あり → `kind: "unpushable-path"`, `path: ""` (sentinel), `policy: "follow-up"`, `patterns` を返す
- コメントで「sentinel — path is not used for unpushable-path contracts」を明記している

### T-02: `code-fixer.ts` の変更

- `outputContracts(_state, deps)` メソッドが `buildUnpushablePathContracts(deps)` を返すことを確認（L84-86）
- `buildMessage` の冒頭で `capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` を1回計算（L129）
- **8 つの return サイト全てに `+ capabilityNotice` が付加されていることを確認**:
  1. conformance branch, continuation: L138-145 ✓
  2. conformance branch, initial: L147-165 ✓
  3. coordinator loop, continuation: L175-187 ✓
  4. coordinator loop, aggregated-findings initial: L189-207 ✓
  5. coordinator loop, fallback (needsFixMembers.length > 0): L210-233 ✓
  6. normal branch, continuation: L256-264 ✓
  7. normal branch, initial with findings: L267-285 ✓
  8. normal branch, findingsPath fallback: L288-304 ✓
- coordinator loop `needsFixMembers.length === 0` の場合は coordinator ブロックを抜け、normal branch にフォールスルー（そこでも `+ capabilityNotice`）。全 path で notice が付与される。

### T-03: `spec-fixer.ts` の変更

- `outputContracts(_state, deps)` メソッドが `buildUnpushablePathContracts(deps)` を返すことを確認（L87-89）
- `buildMessage` の冒頭で `capabilityNotice` を1回計算（L119）
- **5 つの return サイト全てに `+ capabilityNotice` が付加されていることを確認**:
  1. conformance branch, continuation: L125-132 ✓
  2. conformance branch, initial: L134-153 ✓
  3. normal branch, continuation: L163-169 ✓
  4. normal branch, initial with findings: L172-191 ✓
  5. normal branch, findingsPath fallback: L193-198 ✓

### T-04: テスト (`fixer-push-capability.test.ts`)

- 25 tests 全通過（verification-result.md で確認）
- カバレッジ内訳:
  - `buildUnpushablePathContracts` helper: 4 tests（TC-012/013/014/014-patterns）
  - `CodeFixerStep.outputContracts`: 2 tests（TC-004/005）
  - `CodeFixerStep.buildMessage` notice: 4 tests（TC-001/002/003 + 002 no-notice）
  - `CodeFixerStep.buildMessage` conformance branch: 2 tests（TC-016 + no-notice）
  - `CodeFixerStep.buildMessage` coordinator branch: 2 tests（TC-017 + no-notice）
  - `SpecFixerStep.outputContracts`: 2 tests（TC-010/011）
  - `SpecFixerStep.buildMessage` notice: 5 tests（TC-006/007/008/009/009-fallback）
  - `SpecFixerStep.buildMessage` conformance branch: 4 tests（TC-022/023 + no-notice variants）
- tasks.md T-04 が要求する最小 18 tests を超える 25 tests が実装されている
- `WORKFLOW_CAPABILITY` / `makeJobState` / `makeStepDeps` fixture が適切に構成されている

### T-05: 既存テスト・typecheck・インフラ不変条件

- `git diff main -- src/core/step/implementer.ts src/core/step/request-review.ts src/core/step/step-context-builder.ts src/core/step/output-verify.ts` → 差分なし（TC-020/TC-021 充足）
- verification-result.md で全 phase 通過を確認:
  - build: passed (exit 0)
  - typecheck: passed (exit 0, `tsc --noEmit` 無出力)
  - test: passed (exit 0)
  - lint: passed (exit 0, `eslint` 無出力)
  - changed-line-coverage: passed (3 ソースファイル分のカバレッジ充足)
- `src/git/push-capability.ts` の `renderPushCapabilityNotice` が `"## Push Capability Notice"` を出力することを確認（L213）

### TC-015（integration）の充足状況

TC-015「code-fixer Layer 2 backstop fires after follow-up fails to resolve unpushable-path violation」は `fixer-push-capability.test.ts` に実装されていない。ただし:

- Layer 2 backstop（`UNPUSHABLE_PATH_BLOCKED`）は `commit-scoped-paths.test.ts` が包括的にテスト済み（`commitScopedPaths` がワークフローパスで例外を投げることを複数パターンで確認）
- Layer 1 の 1-follow-up invariant は `step-context-builder.ts`（unchanged）が全 step に均一に適用するインフラで担保されている
- `implementer.ts` でも同等の integration test は存在しない（`implementer-materialize.test.ts` に `outputContracts` のテストなし）— 既存の gap と一致
- TC-004/TC-010 の `outputContracts` 宣言テストにより、infrastructure が code-fixer/spec-fixer に対しても Layer 1 → Layer 2 を適用する条件は充足されている

## 検証できなかった項目

- **TC-015 の "code-fixer → Layer 1 follow-up → Layer 2 halt" end-to-end chain**: step-context-builder と output-verify を結合したフルチェーンは unit test ではカバーされていない（medium finding として報告）

## Findings 詳細

### F-001: TC-015（must）が未実装

test-cases.md で「must」に分類された TC-015（integration）が `fixer-push-capability.test.ts` に存在しない。

**補足**:
- TC-015 がカバーする動作（Layer 2 backstop が UNPUSHABLE_PATH_BLOCKED を投げ job が awaiting-resume になること）自体は、既存の `commit-scoped-paths.test.ts` によって確認されている
- `code-fixer.outputContracts` が正しく `policy: "follow-up"` の contract を宣言することは TC-004 で確認されており、infrastructure が正しくこれを拾うことの保証は step-context-builder（unchanged）の設計に依存している
- 同等のテストは `implementer.ts` にも存在せず、codebase 全体での gap と一致するため新規 regression ではない
- 修正案: `output-verify.ts` の `buildAllOutputContracts` + `checkOutputContracts` を `CodeFixerStep.outputContracts` で宣言された contract と組み合わせる unit test、または `commitScopedPaths` をモックした code-fixer 向け integration test を追加する
