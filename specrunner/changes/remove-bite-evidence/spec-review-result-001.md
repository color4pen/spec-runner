# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ spec ファイル
- `request.md` — 背景・現行の問題 4 点・影響バージョン・方針・要件 9 件・受け入れ基準全件・スコープ外を通読
- `design.md` — Context・Goals/Non-Goals・Decisions D1〜D12・Risks/Trade-offs・Open Questions・Migration Plan を通読
- `spec.md` — Requirement 7 件・Scenario 20 件を全件確認
- `tasks.md` — T-01〜T-13 全タスク・各 Acceptance Criteria を確認
- `test-cases.md` — TC-001〜TC-045 全件、Summary yaml を確認

### 検証したコードサーフェス（読み取り確認）

| ファイル | 確認内容 |
|---|---|
| `src/core/pipeline/registry.ts` | `BiteEvidenceStep` インポート・`STANDARD_DESCRIPTOR` への登録・roles エントリが現存することを確認 |
| `src/core/pipeline/types.ts` | `IMPLEMENTER / "success"` 3 行（2 行 guarded＋1 行 unconditional）、`BITE_EVIDENCE` 4 行が現存することを確認 |
| `src/kernel/step-names.ts` | `STEP_NAMES.BITE_EVIDENCE` と `CLI_STEP_NAMES` に `"bite-evidence"` が現存することを確認 |
| `src/state/profile.ts` | `biteEvidence: "required"` in STANDARD_PROFILE・`AssuranceFloor.biteEvidence`・`BITE_EVIDENCE_RANK`・`satisfiesFloor` の biteEvidence 分岐が現存することを確認 |
| `src/core/archive/achieved-assurance.ts` | `resolveEvidenceBaseRev`・`FORWARD_TYPES`・`selectMaterializedTestFiles` のインポートと biteEvidence 導出ロジック（d/e 節）が現存することを確認。`AssuranceProvenanceRuntime` が 4 メソッドの Pick であることを確認 |
| `src/config/schema/validation.ts` | `biteEvidence` フィールドが `minimumAssurance` zod スキーマに現存、`scopedTestCommand`/`scopedTestPatterns` が verification スキーマに現存。`runSemanticChecks` に `checkRemovedAssuranceDimension` 相当チェックなし |
| `src/config/schema/types.ts` | `VerificationConfig.scopedTestCommand`/`scopedTestPatterns`・`MinimumAssuranceConfig.biteEvidence` が現存 |
| `src/core/port/runtime-strategy.ts` | `listChangedFilesBetweenCommits`・`runTestsAtCommit`・`runTestsOnSynthesizedTree`・`IsolatedTestResult` が現存。`listCommitChangedFiles`・`readFileAtCommit` 等も現存 |
| `src/core/resume/resolve-step.ts` | `LEGACY_STEP_ALIASES` に `"bite-evidence"` エントリなし（`build-fixer`・`test-materialize` のみ）。3 分岐（`from`・`resumePoint`・`stateStep`）でエイリアス適用済み |
| `src/state/schema/types.ts` | `BiteEvidenceRecord`・`BiteEvidenceLevel`・`ProfileAssurance.biteEvidence`・`Verdict.strategy-deferred` が現存。`JobState.biteEvidence` フィールドも現存 |
| `src/core/step/bite-evidence/` | `step.ts`・`gate.ts`・`oids.ts`・`tamper.ts`・`test-file-selection.ts`・`__tests__/` (8 ファイル) が現存することを確認 |
| `src/util/paths.ts` | `biteEvidenceResultPath` が現存 |
| `src/core/archive/merge-then-archive.ts` | `MergeThenArchiveInput.config?: SpecRunnerConfig` フィールドが現存 |
| `src/prompts/pipeline-map.ts` | `PIPELINE_MAP` に bite-evidence 行が現存 |

### 確認した legacy-compat 対象
- `src/state/__tests__/bite-evidence-schema.test.ts` — 現存確認
- `tests/unit/state/bite-evidence-record-schema.test.ts` — 現存確認

### 確認した削除対象テストファイルの現存
T-12 に列挙された削除対象ファイルの現存を確認（一部抜粋）:
- `src/core/step/bite-evidence/__tests__/` — 8 ファイル現存
- `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` — 現存
- `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` 他 — 現存
- `src/core/runtime/__tests__/evidence-base-e2e.test.ts`・`synthesized-tree-exec.test.ts`・`list-changed-files-between-commits.test.ts` — 現存
- `src/config/__tests__/verification-scoped-command.test.ts`・`verification-scoped-patterns.test.ts` — 現存
- `tests/unit/pipeline/pipeline-sole-committer-bite-evidence.test.ts` — 現存
- `tests/unit/state/satisfies-floor.test.ts`・`tests/unit/config/schema-minimum-assurance.test.ts`・`tests/unit/cli/archive-minimum-assurance.test.ts` — retarget 対象として現存確認

### spec.md ↔ tasks.md ↔ test-cases.md の整合性確認
- spec.md の 7 要件すべてに対し、tasks.md に対応タスクがある
- test-cases.md の Source フィールドがほぼ全件 spec.md または tasks.md の具体 Scenario/Task を指している
- tasks.md の Acceptance Criteria が spec.md Requirement に明示的に紐付けられている

### 設計判断の正当性確認
- D6（`biteEvidence` 宣言を validation error にする）の実装方針：`runSemanticChecks` は `raw` オブジェクトを受け取ること（zod strip 前）を確認。`checkStagingExclusionNamespace` と同じパターンで実装可能なことを確認
- D8（legacy alias）：`resolveResumeStep` の 3 分岐すべてで `LEGACY_STEP_ALIASES` を参照していることを確認。`"bite-evidence"` エントリを追加するだけで全 resume 経路をカバーできる
- D9（read path 保持・write path 削除）：`Verdict` 型に `"strategy-deferred"` が現存。`BiteEvidenceLevel`・`ProfileAssurance.biteEvidence` の型保持は legacy state parse 互換性を保つ
- D7（`scopedTest*` keys を黙って無視）：zod `object()` が unknown key を strip することを確認。semantic check なしが意図的な非対称設計であることを確認（D6 との対比）

---

## 検証できなかった項目

- `src/core/archive/merge-then-archive.ts` の `config` フィールドを削除できるかどうか（archive path 内に `config` を読む他の consumer がいないか）— ファイルを冒頭 80 行程度しか読めていない。T-05 の条件付き削除ロジック（"only if no other code in the archive path reads it"）は実装者が `merge-then-archive.ts` 全体を読んで判断する必要があり、現時点では未確認
- `src/core/runtime/local.ts` の temp-worktree helper（T-07 の「only by removed methods」確認）— ファイルを未読
- `architecture/domain-model.md` の「この変更で factually false になる one clause」が具体的にどの文か — 参照で確認できるが、深読みは省略

---

## Findings 詳細

### Finding F-01: T-12 の削除リストに `authorized-canon-writer-steps.test.ts` が漏れている

`src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` は `authorizedCanonWriterSteps` を `canon-provenance.ts` から import してテストする。T-03 が `authorizedCanonWriterSteps` を `canon-provenance.ts` から削除するため、この test file はコンパイル失敗する。

T-03 の acceptance criteria「`authorizedCanonWriters` と `authorizedCanonWriterSteps` が `src/` に存在しない」を満たすためには、このテストファイルも削除する必要がある。

T-12 の delete リストには `bite-evidence/__tests__/` や各 runtime テスト等は明示されているが、`authorized-canon-writer-steps.test.ts` は記載がない。T-03 の "grep して consumer が残っていないことを確認" という指示では「存在したら stop」と書かれており、test consumer がある場合に実装者が誤って `authorizedCanonWriterSteps` を残す可能性がある。

T-03 の acceptance criteria は "appears nowhere in `src/`" と書かれているため、最終的には正しい判断に至るが、T-03 の中間指示と acceptance criteria の間に矛盾があり、混乱の余地がある。

→ T-03 の grep 確認指示に「test consumer は削除対象、production consumer のみが stop 条件」と明記すること、または T-12 の delete リストに `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` を追加することで解消できる。

### Finding F-02: test-cases.md Summary の automated/manual 合計が total と不整合

Summary yaml:
```yaml
total: 45
automated: 37
manual: 7
```

37 + 7 = 44 ≠ 45。TC-045 は category: "gate" であり automated にも manual にも計上されていないため 1 件分の差異がある。gate は機械実行されるチェックなので automated に含めるべきか、あるいは total を 44 に修正するべきである。

実装への影響はないが、文書の正確性として指摘する。
