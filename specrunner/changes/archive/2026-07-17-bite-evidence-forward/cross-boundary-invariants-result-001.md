# Cross-Boundary Invariants Review — bite-evidence-forward (Iteration 1)

**Reviewer**: cross-boundary-invariants
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

- **verdict**: approved

---

## 検査対象の境界

| 境界 | 確認内容 |
|------|----------|
| `commitOid` の journal 往復 | `StepAttemptRecord` ↔ `fold` ↔ `StepRun` |
| `biteEvidence` state 持続 | `commitSuccess` → `state.json` → `validateJobState` |
| pipeline 遷移テーブル | `STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` の不変性 |
| reverification predicate | `codeChangedSinceLastVerification` / `IMPL_CODE_MUTATOR_STEPS` |
| `composeReviewerDescriptor` | custom reviewer chain との干渉 |
| resume セマンティクス | CLI step の中断・再開 |
| managed runtime 経路 | `unavailable` → `strategy-deferred` の一貫性 |
| stale evidence 経路 | re-loop 時の旧 `biteEvidence` 残留 |

---

## Findings

### F-01 (medium): `verification.commands` 設定時に forward 型 job でも無条件 `strategy-deferred`

**ファイル**: `src/core/runtime/local.ts`（`runTestsAtCommit`、line 902–907）

```typescript
if (config.verification?.commands && (config.verification.commands as unknown[]).length > 0) {
  return {
    kind: "unavailable",
    reason: "Cannot scope custom verification.commands to individual test files",
  };
}
```

**影響範囲**:  
`verification.commands` を持つプロジェクト（language-agnostic builds）の forward 型 job では、ゲートが常に `strategy-deferred` を返す。  
BiteEvidence レコードは一切生成されず、acceptance criterion「forward job でゲートが BiteEvidence を branch-borne に記録する」が無言で充足されない。

**Design 文書との整合**:  
`design.md` の "Open Questions" に「If a project's test script cannot take file arguments, the run should return `unavailable` (defer)」として言及されている。ただし acceptance criteria には例外記述がなく、テストカバレッジも存在しない（gate.test.ts に `verification.commands` 経路のテストケースがない）。

**既存挙動への影響**: なし（既存 pipeline は strategy-deferred を verification へ素通りする）。

**対処**:  
- fixable: test/doc で「`verification.commands` 設定時は strategy-deferred」を明示するか、result file に reason を記録して audit trail として固定する。現状でも `bite-evidence-result.md` に reason は書かれるが、受け入れ基準には現れていない。

---

### F-02 (low): re-loop 時 `captureHeadSha` が null を返すと旧 `biteEvidence` が state に残留

**ファイル**: `src/core/step/commit-orchestrator.ts`（`commitSuccess`、line 336–338）

```typescript
if (completion.biteEvidence && completion.biteEvidence.length > 0) {
  s = { ...s, biteEvidence: completion.biteEvidence };
}
```

**シナリオ**:
1. forward job: implementer → bite-evidence passed → `state.biteEvidence` = [verified records for OID-1]
2. `conformance → needs-fix:implementer` → implementer が新たにコミット成功
3. ただし `captureHeadSha` が null を返す（git エラー等）
4. gate: `candidateOid = null` → `strategy-deferred`、`records: []`（length = 0）
5. `commitSuccess` の条件を満たさないため `state.biteEvidence` はOID-1 の古いレコードのまま
6. その後の verification → code-review → conformance → PR 作成で旧証拠が state に残る

**確率**: 極低（`commitAndPush` 成功後に `git rev-parse HEAD` が失敗するケースは稀）。設計側も "Risk" セクションでこの可能性を認識している。

**既存挙動への影響**: なし。この場合 pipeline は `strategy-deferred → verification` で継続し、機能的な退行は生じない。stale evidence はただの state 上の観測データ（audit 用途）。

---

### F-03 (low): `BiteEvidenceStep.reads()` に `events.jsonl` が未宣言

**ファイル**: `src/core/step/bite-evidence/step.ts`（line 108–113）

```typescript
reads(state: JobState, deps: StepDeps): IoRef[] {
  return [
    { path: `${changeFolderPath(deps.slug)}/test-cases.md`, required: false },
    { path: ".", artifact: "gitState" },
  ];
},
```

`step.run()` は tamper check のため `events.jsonl` を読むが、`reads()` に宣言されていない。  
- **実行時影響**: なし。events.jsonl がない場合は `fold("")` → lineage 空 → `inconclusive` → 歯による判定が継続（design D6 明文化済み）。  
- **観測可能な影響**: lineage 記録（`applySuccessPostPersistEffects`）の inputs に events.jsonl が含まれず、artifact graph が不完全になる。

---

## 境界別確認結果（問題なし）

| 境界 | 結果 |
|------|------|
| `commitOid` journal 往復 | `stepRunToRecord` / `fold` で正しく往復。`endedAt` ↔ `completedAt` マッピングも `pushStepResult` で一致。✓ |
| `biteEvidence` state 持続 | `stateToStateJson` は `history` / `steps` のみ除去。top-level `biteEvidence` は state.json に保存される。`validateJobState` に軽量バリデーション追加。✓ |
| pipeline 遷移テーブル | `STANDARD_DESCRIPTOR`: `implementer → bite-evidence → verification` 正確に挿入。`FAST_DESCRIPTOR` は変更なし。✓ |
| reverification predicate | `IMPL_CODE_MUTATOR_STEPS = [implementer, build-fixer, code-fixer]`。`bite-evidence` を含まない（code 変更なし）ため `codeChangedSinceLastVerification` への副作用なし。✓ |
| `composeReviewerDescriptor` | custom reviewer chain は code-review 以降に挿入。`implementer → bite-evidence` edge には干渉しない。✓ |
| `conformance → needs-fix:implementer` re-loop | `resolveBaseCandidateOids` は latest run の commitOid を返す。base OID（test-materialize）は固定のまま、candidate OID のみ更新され、gate が正しく再評価する。✓ |
| managed runtime 経路 | `listCommitChangedFiles` / `runTestsAtCommit` ともに `unavailable` を返す → `strategy-deferred`。`digestArtifacts` は null hash → `inconclusive` → gate は歯評価に進むが runtime check で `strategy-deferred`。一貫性あり。✓ |
| `strategy-deferred` Verdict 型 | `Verdict` union に `"strategy-deferred"` が含まれる（schema/types.ts:66）。遷移テーブルで `t.on = "strategy-deferred"` として使用。型安全。✓ |
| CLI step resume セマンティクス | 中断後再開時は `bite-evidence.run()` を最初から再実行。既存 CLI step（verification, pr-create）と同一の resume セマンティクスを踏襲。✓ |
| `roundOwnsGitEffects` 経路 | parallel reviewer coordinator（custom-reviewers）には commitOid が付かない。test-materialize / implementer は sequential step であり coordinator にはならない。影響なし。✓ |

---

## 総合評価

**中断する必要のある不変条件違反: なし**

F-01（medium）は verification.commands プロジェクトで BiteEvidence が無言でスキップされるが、既存 pipeline 挙動を破らず、design の Open Questions セクションに記録済みの想定範囲内。F-02・F-03 は極低確率または observability のみの問題であり、基本的な歯の正確性・fail-closed 動作・resume 安全性に関する cross-boundary 不変条件は全て維持されている。
