# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ❌ | 全 15 タスクのチェックボックスが `[ ]` のまま（rules.md: implementer は checkbox 更新義務あり） |
| design.md | ✅ | D1〜D11 すべて実装済み。フィールド名の flat 化は意味的に同等 |
| spec.md | ✅ | 全 Requirement 実装済み。`--from` 制限は `resolveResumeStep` の標準 step 集合チェックで自然に充足 |
| request.md | ❌ | 受け入れ基準 #1 の「mock でテスト」（T-14 E2E mock pipeline）未実装。受け入れ基準 #7 の resume snapshot テストも未実装 |

---

## Scope

`git diff main...HEAD --stat`: 44 files, +5118 / -66 lines。  
`bun run typecheck && bun run test`: typecheck clean、339 test files / 4290 tests — all green。

---

## F1: tasks.md — 全チェックボックス未更新

`tasks.md` の全 15 タスク（T-01 〜 T-15）がすべて `[ ]` のまま。  
`rules.md` は implementer の touch 可能範囲に `tasks.md (checkbox 更新)` を明記している。

**Fix**: 実装済みの各タスクを `[x]` に更新する。

---

## F2: T-14（E2E mock pipeline テスト）未実装

tasks.md T-14 が未実装。受け入れ基準 #1 は「(mock でテスト)」を明示しており、  
T-14 は `tests/helpers/pipeline-mock-client.ts` ベースの統合テストを要求している。

**未カバーのシナリオ**:

1. **受け入れ #1**: 単一 custom reviewer が code-review の後に実行され、  
   findings 契約（CLI 導出 / 実在検証 / fixer ループ / escalation）が組み込み judge と同一に機能することを  
   pipeline mock で end-to-end に確認するテストがない。  
   `custom-reviewer-step.test.ts` で `reportTool === JUDGE_REPORT_TOOL` identity は確認済みだが、  
   executor → pipeline の統合フローは未カバー。

2. **受け入れ #7 / spec Scenario「resume は snapshot を使う」**:  
   job start 時の snapshot 後にディスクの定義ファイルを変更し、  
   resume しても旧 snapshot が使われることを確認するテストがない。  
   コードは正しい（`buildPipelineForJob` が `state.reviewers` を読む）が不変条件テストが欠落。

**Fix**: T-14 の mock pipeline テストを追加する。最低限カバーすべきシナリオ:
- single reviewer: code-review approved → custom reviewer 実行 → approved → conformance
- single reviewer: custom reviewer needs-fix → code-fixer → custom reviewer（code-review ではない）
- resume: snapshot を書いてディスクの定義を変更してから resume → 旧 snapshot が使われる

---

## 設計決定の実装確認（D1〜D11）

| 決定 | 実装 | 備考 |
|------|------|------|
| D1: 型とパーサ | ✅ | フィールド名は design 提案（`sections.perspective`）から flat 化（`criteria`/`judgment`）に変更。意味的には同等 |
| D2: CLI 所有フレーム + スロット注入 | ✅ | `buildCustomReviewerSystemPrompt` — VERDICT_BLOCKING_RULES / DECISION_NEEDED_DEFINITION 再利用 |
| D3: `JUDGE_REPORT_TOOL` identity 再利用 | ✅ | `createCustomReviewerStep` の `reportTool = JUDGE_REPORT_TOOL` — identity test あり |
| D4: job start 前の load-time validation | ✅ | `pipeline-run.ts` で `bootstrapJob` 前に validate |
| D5: job state への snapshot | ✅ | `JobState.reviewers?: ReviewerSnapshot[]` — round-trip テストあり |
| D6: empty snapshot → base 参照同一 | ✅ | `composeReviewerDescriptor` — identity test あり |
| D7: `buildReviewerChainTransitions` で literal 除去 | ✅ | STANDARD_TRANSITIONS に `s.steps["code-review"]` リテラル残存なし |
| D8: `resolvePairedReviewForFixer` 多対一逆引き | ✅ | `pipeline.ts` — `resolveActiveReviewer` 経由 |
| D9: per-reviewer `resolveMaxIterations` | ✅ | `Pipeline.resolveMaxIterations(stepName)` |
| D10: `customReviewerResultPath` / no-op template | ✅ | `paths.ts` + `getOutputTemplates` → `[]` テストあり |
| D11: `resolveReviewerResultPath` 統一ディスパッチ | ✅ | `code-review` → `reviewFeedbackPath`、その他 → `customReviewerResultPath` テストあり |

---

## 観察（非ブロッキング）

- `pipeline-run.ts` は `bootstrapJob` に `reviewers` を渡さず返却 state に後付けセット。  
  `buildInitialJobState` の `reviewers?` パラメータが call site で未使用（設計上の不整合、動作は正しい）。
- spec.md の「--from オプションの制限」は tasks.md に T タスクがないが、  
  `resolveResumeStep` の `ALL_STEP_NAMES_SET` 実装で自然に充足されている。
