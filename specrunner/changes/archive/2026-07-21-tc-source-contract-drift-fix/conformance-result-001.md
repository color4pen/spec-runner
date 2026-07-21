# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | yes | T-01〜T-05 全チェックボックス [x] 完了 |
| design.md | yes | D1〜D3 すべて実装通り（leaf module 新規作成、定数 1 本化、テスト新規ファイル） |
| spec.md | yes | R1〜R3 全 Scenario が充足されていることを実装・テスト・verification 結果で確認 |
| request.md | yes | 受け入れ基準 4 件すべて green（旧形式排除 / 単一ソース化 / 回帰テスト green / typecheck+test green） |

---

## 詳細

### tasks.md（全 [x] 完了）

- T-01: `src/prompts/tc-source-contract.ts` 新規作成、`TC_SOURCE_SCENARIO_FORMAT` named export、JSDoc 記載、project-internal import なし ✓
- T-02: `test-case-gen-system.ts` に import 追加、hardcoded 文字列をテンプレートリテラル参照に置換 ✓
- T-03: `test-materialize-system.ts` に import 追加、旧形式 → 現行形式に修正 ✓
- T-04: `implementer-system.ts` に import 追加、旧形式 → 現行形式に修正 ✓
- T-05: `src/prompts/__tests__/tc-source-contract.test.ts` 新規作成、TC-001〜TC-007 全アサート green ✓

### design.md（D1〜D3）

- **D1**: `tc-source-contract.ts` は project-internal import なしの leaf module として実装されており、3 prompt が `import { TC_SOURCE_SCENARIO_FORMAT } from "./tc-source-contract.js"` で参照している。`judge-rules.ts` と同型パターン。依存方向の新設なし。
- **D2**: named export は `TC_SOURCE_SCENARIO_FORMAT` 1 定数のみ。consumer 側の Read 手順文言は各 prompt が独自記述（不必要な結合を避けた設計通り）。
- **D3**: 既存 `fragment-coverage.test.ts` を改変せず、新規ファイル `tc-source-contract.test.ts` に追加。

### spec.md（R1〜R3）

- **R1 Scenario**: `TC_SOURCE_SCENARIO_FORMAT` = `"spec.md > Requirement: <name> > Scenario: <name>"` ✓ `specs/` を含まない ✓
- **R2 Scenario × 3**: test-case-gen / test-materialize / implementer の各 system prompt に正準形式が含まれる（テスト TC-002〜TC-004 で機械的に保証）✓
- **R3 Scenario × 2**: test-materialize / implementer のプロンプトに `specs/<capability>/spec.md` が存在しない（grep 0 件、テスト TC-005〜TC-006 で機械的に保証）✓

### request.md（受け入れ基準 4 件）

1. **旧形式排除（grep 0 件）**: consumer 2 prompt に旧形式判別記述なし ✓
2. **単一ソース化**: 3 prompt が同一定数ファイルから import ✓
3. **回帰テスト green**: verification-result.md — 566 test files / 7809 tests passed ✓
4. **typecheck + test green**: build / typecheck / test / lint / coverage すべて passed ✓

### スコープ逸脱の確認

変更範囲は `src/prompts/` 配下の 4 ファイル（3 既存 + 1 新規）と `src/prompts/__tests__/` の 1 新規テスト、および `tests/prompts/implementer-system.test.ts` の 1 ファイルに限定されている。

`tests/prompts/implementer-system.test.ts` の TC-007 assertion が `specs/<capability>/spec.md` → `specrunner/changes/<slug>/spec.md` に修正されているが、変更前の assertion は今回修正した drift bug をアサートしていたもの（誤ったテスト）であり、正しい仕様に合わせた修正として許容される。code-review で info/no-fix と判定済み。

スコープ外（prompt 骨格再設計、過去 archive 修正、機械 parse 機能追加）への逸脱なし。
