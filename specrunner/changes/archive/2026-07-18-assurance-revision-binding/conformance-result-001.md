# Conformance Result — assurance-revision-binding — Iteration 001

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
| tasks.md | ✅ | 全 6 タスクブロック（T-01〜T-06）が [x] 完了 |
| design.md | ✅ | D1〜D5 すべて実装に反映。fold/event-journal 除去・seam 1 ファイル閉じを確認 |
| spec.md | ✅ | 2 要件 / 7 シナリオすべてテストで固定 |
| request.md | ✅ | 受け入れ基準 T1〜T7 すべて充足（7358 tests green） |

---

## 1. Tasks Completeness

全タスクブロック（T-01〜T-06）のチェックボックスが [x] で完了済み。

| Task | Status |
|------|--------|
| T-01: scenario freeze → testCaseGenOid blob 束縛 | ✅ |
| T-02: specReview → specReviewOid blob 束縛 | ✅ |
| T-03: unit テスト更新（新束縛、fine-grained） | ✅ |
| T-04: floor integration テスト（exitCode 歯） | ✅ |
| T-05: 実 runtime E2E 時間境界化 | ✅ |
| T-06: backward-compat 監査と全体 green | ✅ |

---

## 2. Design Decisions vs. Implementation

| Decision | Implementation |
|----------|---------------|
| **D1**: events.jsonl / fold 依存を廃し、test-cases.md@testCaseGenOid と @finalHeadOid の content hash 跨ぎ比較に差し替え | `achieved-assurance.ts` L325–383 に実装。`fold` / `event-journal` import は削除済み（grep で確認）。 |
| **D2**: specReview を `floor.specReview` が constrain するときのみ実行し、spec.md@specReviewOid と @finalHeadOid の hash 一致を要求 | L141–195 に実装。早期 return せず achieved.specReview の設定のみ。try/catch で never throws 維持。 |
| **D3**: 各束縛に time-boundary / 協調改竄反例を positive と同型で固定し、DESTRUCTIVE INVARIANT コメントを記載 | unit 2 本（TC-001/002）、integration 2 本（TC-008/009）に DESTRUCTIVE INVARIANT コメント明記。 |
| **D4**: E2E を anchor と HEAD を別 commit に分ける構成へ更新 | `bite-evidence-e2e-gate.test.ts` に commit 系列（specReviewOid → testCaseGenOid → baseOid → positiveOid → tamperScenarioOid → tamperSpecOid）を実装。同一 commit 同居なし。 |
| **D5**: production 変更を `achieved-assurance.ts` 1 ファイルに閉じる | diff --stat で `src/` 変更は `src/core/archive/achieved-assurance.ts` 1 本と E2E テストのみ。port / runtime / caller は無変更。 |

---

## 3. Spec Requirements & Scenarios

### Requirement 1: testDerivation / biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob

| Scenario | Coverage |
|----------|---------|
| time-boundary（改竄後 commit に S'）→ fail-closed | TC-001（unit）/ TC-008（integration）/ TC-014（E2E real）✅ |
| 協調改竄（test-cases.md@HEAD + events.jsonl@HEAD 同時書換）→ fail-closed | TC-002（unit）/ TC-009（integration）✅ |
| anchor から HEAD まで不変（positive） | TC-003（unit）/ TC-013（E2E real）✅ |
| testCaseGenOid 欠落 / test-cases.md unavailable → fail-closed | TC-004(i-v)（unit）/ TC-011(i,iii,iv)（integration）✅ |

### Requirement 2: specReview SHALL bind the approval to the reviewed revision blob

| Scenario | Coverage |
|----------|---------|
| spec-review 後に spec.md 変更（time-boundary）→ fail-closed | TC-005（unit）/ TC-010/negative（integration）/ TC-015（E2E real）✅ |
| spec.md 不変（positive） | TC-006（unit）/ TC-010/positive（integration）✅ |
| specReviewOid 欠落 / spec.md unavailable → fail-closed | TC-007(i-iii)（unit）/ TC-011(ii,v,vi)（integration）✅ |

---

## 4. Acceptance Criteria (T1〜T7)

### T1（scenario time-boundary の歯）

- Unit TC-001: test-cases.md@testCaseGenOid=S、@finalHeadOid=S'（不一致）→ testDerivation/biteEvidence absent。
- Integration TC-008: exitCode 1、mergePullRequest 未呼び出し。
- E2E TC-014: real LocalRuntime で tamperScenarioOid を finalHeadOid に → absent。
- DESTRUCTIVE INVARIANT コメント：「同一 commit 比較に戻すと events.jsonl frozen hash = hash(S') かつ test-cases.md@HEAD = S' → 一致 → 誤通過」が明記されている。

**✅ 充足**

### T2（協調改竄の歯 — #850 の穴）

- Unit TC-002: test-cases.md@HEAD=S' + events.jsonl@HEAD frozen hash=hash(S') 同時書換 → commit-OID 束縛が test-cases.md@testCaseGenOid(S) を基準にするため不一致検出 → absent。
- Integration TC-009: exitCode 1。
- DESTRUCTIVE INVARIANT コメント：「旧同一 commit 自己整合では hash(S')==hash(S') で通ってしまう」が明記されている。

**✅ 充足**

### T3（scenario positive、実 runtime E2E）

- E2E TC-013: 実 git リポジトリ（fake なし）、specReviewOid / testCaseGenOid / baseOid / positiveOid を別 commit に分離した構成。base:red / HEAD:green / blob freeze intact / scenario 凍結成立（test-cases.md 不変）/ spec.md 不変 → biteEvidence=required + specReview=required。

**✅ 充足**

### T4（specReview time-boundary の歯）

- Unit TC-005（negative）: spec.md@specReviewOid=SPEC、@finalHeadOid=SPEC'（不一致）→ specReview absent。
- Unit TC-006（positive）: spec.md 不変 + approved → specReview=required。
- Integration TC-010/negative: exitCode 1、mergePullRequest 未呼び出し。
- Integration TC-010/positive: exitCode 0、mergePullRequest 呼び出し確認。
- E2E TC-015: real LocalRuntime で tamperSpecOid を finalHeadOid に → absent。

**✅ 充足**

### T5（fail-closed 網羅）

- Unit TC-004(i): test-case-gen step 自体なし → absent。
- Unit TC-004(ii): step 有だが commitOid なし → absent。
- Unit TC-004(iii): test-cases.md@testCaseGenOid unavailable → absent。
- Unit TC-004(iv): test-cases.md@finalHeadOid unavailable → absent。
- Unit TC-004(v): slug 欠落 → absent。
- Unit TC-007(i-iii): specReviewOid 欠落 / spec.md@anchor unavailable / spec.md@HEAD unavailable → absent。
- Integration TC-011(i-vi): 各欠落・unavailable シナリオで exitCode 1。

**✅ 充足**

### T6（実 config anti-regression）

- Integration TC-012: scopedTestCommand 未設定 → runTestsAtCommit unavailable → biteEvidence:required floor で exitCode 1、mergePullRequest 未呼び出し。#848 の歯が退行していない。

**✅ 充足**

### T7（backward-compat）

- 検証結果: 537 test files / 7358 tests all passed（typecheck / test / lint / changed-line-coverage すべて green）。
- production 変更は `src/core/archive/achieved-assurance.ts` 1 ファイル（+ E2E・unit テスト更新）に閉じており、port / runtime / caller は無変更。
- `fold` / `event-journal` の import は achieved-assurance.ts から完全に除去済み。

**✅ 充足**

---

## 5. 総評

実装・テストともに request / spec / design の仕様に厳密に従っている。production seam が 1 ファイルに閉じ、events.jsonl 依存が消え、各テストに DESTRUCTIVE INVARIANT コメントが記載されており将来の退行検出が可能な状態。全 7358 テスト green。
