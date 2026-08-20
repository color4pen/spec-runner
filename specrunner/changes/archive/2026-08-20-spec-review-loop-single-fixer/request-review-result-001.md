# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証

| アサーション | 結果 |
|---|---|
| `canon-write-scope.ts:37-48` — `writableByFixer` map: spec-fixer={spec.md,design.md,tasks.md}、test-case-gen={test-cases.md} | ✓ 確認。test-cases.md は spec-fixer の write scope 外 |
| `canon-escalation.ts:56` — `specReviewEffectiveFixer` 常に "spec-fixer" | ✓ 確認 |
| `canon-escalation.ts:63` — `testCaseGenEffectiveFixer` 常に "test-case-gen" | ✓ 確認 |
| `spec-observation.ts:129` — `specReviewNeedsFixIsTcOnly` 述語 | ✓ 確認。test-case-gen-routable のみの needs-fix を判定 |
| `spec-observation.ts:103` — `specFixerNeedsFixForward` | ✓ 確認。needs-fix 後の spec-fixer → test-case-gen ガード |
| `types.ts:261` — TC-only needs-fix → test-case-gen 直行 transition | ✓ 確認 |
| `types.ts:269` — spec-fixer approved (needs-fix 後) → test-case-gen TC 再生成 transition | ✓ 確認 |
| `types.ts:267` — observation auto-fix spec-fixer → implementer | ✓ 確認 |
| `registry.ts:85-87` — `loopIntermediateSteps: new Set([TEST_CASE_GEN])` | ✓ 確認 |
| `pipeline.ts:99,113,126,523-527` — loopIntermediateSteps 消費点 | ✓ 確認 |
| `spec-fixer.ts writes()` — {design.md, spec.md, tasks.md}、test-cases.md なし | ✓ 確認 |
| `spec-fixer-system.ts write-set` — プロンプトに test-cases.md 不在 | ✓ 確認 |

### 2. 問題背景の妥当性

- `deriveSpecReviewVerdict`（judge-verdict.ts）を読んで step 4b（TC-routable → needs-fix）ロジックを確認した。`testCaseGenEffectiveFixer` が使われている。
- test-case-gen.ts の `buildMessage()` が TC-routable findings を注入するロジックを確認した（"re-generating after a needs-fix round" コメント）。これはループ内 TC 再生成を前提とした設計。
- #1015 の根本原因（test-case-gen が wholesale 再生成するため operator 修正が消える）は構造的に妥当と判断。

### 3. 削除対象の影響分析

削除対象として request に列挙されていない追加的な影響を確認した：

1. **`specFixerNeedsFixForward`（spec-observation.ts:103）**：`spec-fixer → test-case-gen` transition のガードとしてのみ使用。transition 削除後は dead code になる。
2. **`judge-verdict.ts:97` の `testCaseGenEffectiveFixer` 使用**：`deriveSpecReviewVerdict` の step 4b（TCRoutable → needs-fix ロジック）で使用。`testCaseGenEffectiveFixer` 削除時に cascade。
3. **`step-completion.ts:215-218` の dual-resolver**：spec-review の escalationReason 計算で `testCaseGenEffectiveFixer` を使用するデュアルリゾルバー。test-cases.md が spec-fixer の write scope に入ると不要になる。
4. **`test-case-gen.ts:8,92` の `testCaseGenEffectiveFixer` インポート・使用**：ループからの削除後も test-case-gen.ts 自体は残るが、インポートを更新する必要がある（typecheck が強制）。

これらは `bun run typecheck` が cascade を検出して強制修正させるため、実装者がブロックされることはない。

### 4. 既存テストへの影響

- `spec-review-fixer-routing.test.ts:949-982`（TC-013）の一部テストが古い挙動を pin している（test-cases.md → needs-fix via test-case-gen）。変更後は test-cases.md が spec-fixer の write scope に入るため、この期待値は変わる（medium fixable → approved/observation auto-fix）。`bun run test` でこの点が検出される。
- TC-021（spec-review-fixer-routing.test.ts:1254-1305）：テスト自体は変更後も通る可能性が高い（test-cases.md は引き続き routable なため escalationReason に含まれない）が、前提理由が変わる（test-case-gen routable → spec-fixer routable）。

### 5. design → test-case-gen 初回経路の不変確認

- `STANDARD_TRANSITIONS:253-254`：exempt bypass と通常 design → test-case-gen は変更対象外と明記されている。確認した。
- `test-gen-exemption.ts`：isTestGenExempt は design → spec-review bypass（exempt type）に使用されている。変更なし。

## 検証できなかった項目

None。すべてのコードアサーションを Read / Grep で直接確認した。

## Findings 詳細

### F-001: `specFixerNeedsFixForward` の削除が削除リストに未列挙

`spec-observation.ts:103` の `specFixerNeedsFixForward` は、削除対象の `spec-fixer approved → test-case-gen` transition のガードとしてのみ機能しており、transition 削除後は dead code になる。request の「以下を削除する」リストに含まれていない。

実装者が見落とす可能性があるが、`bun run typecheck` は通る（型エラーにならない）ため自動検出されない。手動での削除が必要。軽微な清潔度問題。

### F-002: `deriveSpecReviewVerdict` の簡略化が明示されていない

`judge-verdict.ts` の `deriveSpecReviewVerdict` は `testCaseGenEffectiveFixer`（step 4b: TC-routable → needs-fix ロジック）を使用している。`testCaseGenEffectiveFixer` 削除時に cascade するが、request には `deriveSpecReviewVerdict` の変更が明示されていない。

typecheck でコンパイルエラーが出るため実装者は発見できる。対処方針は明確（step 4b を削除し、test-cases.md を spec-fixer-routable として扱う）。

### F-003: TC-013 の既存テスト更新が明示されていない

`spec-review-fixer-routing.test.ts:949` の TC-013 第2テスト（"test-cases.md routable to test-case-gen → needs-fix"）が古い挙動を pin しており、変更後に `bun run test` で失敗する。request の受け入れ基準には「bun run test green」が含まれているため暗黙的に更新が必要だが、明示されていない。

実装者は test failure で発見できる。対処方針は明確（TC-013 を新しい挙動 = spec-fixer routable + observation auto-fix に更新）。
