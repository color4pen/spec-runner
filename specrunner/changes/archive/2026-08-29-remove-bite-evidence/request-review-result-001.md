# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. STANDARDパイプラインにおける bite-evidence ステップの存在確認

- `src/core/pipeline/registry.ts`（行 46-47）で `STANDARD_DESCRIPTOR.steps` に `[STEP_NAMES.BITE_EVIDENCE, BiteEvidenceStep]` が `implementer` と `verification` の間に定義されていることを確認。
- `STANDARD_TRANSITIONS`（`src/core/pipeline/types.ts` 行 253-264）で遷移が定義されていることを確認：
  - `implementer → BITE_EVIDENCE`（通常経路）
  - `BITE_EVIDENCE / passed → VERIFICATION`
  - `BITE_EVIDENCE / strategy-deferred → VERIFICATION`
  - `BITE_EVIDENCE / failed → escalate`

### 2. `STANDARD_PROFILE.assurance.biteEvidence = "required"` の確認

- `src/state/profile.ts` 行 119-122 で `_standardBody.assurance.biteEvidence = "required"` が定義されていることを確認。

### 3. bite-evidence ステップ実装の存在確認

- `src/core/step/bite-evidence/` ディレクトリに `step.ts`, `gate.ts`, `oids.ts`, `test-file-selection.ts`, `tamper.ts` が存在することを確認。
- `gate.ts` がリクエストで述べられた問題（EB↔HEAD変更ファイルをすべて対象にする、ファイル単位判定）を実装していることを確認。

### 4. アーカイブのbiteEvidence achieved-provenance導出

- `src/core/archive/achieved-assurance.ts` で `deriveAchievedAssurance()` が `biteEvidence` 次元の導出を行っていることを確認。
- この関数は `listChangedFilesBetweenCommits`, `runTestsOnSynthesizedTree`, `runTestsAtCommit` を使用して biteEvidence フロア評価を実行している。

### 5. `verification.scopedTestCommand` / `verification.scopedTestPatterns` の存在確認

- `src/config/schema/types.ts` 行 162, 172 で `VerificationConfig` インターフェースに両フィールドが定義されていることを確認。
- `src/config/schema/validation.ts` 行 290 で `scopedTestCommand` のバリデーションが定義されていることを確認。

### 6. Runtime primitives の production 用途確認

- `listChangedFilesBetweenCommits`, `runTestsAtCommit`, `runTestsOnSynthesizedTree` は `src/core/port/runtime-strategy.ts` で定義されていることを確認。
- これらのプリミティブを使用しているファイルを検索した結果：
  - `src/core/step/bite-evidence/gate.ts`（bite-evidence gate 本体）
  - `src/core/archive/achieved-assurance.ts`（`biteEvidence` フロア評価部分のみ）
  - テストファイル群（`src/core/runtime/__tests__/` 配下）
- `achieved-assurance.ts` での使用は `floorConstrainsBite` が true のとき（行 205-211, 316-319）にのみ実行されるため、`archive.minimumAssurance.biteEvidence` を削除すれば production 用途はなくなる。

### 7. `archive.minimumAssurance.biteEvidence` の設定スキーマ確認

- `src/config/schema/types.ts` 行 410-411 で `MinimumAssuranceConfig.biteEvidence` が定義されていることを確認。
- `src/core/archive/merge-then-archive.ts` ステップ 3.6（行 343-427）で実際に再テスト実行していることを確認。
- 現在は `biteEvidence` 設定が指定された場合にサイレントに floor 評価を実行する（explicit validation error を出さない）。

### 8. レガシー job 復帰の現状確認

- `src/core/resume/resolve-step.ts` 行 19-22 で `LEGACY_STEP_ALIASES` が `build-fixer` および `test-materialize` のみをマップしており、**`"bite-evidence"` エントリが存在しない**ことを確認。
- `bite-evidence` は現在 `CLI_STEP_NAMES`（`src/kernel/step-names.ts` 行 30-34）に含まれており、`--from bite-evidence` は現在成功するが、削除後は失敗する。
- 要件 7 の実装では `LEGACY_STEP_ALIASES` に `"bite-evidence": STEP_NAMES.VERIFICATION` を追加する必要がある。

### 9. レガシー状態の後方互換性確認

- `JobState.biteEvidence?: BiteEvidenceRecord[]`（`src/state/schema/types.ts` 行 563）が optional フィールドとして定義されており、既存の状態ファイルとの後方互換性が確保されていることを確認。

### 10. ドキュメント参照の確認

- `README.md` 行 79 でパイプラインステップ 7 として bite-evidence が記載されていることを確認。
- `docs/configuration.md` で `verification.scopedTestPatterns` および `archive.minimumAssurance.biteEvidence` の説明があることを確認。
- `src/prompts/pipeline-map.ts` 行 18 で agent に見せるパイプラインマップに bite-evidence が含まれていることを確認。

### 11. PR attestation の確認

- `src/core/pr-create/body-template.ts` の `workflowPhases` 配列（行 83-99）に bite-evidence は含まれておらず、PR 本文には bite record/candidate OID は表示されないことを確認。
- これはリクエストの背景説明（「PR attestationは具体的なbite record/candidate OIDを表示せず...」）と一致する。

### 12. fast pipeline / exempt type の確認

- `FAST_DESCRIPTOR`（`src/core/pipeline/registry.ts` 行 128-171）に bite-evidence ステップが含まれていないことを確認。
- 要件 2 の「fast / exempt typeを含む既存pipeline遷移に回帰がない」は、fast pipeline が変更対象外であることを示している。

## 検証できなかった項目

None。すべての主要な code assertion を直接確認した。

## Findings 詳細

指摘がない。リクエストの技術的な主張はすべてコードベースで検証済みであり、要件は達成可能かつ明確に定義されている。
