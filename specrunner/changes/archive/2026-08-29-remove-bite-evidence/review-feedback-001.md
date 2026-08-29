# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Diff スコープ確認

- `git diff main...HEAD --stat` を確認。108 ファイル変更、4614 追加・10904 削除。
- touched-files リストと diff stat の範囲が一致することを確認。

### 設計文書確認

- `design.md`（D1〜D12）と `tasks.md`（T-01〜T-13）を全読。
- `test-cases.md`（TC-001〜TC-045）を全読し、each TC の実装対応を追跡。

### Pipeline routing（TC-001〜TC-005、TC-036、TC-037、TC-038）

- `src/core/pipeline/types.ts`：`STANDARD_TRANSITIONS` に bite-evidence 行がないことを確認。`implementer/success → verification` が単一の無条件行（`when` なし）になっていることを確認。
- `src/core/pipeline/registry.ts`：`STANDARD_DESCRIPTOR.steps` / `roles` に bite-evidence がないことを確認。`FAST_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` にも bite-evidence がないことを確認（D1 規定通り）。
- `src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts`：TC-036・TC-037・TC-038 を確認。
- `tests/unit/pipeline/transition-when.test.ts`：TC-WHEN-02（行数 39 に減少）を確認。

### Legacy resume alias（TC-007〜TC-009、TC-036）

- `src/core/resume/resolve-step.ts`：`LEGACY_STEP_ALIASES["bite-evidence"] = STEP_NAMES.VERIFICATION` を確認。
- 3 つのブランチ（`from`・`resumePoint.step`・`stateStep`）全部に alias 写像が適用されることを確認。
- `tests/unit/core/resume/resolve-step.test.ts`：path 1〜3 すべてのテストを確認。

### Config validation（TC-013〜TC-015、TC-019、TC-032）

- `src/config/schema/validation.ts`：`checkRemovedAssuranceDimension` が key の存在（truthiness でなく `"biteEvidence" in obj`）でチェックすることを確認。
- `runSemanticChecks` に登録されていることを確認。
- `src/config/__tests__/remove-bite-evidence-config-validation.test.ts`：`scopedTestCommand`/`scopedTestPatterns` の黙認テストを確認。
- `tests/unit/config/schema-minimum-assurance.test.ts`：TC-038（`"required"`・`"optional"`・`null` で `CONFIG_INVALID`）を確認。

### Archive achieved-assurance（TC-016〜TC-018、TC-030、TC-031）

- `src/core/archive/achieved-assurance.ts`：biteEvidence 導出が完全に削除されていることを確認。
- `AssuranceProvenanceRuntime = Pick<RuntimeStrategy, "readFileAtCommit">` になっていることを確認。
- `deriveAchievedAssurance` のシグネチャに `config` 引数がないことを確認。
- `specReview` と `testDerivation` の fail-closed 動作が変わっていないことを確認。

### Profile / floor lattice（TC-017）

- `src/state/profile.ts`：`STANDARD_PROFILE.assurance = { testDerivation: "frozen", specReview: "required" }` のみになっていることを確認。`BITE_EVIDENCE_RANK`・`AssuranceFloor.biteEvidence` がないことを確認。
- `BiteEvidenceLevel` と `ProfileAssurance.biteEvidence` が `@legacy-read-only` コメント付きで残存していることを確認（D4）。

### Legacy state read path（TC-010、TC-011、TC-012）

- `src/state/schema/types.ts`：`JobState.biteEvidence`・`BiteEvidenceRecord`・`"strategy-deferred"` in `Verdict` がすべて残存し、`@legacy-read-only` コメントが付いていることを確認。
- `src/state/schema/operations.ts`：biteEvidence 配列バリデーションが `@legacy-read-only` コメント付きで残存していることを確認。
- `src/core/step/step-completion.ts`、`src/core/step/commit-orchestrator.ts`：write path が削除されていることを確認。
- `ParsedStepResult` から `biteEvidence` フィールドが削除されていることを確認（`src/core/port/step-types.ts`）。
- Legacy-compat suites（`src/state/__tests__/bite-evidence-schema.test.ts`、`tests/unit/state/bite-evidence-record-schema.test.ts`）が存在することを確認。

### Runtime primitives 削除（TC-020、TC-033、TC-034）

- `listChangedFilesBetweenCommits`・`runTestsAtCommit`・`runTestsOnSynthesizedTree`・`IsolatedTestResult` が `src/` に存在しないことを grep で確認。
- `listCommitChangedFiles`・`readFileAtCommit` 等の維持対象メソッドが `src/core/runtime/local.ts`・`src/core/runtime/managed.ts` に残っていることを確認。

### Step module 削除（D2）

- `src/core/step/bite-evidence/` ディレクトリが存在しないことを確認。
- `authorizedCanonWriters`・`authorizedCanonWriterSteps` が `src/` に存在しないことを確認（D3）。

### Documentation（TC-022、TC-023）

- `README.md`：bite-evidence・test-materialize・build-fixer の記述なし。
- `docs/configuration.md`：removed-keys note（`archive.minimumAssurance.biteEvidence` 拒否・`scopedTest*` 黙認）を確認。
- `src/prompts/pipeline-map.ts`：bite-evidence 行なし、implementer → verification の順になっていることを確認（drift guard テスト TC-034 で担保）。
- `architecture/domain-model.md`：bite-evidence の active gate 記述が削除されていることを確認。
- `tests/unit/architecture/arch-allowlist.ts`：`CWD-bite-evidence-step-di-default` エントリが存在しないことを確認。

### 検証結果

- `verification-result.md`：build・typecheck・test・lint・changed-line-coverage すべて passed を確認。

---

## 検証できなかった項目

- TC-040（ADR files unmodified）：ADR ディレクトリの diff を直接 `git diff` で確認していない。ただし diff stat に ADR パスが含まれていないため、実質確認済みとみなす。
- TC-043（no orphaned test fixtures）：fixture ディレクトリを全列挙して参照確認はしていない（manual TC のため）。
- TC-035（no orphaned temp-worktree helper）：`local.ts` の temp-worktree 関連コードの残存は grep 確認のみ（手動テストなし）。

---

## Findings 詳細

### F-001: stale false claim comment in `src/state/schema/types.ts` （medium）

`StepRun.commitOid` フィールドの JSDoc（line 228）に以下の記述が残っている：

```
* Used by the bite-evidence gate (R4) for OID-based operations, and by
* `conformanceApprovedForVerifiedRevision` to bind conformance approval to the
* specific revision that verification evaluated.
```

bite-evidence gate は削除されたため、前半の主張（`Used by the bite-evidence gate (R4) for OID-based operations`）は事実に反する。後半の `conformanceApprovedForVerifiedRevision` は依然正しい。

D12 では "grep sweep で bite が残っている箇所はすべて intentional legacy reference または historical documentation でなければならない" と要求しており、この記述は current-state claim（現在の使用用途の説明）であるため unintentional survivor に該当する。T-13 の grep sweep がこれを見逃している。

**対処**: bite-evidence gate への言及を削除し、`conformanceApprovedForVerifiedRevision` の説明のみ残すよう修正する。

---

### F-002: dead code in `tests/unit/core/pipeline/pipeline.episode-reset.test.ts` （low）

T-12 の「retarget」対象ファイルに相当するが、以下の残骸が残っている：

1. `steps Map` に `"bite-evidence"` ステップ定義（lines 232–238）— `STANDARD_TRANSITIONS` がルーティングしないため実行されない dead code。
2. executeSpy の `if (step.name === "bite-evidence")` ブランチ（例：line 201–203）— 同上で unreachable。
3. コメント（例：line 188–193）が旧フロー `implementer → bite-evidence → verification` を記述しており、現在の `implementer → verification` と乖離している。

テスト自体は正しく pass しているため correctness への影響はなし。ただし読者を誤解させる stale コードが残っている。

---

### F-003: changelog provenance comments using bite-evidence terminology （low）

以下 3 箇所に `"Added in bite-evidence-forward (R4)"` または `"retained from bite-evidence-forward R4"` の形でコード追加時期を示すコメントが残っている：

- `src/store/event-journal.ts:70`
- `src/state/helpers.ts:110`
- `src/core/runtime/local.ts:996`

これらは false claim ではなくコードの歴史的来歴を示す注記だが、D12 の grep sweep では bite が含まれる全ヒットが intentional legacy reference か historical documentation であることを確認する方針であり、微妙な境界事例である。functional 影響はない。
