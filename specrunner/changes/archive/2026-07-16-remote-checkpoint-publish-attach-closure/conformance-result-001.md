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
| tasks.md | ✓ | 全チェックボックス [x] 完了 |
| design.md | ✓ | D1–D6 すべて実装済み |
| spec.md | ✓ | 全 Requirement / Scenario をカバー |
| request.md | △ | 【主役 E2E】 受け入れ基準の「job resume 開始」検証が統合テストに不足（下記参照） |

---

## Review Details

### typecheck && test

- `bun run typecheck`: green（エラーなし）
- `bun run test`: green（7032 passed, 510 test files）

---

### Task Completion

tasks.md T-01〜T-10 の全チェックボックスが `[x]` で完了している。

---

### Implementation Assessment

#### D1/D2 — Immutable OID identity

`runAttachVerification` が fetch 直後に `git rev-parse origin/<branch>^{commit}` で OID を一度だけ解決し、`readCheckpointFromRef` / `verifyCheckpoint` に渡す。`VerifiedCheckpoint.checkpointOid` に透過され、CLI の materialize が `origin/<branch>` ではなく `verified.checkpointOid` を使う。TC-010 が real-git harness で TOCTOU ケースを検証済み。✓

#### D3 — Checkpoint predicate closure

`verifyCheckpoint` に 3 つの新規チェックが追加された。

- version 2 で `events.jsonl` が `treeFiles` に無ければ `events-missing` で拒否（TC-VC-011）✓
- `_journal` counter と `fold` 件数を `detectCounterReversal` で比較し reversal なら `counter-reversal` で拒否（TC-VC-012）✓
- 解決した resume step の `reads()` が返す必須 file が `treeFiles` になければ `resume-input-missing` で拒否（TC-VC-013）✓

すべて pure 述語（throw のみ、FS 副作用なし）。✓

#### D4 — materialize は pre-existing branch を破壊しない

`WorktreeManager.create` に `branchWasPreExisting?: boolean` 引数を追加し、`WorkspaceMaterializer` の `attach-from-checkpoint` が `rev-parse --verify refs/heads/<branch>` で事前確認して渡す。new-run 経路は引数なしで既存挙動を維持。既存 `manager.test.ts` は無変更で green。✓

#### D5 — quiescent checkpoint publisher（単一 seam）

`pipeline.ts:504–506` にループ末尾の単一 seam（`state.status === "awaiting-resume"` 条件）を追加。escalation / exhaustion / guard halt の全制御出口がここに収束する。`commitFinalState` に optional `messageLabel`（既定 `finalize`）を追加し、`LocalRuntime` が `state.status === "awaiting-resume"` のとき `"checkpoint"` を渡す。throw しない契約維持。TC-PUB-001 / TC-PUB-002 が seam を検証。✓

#### D6 — ADR Positive 文言 / D7 citation 是正

ADR-20260715 の Positive 文言に publisher 完成で cross-env resume が閉じる旨が追加済み。`src/` 配下に `ADR-20260715 D7` の citation がゼロであることを確認。`orchestrator.ts` / `attach.ts` のコメントが `design.md D1–D2` を参照するよう修正済み。✓

---

## Findings

### F-001 【主役 E2E】 T-09 統合テストが `job resume 開始できる` 検証を欠く

**対象**: `tests/attach/attach-integration.test.ts`

request.md の第 1 受け入れ基準（【主役 E2E】）:

> 実際の pipeline がマシンA相当で `awaiting-resume` へ遷移し、自己整合な checkpoint を origin へ publish し、
> マシンB相当が**同じ commit OID** を検証・materialize して既存 resume（`job resume`）を開始できることを
> 統合テストで固定する。

現状の TC-INT-006 のカバレッジ:

| 項目 | 状態 |
|------|------|
| Machine A: `commitFinalState` で publish → real git push | ✓ |
| Machine B: `runAttachVerification` で OID 一致を確認 | ✓ |
| Machine B: materialize で worktree HEAD = 公開済み OID を確認 | ✓ |
| Machine A: 「実際の pipeline」（local runtime + stub agent）が `awaiting-resume` へ遷移 | ✗（`commitFinalState` 直接呼び出しで代替） |
| Machine B: attach 後に `job resume` が resume step から pipeline を開始できる | ✗（`resolveJobStateBySlug` の発見確認のみ） |

tasks.md T-09 acceptance criteria の「マシンB相当が attach 後に `job resume` を開始できる」が統合テストで未検証。

**緩和要因**（個別テストの組み合わせ）:

- TC-PUB-001: pipeline → awaiting-resume → `commitFinalState` 1 回（mock runtime）✓
- TC-INT-005: `resolveJobStateBySlug` が attach 後の状態を発見できる ✓
- TC-070: awaiting-resume → `pipeline.run` from resumePoint.step → awaiting-archive ✓
- TC-010: TOCTOU ケース（OID 固定）✓

実装コード自体は正しい。テストの統合が 1 本の E2E として閉じていない。

**必要な修正**: TC-INT-006 または新規テストで以下を追加:

1. pipeline.run（stub agent runner + local runtime）を `awaiting-resume` へ遷移させ、実際に bare origin へ commit+push されることを real-git で確認
2. 別 clone で attach → `resolveJobStateBySlug` 取得状態から `pipeline.run` を呼び出し、resume step から開始できることを確認

---

## Summary

実装コード（D1–D6）はすべて正しく、型チェック・テストとも green。request.md の 【主役 E2E】 受け入れ基準の「実際の pipeline が awaiting-resume へ遷移し publish」と「job resume を開始できる」の 2 点が統合テストとして一本化されていないため `needs-fix`。
