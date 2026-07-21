# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec ファイル
- `request.md` — 背景・要件・受け入れ基準・architect 評価済み設計判断を通読
- `design.md` — D1〜D6 全決定、Risks/Trade-offs、既存テスト更新リストを通読
- `spec.md` — 全 Requirement と全 Scenario を通読
- `tasks.md` — T-01〜T-07 の全タスクと各 Acceptance Criteria を通読

### 現状コードの照合（request.md 記載の前提条件の検証）

| 前提 | 確認箇所 | 結果 |
|------|----------|------|
| `conformanceApprovedLatest` が verdict のみ判定 | `reverification.ts:67-72` | ✓ 実コードで確認（commitOid 照合なし） |
| VERIFICATION → ADR_GEN / PR_CREATE の 2 箇所で当該 guard 参照 | `types.ts:250, :307` | ✓ STANDARD と FAST の両行を確認 |
| `codeChangedSinceLastVerification` が endedAt 比較のみ | `reverification.ts:37-53` | ✓ ISO 8601 文字列の lexicographic 比較のみ |
| `StepRun.commitOid?: string` が存在 | `schema/types.ts:199` | ✓ フィールド定義を確認 |
| CLI step（verification）の StepRun に commitOid が打刻されない | `executor.ts:524-578`（`runCliStep`） | ✓ step.run() 前後に captureHeadSha 呼び出しなし |
| `selectPendingMembers` が revision 照合なし | `reviewer-status.ts:77-87` | ✓ status のみで除外判定、2 引数シグネチャ |
| `propagateVerificationResult` が step.run() 内で HEAD を進める | `verification/propagate.ts:50-70` | ✓ git add → commit → push を step.run() 内で実行 |
| `projectSuccess` が result の commitOid を StepRun へ透過 | `commit-orchestrator.ts:95, 110` | ✓ スプレッド構文で透過確認 |
| `applyRoundResults` が approved 時に approvedAtCommit を設定 | `reviewer-status.ts:115-120` | ✓ `approvedAtCommit: headSha` を確認（後述 Finding 参照） |
| re-anchor 後の statuses が `commitRound` で永続化される | `parallel-review-round.ts:331`, `commit-orchestrator.ts:541` | ✓ `reviewerStatuses: statuses` として 1 回永続化 |

### Design の主要決定の検証

**D1（基準点 = 直近 verification run の commitOid）**: spec.md の Requirement「verification passed → adr-gen / pr-create の短絡は conformance 承認 revision と一致する場合に限る」と一致。guard は pure function で state のみ参照（git I/O なし）の要件を満たす設計。

**D2（entry HEAD 打刻）**: `propagateVerificationResult` が step.run() 内で result commit を行い HEAD を進める事実（propagate.ts:61-68）を実コードで確認。exit HEAD を掴むと conformance.commitOid と常に食い違う、という D2 の論拠は正確。

**D3（guard 置換）**: 4 条件（conformance 存在・approved、conformance.commitOid 非空、verification.commitOid 非空、両者等値）の fail-closed 設計は spec.md Scenario との対応が取れている。

**D4（build-fixer 後の reviewer chain 再入）**: `conformance(approved, C_conf) → build-fixer(C_bf) → verification(pass, entry=C_bf)` で C_bf ≠ C_conf → guard false の帰結が正しい。ループ非発生の論拠（再承認後 codeChangedSinceLastVerification=false → conformance → adr-gen 直行）も transition table 上で矛盾なし。

**D5（custom reviewer 束縛 + re-anchor）**: invalidation loop（parallel-review-round.ts:112-140）が step 2 で in-memory 更新 → commitRound(step 9) で永続化という経路を実コードで確認。source-scoped invalidation（2026-07-15 archived change）の D1 contract（`approvedAtCommit = fan-out HEAD before commitRoundArtifacts`）が parallel-review-round-invalidation.test.ts:188+ の contract test で固定済みであることも確認。

**D6（レガシー stale）**: null/undefined commitOid → false（fail-closed）は D3 guard と D5 selectPendingMembers 両方の設計で一貫。

### セキュリティ検証

- `commitOid` は `git rev-parse HEAD` の出力（40 hex SHA）。guard は `===` による string equality のみ → injection リスクなし。
- state ファイルへの不正書き込みが前提となる改ざんは、ファイルシステム権限で防御すべき問題であり本変更の対象外。
- fail-closed 設計（null/欠落 = 承認なし = 再実行）は OWASP A01 観点でも正しいデフォルト-deny 姿勢。
- managed runtime での照合無効化（`baselineCommit == null`）は trust boundary 内で明示的な Non-Goal として文書化されている。

### 既存テスト更新対象の確認

design.md「既存テストの更新」節に列挙された各テスト（TC-001/002/003/004/019、TC-2、selectPendingMembers 群、member-resume-routing 群）の現状シグネチャ・期待値を確認し、tasks.md T-05 の更新指示と矛盾がないことを検証した。

## 検証できなかった項目

- **T-01/T-02/T-04 実装後の typecheck & test 通過**: 実装前のため実行できない。tasks.md T-07 の受け入れ基準で担保される。
- **TC-003/004/019 更新後の mock 設計詳細**: commitOid 付与の具体的手段（appendRun 拡張 / runtimeStrategy mock の captureHeadSha 実装）は実装者が決定する。tasks.md T-05 に基本指示はあるが、個別 mock の設計は実装フェーズで確定する。

## Findings 詳細

### F-01: request.md の `approvedAtCommit` 前提に事実誤認がある

**ファイル**: `specrunner/changes/approval-revision-binding/request.md`（背景セクション）  
**内容**: request.md は「`reviewer status には approvedAtCommit フィールドが宣言だけされて常に null で放置されている`」と述べているが、実際の `applyRoundResults`（`reviewer-status.ts:115-120`）は `approved` verdict 時に `approvedAtCommit: headSha` を既に設定している。

**影響**: design.md はこれを正確に検知・修正している（「実測では既に実値が入っている」「欠落は値の設定ではなく `selectPendingMembers` の revision 照合なし」）。設計上の欠落はなく、実装すべき箇所（`selectPendingMembers` への基準 commitOid 照合追加）も正確に特定されている。blocking ではない。

---

### F-02: D5 baselineCommit capture — fallback あり/なしの分離が要実装注意点

**ファイル**: `src/core/pipeline/parallel-review-round.ts:108`（将来の実装対象）  
**内容**: 現行の `currentHeadSha = captureHeadSha(cwd) ?? new Date().toISOString()` は invalidation 用（fallback あり）。D5 で必要な `baselineCommit` は fallback なし nullable 値として算出しなければ、managed runtime（captureHeadSha が null を返す）で `baselineCommit = "<timestamp>"` になり照合が誤発火する。

**tasks.md の対処**: T-04 に「timestamp fallback を分離して raw 値を得る」と明示されている。実装で誤って fallback あり値を `baselineCommit` として使わないよう注意が必要。

---

### F-03: TC-003/TC-004/TC-019 更新で commitOid simulation が必要

**ファイル**: `tests/unit/core/pipeline/pipeline.reverification.test.ts`（将来の更新対象）  
**内容**: これらのテストの executor mock は `appendRun` で StepRun を生成するが、現行は `commitOid` を付与しない。T-05/T-06 の更新後、`conformanceApprovedForVerifiedRevision` guard は conformance と verification 両方の `commitOid` が非空かつ等値のときのみ true を返す。commitOid が付与されないと guard が常に false → code-review 再入 → 無限ループが発生し `typecheck && test` が通らない。

**tasks.md の対処**: T-05 は「conformance と reverify verification に同一 commitOid を打刻」と明示。`appendRun` に commitOid 引数を追加するか、runtimeStrategy mock に `captureHeadSha` を実装するかは実装者の判断。いずれの手段でも spec.md の要件は満たせる。

---

### 問題なし（確認済み）

- D2 の entry-HEAD 打刻 invariant が `propagateVerificationResult` の commit 後の HEAD 移動という事実に正確に基づいている
- re-anchor の永続化経路（step 2 in-memory 更新 → commitRound 永続化）が実コードで成立している
- `2026-07-15-round-invalidation-source-scoped` D1 contract（`approvedAtCommit` = fan-out HEAD before commitRoundArtifacts）が contract test で固定済みで、本変更の「意味の拡張」を安全に踏襲できる
- STANDARD / FAST 両プロファイルの guard 参照箇所（types.ts:250, :307）が特定されており更新漏れのリスクなし
