# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Summary

Implementation is correct and satisfies all acceptance criteria. The core design (content-identity → provenance migration) is faithfully implemented across all touch points: `tamper.ts`, `step.ts`, `gate.ts`, `canon-provenance.ts`, `runtime-strategy.ts`, `local.ts`, `managed.ts`, `types.ts`, `step-types.ts`, and `run.ts`.

`typecheck && test` are green (808 test files / 12 069 tests pass). All must-priority acceptance criteria are met. Existing tests (`evidence-base-gate.test.ts`, `gate-empty-selection.test.ts`, `gate-no-test-materialize.test.ts`, `bite-evidence-e2e-gate.test.ts`) are unchanged and green.

Two findings: one medium (TC-028 test body doesn't exercise the exception-catching path described in its GIVEN) and one low (TC-026 test doesn't call `BiteEvidenceStep.run` with null `runtimeStrategy` as its GIVEN states). Both are `should`-priority TCs. One informational observation (redundant cast).

---

## 検証した項目

| ファイル | 確認内容 |
|---------|---------|
| `design.md` | D1–D5 の設計判断と実装の整合性 |
| `tasks.md` | T-01〜T-05 の受け入れ基準と実装 |
| `test-cases.md` | TC-001〜TC-028 の定義と実装テストの対応 |
| `tamper.ts` | `checkTamperStatus` / `parseCommitToken` の分岐ロジック |
| `step.ts` | provenance 入力の計算・配線（authorized writers, worktreeDirty, lastCanonCommitToken, sentinel） |
| `gate.ts` | reason 文字列の更新（routing 不変） |
| `canon-provenance.ts` | `authorizedCanonWriterSteps` 追加、operator-apply の恒常注入 |
| `runtime-strategy.ts` | `lastCommitTouchingPath?` optional 追加 / `RealRuntimeStrategy` required 追加 |
| `local.ts` | `lastCommitTouchingPath` 実装（git log -1 --format=%H\x1f%s）|
| `managed.ts` | `lastCommitTouchingPath` 実装（always unavailable）|
| `types.ts` / `step-types.ts` | `authorizedCanonWriters` フィールド追加 |
| `run.ts` | `buildPipelineForJob` / `runPipeline` での authorized writers 計算・注入 |
| `gate.test.ts` | TC-032 更新 + TC-001〜TC-028 新規テスト 36 cases 確認 |
| `last-commit-touching-path.test.ts` | TC-007〜TC-011: 9 tests ✓ |
| `authorized-canon-writer-steps.test.ts` | TC-017: 4 tests ✓ |
| `evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` | 無変更確認（git diff 空）・green 確認 |
| `verification-result.md` | typecheck ✓ / test 12069 passed ✓ |

### 重要設計確認ポイント

**sentinel `"__non-conforming-subject__"`** (step.ts:89)
`parseCommitToken` が null を返す場合を `lastCanonCommitToken = null`（= commit 履歴なし → inconclusive）と区別するために sentinel を使用。非準拠 subject の real commit は branch 5（mismatch → fail-closed）へ正しくルーティングされる。TC-034 で検証済み。design.md の「呼び出し側で null token は authorizedWriters に無い文字列として mismatch になるよう扱う」の実装として正しい。

**circular import 回避**
`registry → step.ts → tamper.ts → registry` の循環を避けるため `authorizedCanonWriterSteps` を `canon-provenance.ts` に配置し、`PipelineDeps.authorizedCanonWriters` 経由で注入。`buildPipelineForJob`（registry の import chain 外）で計算・注入される設計が実装されていることを確認。

**operator-apply の恒常注入**
`authorizedCanonWriterSteps` は外側 try/catch が成功する限り常に `operator-apply` を含む集合を返す。これにより `buildPipelineForJob` の `if (writers.size > 0)` ガードは実運用で常に true。例外発生時（外側 catch → 空集合）のみ injection がスキップされ `evidenceAvailable=false → inconclusive` に倒れる。動作は正しい。

**TamperStatus union 安定**
D4 通り `"match" | "mismatch" | "inconclusive"` 不変。`evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` が生 `tamperStatus: "mismatch"` を gate に渡して `/tamper/i` のみ検証するため、union 変更は既存 test を壊すが本変更では union を変えていない。

---

## 検証できなかった項目

None. 全 acceptance criteria を diff・テスト・verification result から確認済み。

---

## Findings 詳細

### F-001: TC-028 test が例外 throw シナリオを実際に実行しない（Medium / Fixable）

**対象**: `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-028 ブロック

TC-028 の GIVEN は「`lastCommitTouchingPath` 呼び出しが予期せず例外を throw する / `BiteEvidenceStep.run` の tamper 計算ブロック（try/catch で包まれた全体）を実行する」だが、実装されたテストは `BiteEvidenceStep.run` を呼ばず `checkTamperStatus` を直接呼んで `evidenceAvailable: false` → `inconclusive` を確認するだけである。

step.ts lines 103–106 の `catch { tamperStatus = "inconclusive"; }` は未テスト。

ただし、このパスは実質的に unreachable（port method は never-throw 契約、`checkTamperStatus`/`parseCommitToken` は pure function）。TC-028 は `should` priority。

**修正案**: TC-028 ブロック内に BiteEvidenceStep.run レベルのサブテストを追加。`lastCommitTouchingPath: vi.fn(() => { throw new Error("unexpected"); })` の fake runtime を使い、result file が `## Verdict: failed` を含まないことを確認する。

---

### F-002: TC-026 が `BiteEvidenceStep.run` を null runtimeStrategy で呼ばない（Low / Fixable）

**対象**: `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-026 ブロック

TC-026 の GIVEN は「`BiteEvidenceStep.run` の `deps.runtimeStrategy` が `null` または `undefined`」だが、テストは `checkTamperStatus` を直接呼び、その後 `runBiteEvidenceGate` に `runtimeStrategy: null` を渡す。step.ts の wiring パス（null runtimeStrategy → `evidenceAvailable=false`）は直接テストされていない。

TC-033 が `BiteEvidenceStep.run` を happy path でテストするが、null runtimeStrategy の場合はカバーされていない。

**修正案**: TC-026 ブロック内に `BiteEvidenceStep.run` を `runtimeStrategy: null, authorizedCanonWriters: new Set([...])` で呼ぶサブテストを追加し、result file が `## Verdict: failed` を含まないことを確認する。

---

## Acceptance Criteria Coverage

| 基準 | 状況 | 根拠 |
|------|------|------|
| spec-fixer 正規編集 → tamper 扱いにならない | ✅ | TC-001 (unit) + TC-033 (BiteEvidenceStep.run integration) |
| operator 適用 → tamper 扱いにならない | ✅ | TC-002 (`operator-apply` token → match) |
| 非認可経路変更 → continued failed | ✅ | TC-003(provenance) implementer attribution; TC-004(provenance) worktreeDirty; TC-034 non-conforming subject |
| 証跡欠落シナリオの挙動固定 | ✅ | TC-025 / TC-005(provenance): lineage なしでも durable commit → match |
| gate.test.ts pin ケースのみ更新 | ✅ | TC-032 group 更新; 他 test ファイルは git diff 空 |
| evidence-base-gate / gate-empty-selection 無変更 green | ✅ | git diff 空; verification 7 tests ✓, 5 tests ✓ |
| `typecheck && test` green | ✅ | verification-result.md: tsc ✓, 12069 tests ✓ |

---

## Positive Highlights

- **sentinel `"__non-conforming-subject__"`**: `commitResult.kind === "none"`（commit 履歴なし → inconclusive）と `parseCommitToken` null（non-conforming subject → mismatch）を正しく区別。TC-034 で fail-closed を明示的に固定。

- **D2 証跡の durable 化**: tamper.ts に lineage record 参照が一切なくなった。commit history lookup のみで判定するため、appendLineage の best-effort 失敗が tamper 偽陽性を生まない設計が実現されている。

- **`RealRuntimeStrategy` compile-time 強制**: `lastCommitTouchingPath` を required として追加済み。LocalRuntime / ManagedRuntime が未実装の場合 tsc がエラーを出す。TC-011 で実行時の存在も確認。

- **gate reason 互換性**: `/tamper/i` を保持しつつ provenance 文言を採用。既存 test が reason に `/tamper/i` のみ期待しているため、この変更で既存テストが壊れない（verification で確認）。
