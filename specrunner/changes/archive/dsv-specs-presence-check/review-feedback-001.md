# Code Review: dsv-specs-presence-check

- **reviewer**: claude-sonnet-4-6 (automated)
- **date**: 2026-05-18
- **verdict**: approved

---

## Summary

`delta-spec-validation` に `spec-change`/`new-feature` type の request で `specs/` 配下に `.md` ファイルが存在しない場合に `needs-fix` を返す Step 5 check を追加した変更。設計・実装・テストいずれも request.md の受け入れ基準を充足しており、`bun run typecheck && bun run test` が 170 files / 2036 tests 全 green。Critical/Major 指摘なし。

---

## Acceptance Criteria Checklist

| 受け入れ基準 | 結果 | 根拠 |
|---|---|---|
| `validateDeltaSpecPaths` に Step 5 が **Step 1 の前** に配置されている | PASS | `delta-spec-validator.ts:58-90` — Step 5 ブロックが Step 1 (line 92) より前に配置 |
| `DeltaSpecViolationReason` に `"no-specs-for-required-type"` が追加されている | PASS | `delta-spec-validator.ts:26` |
| type=spec-change/new-feature で specs/ .md 0件 → violations 1件 + `verdict: needs-fix` | PASS | TC-V-11/12 が green |
| type=bug-fix/refactoring では specs/ 不在でも approved | PASS | TC-V-13/14 が green |
| specs/ に .md 1件以上 → 既存 Step 1-4 継続 | PASS | TC-V-15 が green |
| findings format が既存 (path/reason/suggested) と同 schema | PASS | `delta-spec-validator.ts:83-87` で同 schema の violation オブジェクトを push |
| dsv step が Step 5 fail で delta-spec-fixer に遷移する経路 | PASS | 既存 `needs-fix` 経路に乗る。TC-DSV-04 で result file に `needs-fix` が書かれることを確認 |
| 新規 unit test 5件 + integration test 1件 pass | PASS | TC-V-11〜15 (5件) + TC-DSV-04 (1件) 全 green |
| PR #282 同型 reproduction scenario が dsv で catch | PARTIAL | 受け入れ基準 §6 は「任意」扱い。専用 pipeline integration test は未追加（後述 info 指摘） |
| `bun run typecheck && bun run test` が green | PASS | typecheck: clean / test: 2036 passed |
| spec authority に Step 5 の Requirement が反映 | PASS | `specrunner/changes/dsv-specs-presence-check/specs/pipeline-orchestrator/spec.md` に ADDED Requirements + 4 Scenario |
| 既存 dsv test (path/format) が regression していない | PASS | TC-V-01〜10 全 green |

---

## Findings

### [info] TC-DSV-05 が未実装 (test-cases.md に listed だが test ファイルに存在しない)

- **severity**: info
- **location**: `tests/unit/step/delta-spec-validation.test.ts`
- **description**: `test-cases.md` の TC-DSV-05 は「dsv step が `deps.request.type` を `validateDeltaSpecPaths` の第 3 引数として渡すことを assert する」テストとして定義されているが、実装された `delta-spec-validation.test.ts` にこの TC は存在しない。`validateDeltaSpecPaths` の mock 呼び出し引数を `toHaveBeenCalledWith(..., "spec-change")` 等で検証するアサーションがない。
- **suggestion**: `vi.fn()` を使うと `mockValidate.mock.calls[0][2]` で第 3 引数を取得できる。TC-DSV-04 に 1 行追加するか独立 TC として追加する。ただし受け入れ基準には「新規 unit test 5 件 + integration test 1 件」とのみ記載があり、TC-DSV-05 は受け入れ基準の必須 6 件に含まれないため blocking ではない。

### [info] TC-REPRO-01 (PR #282 reproduction) が未実装

- **severity**: info
- **location**: `tests/` 配下
- **description**: request.md 要件 6 は `tests/pipeline-integration.test.ts` 等に PR #282 と同型の reproduction test を追加することを「任意」としている。test-cases.md の TC-REPRO-01 priority は `should`。本変更では実装されていない。
- **suggestion**: 後続 dogfood で regression を防ぎたい場合は別 PR/issue で対応。blocking ではない。

### [info] delta spec の配置が `specrunner/changes/.../specs/` (change folder 内) であり `specrunner/specs/` (authority) は未更新

- **severity**: info
- **location**: `specrunner/specs/pipeline-orchestrator/spec.md` (authority)、`specrunner/changes/dsv-specs-presence-check/specs/pipeline-orchestrator/spec.md` (delta spec)
- **description**: request.md 要件 5 は「`specrunner/specs/<capability>/spec.md` を MODIFIED で更新」と記載しているが、実装では authority ファイルへの直接書き込みをせず、change folder 内の delta spec に ADDED Requirements を書く形式を選択している。これは本プロジェクトの spec-merge ワークフロー (delta spec → authority merge) と整合的な正しい手順であり、authority を直接変更しない判断は正しい。ただし finish (spec-merge) 後まで authority には反映されない点を確認済み。
- **suggestion**: 問題なし。finish 時に spec-merge で authority に取り込まれる。

### [info] `DeltaSpecViolationReason` の JSDoc コメントに新メンバーの説明が未追加

- **severity**: info
- **location**: `src/core/spec/delta-spec-validator.ts:11-19` (JSDoc block)
- **description**: `DeltaSpecViolationReason` の JSDoc には既存 5 reason の説明が列挙されているが、`no-specs-for-required-type` の説明行が追加されていない。tasks.md Task 2c では `@param requestType` の JSDoc 追加のみ記載されており、reason の JSDoc 更新は tasks.md スコープ外。機能的影響はなく minor cosmetic。
- **suggestion**: `- no-specs-for-required-type: type=spec-change or new-feature with no .md files in specs/` を JSDoc に追加すると完結する。

---

## Positive Observations

- **Step 5 の配置判断が正確**: design.md §2 が指摘する「Step 3 の early return で Step 5 が到達不能になる」問題を正しく理解し、Step 1 の前に配置した。
- **後方互換の保持**: `requestType` を optional にすることで既存テスト (TC-V-01〜10) を全て引数変更なしで通過させている。
- **DI パターンの一貫性**: Step 5 の specs/ スキャンも `deps.readdir` を使用し、テスト可能な純粋関数として実装。`makeFsMock` を再利用している。
- **fixer prompt の hint 追加**: `buildDeltaSpecFixerInitialMessage` のステップ番号を 3→4→5→6 に繰り下げながら、新 step 3 を正しい位置に挿入。既存手順との競合なし。
- **violation schema 準拠**: `path` / `reason` / `suggested` の 3 フィールドが正しく設定され、`formatViolationsTable` がそのままレンダリングできる。
- **TYPES_REQUIRING_SPECS 定数をモジュールスコープに定義**: 関数スコープではなくモジュールトップレベルに定義しており、将来の type 追加が容易。

---

## Verdict

- **verdict**: approved

全受け入れ基準を充足。Critical/Major 指摘なし。Info 指摘 4 件はいずれも blocking なし。`bun run typecheck && bun run test` が clean に通過している。
