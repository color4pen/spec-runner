# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### attempt 1 → 2 の変化確認

前回 (attempt 1) の F-001「T-01 が judge-verdict.ts JSDoc の tasks.md 言及更新を漏らしている」について、
operator が tasks.md に fix を適用した結果を確認した。

現在の tasks.md T-01 は以下の bullet を含む:
- `src/core/step/judge-verdict.ts` の `deriveSpecReviewVerdict` JSDoc 更新（"cannot write" 例示から tasks.md を削除し、spec-fixer-writable files に tasks.md を追加）— comment-only 変更

この bullet は attempt 1 時点では存在しなかった。operator 適用により F-001 は解消済みと確認した。

### request.md — 前提コード参照の照合

- `src/core/step/spec-fixer.ts:99-105` `writes()` を実読: `{design.md, spec.md}` のみを返す（pre-change 状態）。request.md の記述と一致。
- `src/core/step/canon-write-scope.ts:44-52` D5 map を実読: `spec-fixer` entry は `{spec.md, design.md}`（pre-change 状態）。request.md の記述と一致。
- `src/core/step/judge-verdict.ts:62-83` `deriveSpecReviewVerdict` JSDoc を実読: line 67-68 に "cannot write (request.md, tasks.md, etc.)" の記述が存在することを確認。T-01 の更新対象として正しく識別されている。
- `src/core/step/write-scope.ts:64-73` `protectedCanonPaths` を実読: tasks.md が既に `canonPaths` に含まれている（T-01 で変更不要な部分）を確認。

### spec.md — シナリオの論理的正確性

- **Requirement: spec-fixer SHALL declare tasks.md in its canon write-set**: `writes()` 拡張 → D5 map 拡張の 2 点同期で `selectRoutableCanonFindings` が tasks.md finding を routable に分類する機構を確認。T-01 がその 2 点 + JSDoc + canon-write-scope.ts doc comments をすべてカバーしていることを確認。
- **Requirement: spec-review SHALL route fixable tasks.md findings to spec-fixer**: `deriveSpecReviewVerdict` の priority 4b "routable canon fixable ≥ 1 → needs-fix（severity 不問）"。tasks.md が writable set に入れば自動的に 4b に該当する data-driven 設計を確認。T-03 が TC-013 first sub-test を `escalation` → `needs-fix` に更新することを確認。
- **Requirement: spec-review SHALL keep escalating fixable findings on canon files spec-fixer cannot write**: test-cases.md / request.md の escalation 経路が変化しないことを確認。T-03 が test-cases.md sub-test を `escalation` のまま保持し、escalationReason 付きの新サブテストを追加することを確認。
- **Requirement: conformance routing SHALL follow the expanded write-set**: `conformanceEffectiveFixer` が同じ `writableByFixer` map を参照するため、tasks.md + fixTarget:spec-fixer → `needs-fix:spec-fixer` に自動追随する設計を確認。T-05 が TC-006 second sub-test を更新することを確認。
- **Requirement: write-set declaration SHALL remain drift-guarded**: TC-029 が `writes() ∩ protectedCanonPaths` と D5 map の一致を動的に検証する実装を確認（line 284-293: 固定値でなく動的比較）。writes() と D5 map の両方を T-01 で同時更新すれば TC-029 は自動 green を維持する。T-04 が TC-029 descriptive title のみを更新することを確認。
- **Requirement: spec-fixer prompt SHALL name tasks.md**: `spec-fixer.ts` line 135 の conformance-entry message "fix the spec.md or design.md artifact" と `spec-fixer-system.ts` の write-set contract section を実読し、T-02 の 2 箇所更新が正しくカバーしていることを確認。

### design.md — 設計決定の整合性

- D1（write-set data のみ変更）: `deriveSpecReviewVerdict` 本体・effective-fixer resolvers・transition table を変更しないことを確認。verdict 関数は書込集合から純粋に導出する data-driven 設計を実読で確認。
- D2（4 点同期 + prompt）: T-01 が writes() / D5 map / doc comments / JSDoc を、T-02 が prompt を更新することを確認。D2 の "4 synchronization points" は behavioral な宣言点（writes(), D5 map, drift-guard, prompt）を指し、JSDoc は実装ディテールとして T-01 に委譲されていることを確認。
- D3（conformance path の自動追随）: `conformanceEffectiveFixer` が `findBestFixer(finding.fixTarget, scope.writableByFixer)` 経由で同一 map を参照するため、D5 map 拡張だけで `fixTarget:spec-fixer` 経路が自動的に `needs-fix:spec-fixer` に変わることを確認。T-05 が意図的に更新されていることを確認。
- D4（tasks.md 専用 fixer 新設を却下）: spec round は `loopFixerPairs` で spec-review → spec-fixer が固定であることを確認。
- D5（既存テスト migrated, 境界テスト保持）: T-04 が TC-019 / TC-029 を、T-03 が TC-013 を移行し、T-03 が test-cases.md escalation sub-test を保持することを確認。

### tasks.md — タスク網羅性と要件対応

- **T-01**: writes() 拡張 + D5 map 拡張 + canon-write-scope.ts doc comments 更新 + judge-verdict.ts JSDoc 更新。4 点すべてをカバー。attempt 1 で指摘した JSDoc 更新が追加済み。
- **T-02**: conformance-entry message (spec-fixer.ts line 135) + system prompt contract (spec-fixer-system.ts write-set section) の両方。"normal entry" は system prompt が適用されるため、両者の更新で request.md の受け入れ基準「conformance entry / normal entry の両方」を満たす。deferred-comment guidance は変更しない旨が明示されており、design.md の deferred-comment が `design.md` を指している意図との整合を確認。
- **T-03**: makeCanonScope fixture 更新 + TC-013 first sub-test 更新 + test-cases.md escalationReason sub-test 新規追加 + TC-012 partition 確認。spec.md の全境界シナリオをカバー。
- **T-04**: TC-019 期待値更新（tasks.md を INCLUDES に変更、request.md / test-cases.md は EXCLUDES 維持）+ TC-029 title 更新（body は dynamic のため変更不要）。
- **T-05**: makeFullCanonScope fixture 更新 + TC-006 second sub-test (fixTarget:spec-fixer → needs-fix:spec-fixer) 更新。TC-006 first sub-test (fixTarget:code-fixer → escalation) は変更しないことを確認。
- **T-06**: step-io-contracts.test.ts の spec-fixer writes() ブロックに tasks.md アサーションを追加。
- **T-07**: implementation-notes.md 作成 + typecheck && test gate。

### セキュリティ観点

- tasks.md のパスは `changeFolderPath(deps.slug)` 派生で固定パターン。外部入力の直接露出なし。
- `createWorkspaceToolGuard` は `scope.declaredWritePaths`（writes() 由来）でエージェントの書込先を制限する設計を確認。tasks.md を追加しても制限機構は維持される。
- tasks.md は既に `protectedCanonPaths` に含まれており、他の step による inadvertent 書込を禁止する制約は変化なし（T-01 で canonPaths 側の変更は不要）。
- prompt injection 対策（`<user-request>` XML デリミタ）は既存のまま維持。
- OWASP Top 10 は CLI/pipeline ツールの性質上直接適用外。slug 由来パスの path traversal リスクは pre-existing で本変更の影響なし。

## 検証できなかった項目

- `bun run typecheck && bun run test` の実行結果（CI 環境での実行が必要; T-07 の gate 実行で確認される）。
- `createWorkspaceToolGuard` における `scope.declaredWritePaths` の参照チェーンの完全追跡（コード実行が必要）。

## Findings 詳細

None.
