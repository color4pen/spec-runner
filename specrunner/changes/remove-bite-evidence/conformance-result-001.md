# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### R-1: implementer → verification（直接ルーティング）

`src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に `implementer / "success" → verification` の
unguarded 行が 1 行だけ存在することを確認。以前の guarded 行（`isTestGenExempt`、
`verificationFailedLast`）および bite-evidence 4 行（passed / strategy-deferred / failed / error）が
すべて削除されている。総行数 39（旧 45）。

テスト: `src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts`（TC-036/037）、
`tests/unit/core/pipeline/pipeline.transitions.test.ts` で new-feature / exempt / re-entry /
error シナリオを網羅。

### R-2: bite-evidence が登録ステップでない

- `src/kernel/step-names.ts`: `STEP_NAMES` に `BITE_EVIDENCE` キーなし。`CLI_STEP_NAMES` は
  `["verification", "pr-create"]` のみ。
- `src/core/pipeline/registry.ts`: `STANDARD_DESCRIPTOR.steps` / `.roles` に bite-evidence なし。
- `src/prompts/pipeline-map.ts`: `PIPELINE_MAP` に bite-evidence 行なし（implementer の次が verification）。
- `src/core/step/bite-evidence/` ディレクトリ削除済み。

テスト: `src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts`（TC-038）。

### R-3: レガシー resume → verification 解決

`src/core/resume/resolve-step.ts` の `LEGACY_STEP_ALIASES` に
`"bite-evidence": STEP_NAMES.VERIFICATION` が登録されており、`--from` / `resumePoint.step` /
`state.step` の 3 経路すべてで適用されることを確認。

テスト: `tests/unit/core/resume/resolve-step.test.ts`（T-13 スイート）で 3 経路すべてをカバー。
チェックポイント付け（TC-036）も確認済み。

### R-4: レガシー state / journal データの読み取り継続

**state.json（TC-010）**: `JobState.biteEvidence` フィールド（`BiteEvidenceRecord[]`）が
`src/state/schema/types.ts` に `@legacy-read-only` として残存。`"strategy-deferred"` が
`Verdict` union に `@legacy-only` で残存。`src/state/__tests__/bite-evidence-schema.test.ts`（TC-019）
で JSON ラウンドトリップを確認。

**journal fold + attestation（TC-011）**: `event-journal.ts` の fold ロジックはステップ名を
動的 key として扱うため step 名固定の lookup はない。`buildAttestation`（`src/core/attestation/
build-attestation.ts`）も step-attempt を汎用処理する。システム動作は正しいと推定されるが、
**bite-evidence step 名と strategy-deferred verdict を含む合成 journal から fold して attestation を
生成する専用テストが存在しない**（Finding F-001 参照）。

**新規レコードなし（TC-012）**: `biteEvidence` を書き込む producer がコード上に存在しないこと、
`src/core/pipeline/round-git-scope.ts` の `pipelineManagedPaths()` に `biteEvidenceResultPath`
が含まれないことを確認。

### R-5: biteEvidence 設定キーで CONFIG_INVALID

`src/config/schema/validation.ts` の `checkRemovedAssuranceDimension` が
`"biteEvidence" in (minimumAssurance as Record<string, unknown>)` でキー存在を検査（値に
よらず null でも検出）。

テスト: `tests/unit/config/schema-minimum-assurance.test.ts`（required / optional / null の
3 ケース）。

### R-6: archive floor = testDerivation + specReview のみ

`src/core/archive/achieved-assurance.ts` の `AssuranceProvenanceRuntime` が
`Pick<RuntimeStrategy, "readFileAtCommit">` に絞り込まれ、`deriveAchievedAssurance` は
`specReview` / `testDerivation` のみを処理（テスト実行なし）。
`src/state/profile.ts` の `STANDARD_PROFILE.assurance` が
`{ testDerivation: "frozen", specReview: "required" }` のみ。

テスト: `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts` 他。

### R-7: bite-evidence 専用設定 / runtime サーフェスの削除

`src/core/port/runtime-strategy.ts` から `listChangedFilesBetweenCommits`、
`runTestsAtCommit`、`runTestsOnSynthesizedTree`、`IsolatedTestResult` が削除済み。
`listCommitChangedFiles`、`readFileAtCommit` は残存。
`verification.scopedTestCommand` / `scopedTestPatterns` は zod スキーマに存在せず
（unknown keys として除去）、含む設定でも検証成功。

テスト: `src/config/__tests__/remove-bite-evidence-config-validation.test.ts`（TC-041）。

### R-8: bite-evidence-result.md アーティファクトを管理しない

`src/core/pipeline/round-git-scope.ts` の `pipelineManagedPaths()` の戻り値が
`[slugStateJsonPath, slugEventsPath, usageJsonPath, prCreateResultPath]` のみで
`biteEvidenceResultPath` を含まないことを確認。

テスト: managed-paths ユニットテストスイートで TC-021 を網羅。

### R-9: ドキュメントがパイプラインと一致

- `README.md`（74–83 行）: ステップ 1–10 に bite-evidence なし。
- `docs/configuration.md`（216–227 行）: "Removed keys" セクションで
  `archive.minimumAssurance.biteEvidence` → CONFIG_INVALID を記載。
  `verification.scopedTestCommand/scopedTestPatterns` → 無視を記載。
- `src/prompts/pipeline-map.ts`: PIPELINE_MAP に bite-evidence 行なし。
- `architecture/domain-model.md`: 旧 "bite-evidence gate" 参照を削除済み。
- `specrunner/project.md`: bite-evidence の記述なし。

TC-022（README）/ TC-023（設定リファレンス）はマニュアルカテゴリだが直接ファイル確認済み。

### 追加確認事項

- tasks.md の全チェックボックス: すべて完了（✅）を目視確認。
- `git diff main...HEAD --stat` で変更ファイルを確認し、上記以外の変更がないことを確認。
- レガシー互換スイート（`bite-evidence-schema.test.ts`、`bite-evidence-record-schema.test.ts`）が
  削除されずに残存していることを確認（TC-042）。

---

## 検証できなかった項目

**TC-011（must 優先度）**: `events.jsonl` に `bite-evidence` ステップの step-attempt
エントリ（`strategy-deferred` verdict を含む）を持つ journal を fold し、その attestation が
当該試行を含むことを検証する専用の自動テストが存在しない。システム動作は正しいと推定されるが、
規格 Scenario "legacy journal folds" の MUST 要件に対応するテストが未実装のため検証不能。

---

## Findings 詳細

### F-001: TC-011 未実装 — レガシー journal fold + attestation の自動テストが欠如

**対応ファイル**: `tests/unit/core/attestation/build-attestation.test.ts`
（または新規テストファイル）

**normative 根拠**: spec.md Requirement「legacy bite-evidence state and journal data shall
remain readable」の Scenario「legacy journal folds」：

> Given an `events.jsonl` containing step-attempt entries for the step `bite-evidence`,
> including one with verdict `strategy-deferred`
> When the journal is folded into job state
> Then the fold succeeds and the attestation built from it renders those attempts

**理由**: `build-attestation.test.ts` は TC-ATT-01〜07 をカバーするが、`bite-evidence`
ステップ名や `strategy-deferred` verdict を含む journal を使うケースがない。
`bite-evidence-schema.test.ts` は state.json パース（TC-019）のみ。
store/__tests__ も journal fold でこれらをテストしていない。

`event-journal.ts` の fold と `buildAttestation` がステップ名を汎用的に処理するため
動作は問題ないと推測されるが、must-priority の TC-011 に対応する自動テストが存在しない。

**修正**: `tests/unit/core/attestation/build-attestation.test.ts` などに TC-011 を追加し、
`bite-evidence` step 名と `strategy-deferred` verdict を含む合成 journalContent から
`buildAttestation` を呼び出し、`gates` に当該エントリが含まれることをアサートする。
