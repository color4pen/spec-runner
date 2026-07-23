# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### request.md — 前提コード参照の照合

- `src/core/step/spec-fixer.ts:99-105` `writes()` を実読: 現在は `{design.md, spec.md}` のみを返す。request.md の記述と一致。
- `src/core/step/canon-write-scope.ts:44-52` D5 map を実読: `spec-fixer` entry は `{spec.md, design.md}`。request.md の記述と一致。
- `src/core/step/judge-verdict.ts` の `deriveSpecReviewVerdict` を実読: `selectRoutableCanonFindings` / `selectUnroutableCanonFindings` を `writableByFixer` から導出する data-driven 設計を確認。verdict ロジック自体の変更が不要である点を確認。
- `src/core/step/write-scope.ts:64-73` `protectedCanonPaths` を実読: `tasks.md` が既に保護正典に含まれている（`canonPaths` 側の変更不要）を確認。

### spec.md — シナリオの論理的正確性

- Requirement 1（writes() + D5 map）: `writableByFixer` への tasks.md 追加のみで `selectRoutableCanonFindings` が tasks.md finding を routable に分類する機構を確認。シナリオと実装パスの整合を確認。
- Requirement 2（medium fixable → needs-fix）: `deriveSpecReviewVerdict` の priority 4b は "routable canon fixable ≥ 1 → needs-fix（severity 不問）"。tasks.md が writable set に入れば自動的に 4b に該当することを確認。
- Requirement 3（test-cases.md / request.md の境界維持）: 既存 TC-003・TC-013 test-cases.md sub-test の期待値は escalation のまま保持され、境界は変化しないことを確認。
- Requirement 4（conformance 経路の自動追随）: `conformanceEffectiveFixer` が `finding.fixTarget` を読み同じ `writableByFixer` map を参照するため、D3（自動追随）は設計上正しい。
- Requirement 5（drift-guard）: TC-029 は `writes() ∩ protectedCanonPaths` と `writableByFixer` entry の等価を動的に検証する実装になっており、両方を同時更新すれば自動的に green を維持することを確認。
- Requirement 6（prompt 更新）: spec-fixer.ts line 135 の conformance entry message と spec-fixer-system.ts の write-set section を実読し、両方の更新が必要であることを確認。

### design.md — 設計決定の整合性

- D1: verdict 関数に手を入れないことで境界を data 一点に集約する設計は正しい。
- D2: 4 点同期（writes(), D5 map, TC-029 title, prompt）の列挙を確認。
- D3: conformance 経路の自然な追随は `conformanceEffectiveFixer` の実装と一致。
- D4: spec round は single-fixer 構造（`loopFixerPairs` で spec-review → spec-fixer が固定）であり、専用 fixer 新設が不要であることを確認。
- D5: test 移行の方針（expectations を更新し境界テストを保持）は正しい。
- Risks セクションの記述（TC-029 が skew を検出、TC-019 が境界を保持）も実コードと対応。

### tasks.md — タスク網羅性

- T-01: writes() + D5 map + doc comment 更新。網羅的。
- T-02: conformance entry message（spec-fixer.ts line 135）+ system prompt contract section（spec-fixer-system.ts）の両方。網羅的。
- T-03: makeCanonScope fixture + TC-013 tasks.md sub-test 更新 + test-cases.md escalationReason sub-test の新規追加。網羅的。
- T-04: TC-019 期待値更新 + TC-029 title 更新。網羅的。
- T-05: makeFullCanonScope fixture + TC-006 second sub-test 更新。網羅的。
- T-06: step-io-contracts.test.ts spec-fixer writes() block の tasks.md アサーション追加。網羅的。
- T-07: implementation-notes.md 作成 + gate 実行。網羅的。

### TC-012 パーティション性の保持確認

- TC-012 第 2 sub-test（partition/complement）: makeCanonScope 更新後、tasks.md finding が routable に移動しても `routable + unroutable = canonFixable` が成立することを確認。first sub-test は findings list に TASKS_MD を含まないため直接的には影響なし。

### セキュリティ観点

- 権限拡張対象の tasks.md は `changeFolderPath(deps.slug)` 派生パスで、ユーザー制御コンテンツではない。slug は `state.request.slug` から来るが、これは pipeline 内部で管理され外部入力の直接露出なし。
- workspace tool guard は `scope.declaredWritePaths`（writes() 由来）を参照するため、tasks.md への書込みはパス制限下で実行される。
- tasks.md は `protectedCanonPaths` に既に含まれており、他の step が inadvertent に書込むことを禁止する制約は維持される。
- prompt injection 対策（`<user-request>` XML デリミタ）は既存のまま維持。
- OWASP Top 10 は CLI/pipeline ツールの性質上直接適用外。path traversal については slug 由来パスの形式は変更なし（pre-existing 前提の問題）。

## 検証できなかった項目

- `buildSystemPrompt` が SPEC_FIXER_BASE を正しく組み込むかの動的検証（コード実行が必要）。
- `createWorkspaceToolGuard` における `scope.declaredWritePaths` の参照チェーンの完全追跡（コード実行が必要）。
- `bun run typecheck && bun run test` の実行結果（CI 環境での実行が必要）。

## Findings 詳細

### F-001: tasks.md T-01 が judge-verdict.ts JSDoc コメントの更新を漏らしている

`src/core/step/judge-verdict.ts` lines 67-69 の `deriveSpecReviewVerdict` JSDoc は現在:

```
spec-review routes fixable findings on spec-fixer-writable canon files (spec.md,
design.md) to spec-fixer via "needs-fix", regardless of severity. Fixable findings
on canon files spec-fixer cannot write (request.md, tasks.md, etc.) remain escalation.
```

"cannot write" 例示に `tasks.md` が明示されている。本変更後、tasks.md は spec-fixer-writable になるため、このコメントは事実と矛盾する。将来の開発者が「tasks.md は spec-fixer が書けない」と誤解する原因になる。

tasks.md T-01 の更新対象に "spec-fixer-writable 行に tasks.md を加え、cannot write 例示から tasks.md を削除する" を追加する必要がある。修正後のコメント例:

```
spec-review routes fixable findings on spec-fixer-writable canon files (spec.md,
design.md, tasks.md) to spec-fixer via "needs-fix", regardless of severity. Fixable
findings on canon files spec-fixer cannot write (request.md, test-cases.md, etc.)
remain escalation.
```
