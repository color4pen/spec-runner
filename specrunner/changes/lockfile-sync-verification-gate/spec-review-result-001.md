# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ spec ファイル

- `specrunner/changes/lockfile-sync-verification-gate/request.md` — 背景・要件・受け入れ基準・architect 評価済み設計判断
- `specrunner/changes/lockfile-sync-verification-gate/design.md` — D1〜D8 全設計判断・Goals/Non-Goals・Risks・Migration Plan
- `specrunner/changes/lockfile-sync-verification-gate/spec.md` — 4 Requirement・6 Scenario の behavior spec
- `specrunner/changes/lockfile-sync-verification-gate/tasks.md` — T-01〜T-07 の実装タスクと Acceptance Criteria

### 確認した既存コード

- `src/util/detect-pm.ts` — `LOCKFILE_MAP`（5 エントリ）・`detectPackageManager`・`hasJsDependencyTraces` の実装
- `src/core/verification/changed-lines.ts` — `getChangedFilesAndLines` と `spawnGit`。T-02 が追加する `getChangedFileList` の seam を確認
- `src/core/verification/runner.ts` — `runVerification` / `runVerificationCommands` / `runVerificationPhases`。coverage gate 配線（L384-409 / L585-610）と `checkPackageJsonScriptsIntegrity`（L218-305）を精読
- `src/core/verification/changed-line-coverage.ts` — pure evaluator + orchestrator の二分割パターン（D8 の前例）
- `src/core/step/implementer.ts` — `buildImplementerInitialMessage` の testsMaterialized 両分岐（L82-124）
- `src/prompts/implementer-system.ts` — `IMPLEMENTER_SYSTEM_PROMPT` に依存追加・lockfile 同期指示が無いことを確認

### 確認した既存テスト

- `tests/unit/core/verification/runner-integrity.test.ts` — TC-INT-01〜TC-INT-15 を全読。TC-INT-07（commands path + baseBranch あり）が新 gate の配線後に影響を受けるかを精査
- `tests/unit/verification/runner-commands.test.ts` — TC-VR-01〜TC-VR-E02。`phases.toHaveLength(N)` の固定があることを確認
- `tests/unit/core/verification/runner.test.ts` — TC-005・TC-016 に `phases.length === 6` の固定があることを確認
- `tests/unit/core/verification/runner-coverage-gate.test.ts` — gate mock 方式の前例（TC-RCG-01〜08）
- `tests/unit/util/detect-pm.test.ts` — TC-PM-001〜TC-PM-010 の既存テスト確認

### 検証した論点

1. **commands 経路 / phases 経路の両方への gate 配線**：design D2 の分析と runner.ts の構造から、changed-line-coverage gate（L398/L599）と同型の配線で両経路をカバーできることを確認。

2. **既存テストへの影響**：
   - `runner.test.ts`（TC-005/TC-016）・`runner-commands.test.ts`（TC-VR-01〜TC-VR-07）はいずれも `baseBranch` 未指定で呼ぶため、gate が追加されず `phases.length` 固定テストは安全。
   - `runner-integrity.test.ts` TC-INT-02/TC-INT-07 は `baseBranch="main"` を渡すが、`phases.length` を固定しておらず `.some(...)` / 個別 phase チェックのみ。gate が `skipped` を返しても既存テストは壊れない。

3. **偽陽性回避**：D4 の canonical JSON 比較方式と T-03 の `depSectionsDiffer` 純関数の設計を検証。`scripts`/`version` のみの変更は 7 依存セクションに差が出ないため pass する仕様が spec.md Scenario と整合。

4. **検査対象外の扱い**：D6 の skip + note 方式と spec.md Requirement「検査不能を黙って pass 扱いにしない SHALL」の整合を確認。

5. **セキュリティ**：spawn は `shell: false` + `stripSecrets` パターン（既存 `checkPackageJsonScriptsIntegrity` および `spawnGit` と同じ）。新規 runtime 依存なし。

6. **既存 seam の再利用**：detect-pm / changed-lines / 直接 git spawn（`checkPackageJsonScriptsIntegrity` 前例）のいずれも再利用可能であることを確認。

## 検証できなかった項目

- 実装コードが存在しないため、`evaluateLockfileSync` / `runLockfileSyncGate` / `getChangedFileList` / `findLockfile` / `isLockfileName` の実際の挙動は未確認（spec-phase レビューのため）。
- `bun run typecheck && bun run test` の実行結果（実装前なので不可）。

## Findings 詳細

### F-01: spec.md の diff-unavailable シナリオで `skipped` が明示されていない（minor）

spec.md L52 の Scenario「diff 導出不能」の THEN 節は「status は failed にならず」という消極的表現のみで、`status === "skipped"` を明示していない。design D6 および tasks.md T-04 は明確に `skipped` と記述している。spec.md の記述がこれに追随していないため、テスト実装者が `status !== "failed"` のみをアサートすると `status === "passed"` でも spec.md 上は通過してしまう。→ tasks.md T-04 の Acceptance Criteria では `skipped` が明記されているため、実装レベルでの問題は小さい。spec.md の精度のみの指摘。

### F-02: `path.endsWith("package.json")` と `path.basename(...) === "package.json"` の精度差（minor）

tasks.md T-04 Step 2 では「`package.json` で終わるパス集合」と書かれており、実装者が `f.endsWith("package.json")` を選んだ場合、`some-package.json` のようなファイルも誤ってマッチする。spec.md の Requirement 1 には「workspace 配下の package.json を含む」とあり、`path.basename(f) === "package.json"` が意図に合致する。tasks.md に `basename` 比較を明示していないため、実装者の解釈次第で偽陽性が生じ得る。現実の git diff 出力では `*-package.json` は稀だが仕様の曖昧さとして記録する。

### F-03: `git show <baseBranch>:<path>` vs `git show origin/<baseBranch>:<path>` の不整合（minor）

既存の `checkPackageJsonScriptsIntegrity`（runner.ts L224）は `origin/${baseBranch}:package.json`（リモート追跡ブランチ）を使う。design D5 では新 gate が `git show <baseBranch>:<path>`（origin/ なし）を使うとしている。worktree 環境では fetch 済みが前提なので実害は小さいが、同一ファイル内で異なる ref 形式を混在させる理由が spec/tasks に明記されていない。実装の一貫性確保のため、どちらの形式を採用するかを tasks.md に明示することが望ましい。

### F-04: TC-INT-07 が lockfile-sync gate を暗黙に通過することへの注意（non-blocking）

runner-integrity.test.ts TC-INT-07（commands path + `baseBranch="main"`）は実装後に lockfile-sync gate が走る（mock の `git diff` が "ok" を返し、package.json が変更集合にないとして `skipped` になる）。テストのアサートは壊れないが、TC-INT-07 のコメント「commands path → no integrity check」の意図と、lockfile-sync gate が実際に起動（skip されて結果を返す）することの乖離が生じる。挙動は正しいが、TC-INT-07 が新 gate の追加後に phases 構造を明示的に検証しないため、将来の変更時に誤解の温床になり得る。

### F-05: セキュリティ — `path.join(cwd, pathFromDiff)` の path traversal（low risk）

git diff から得た repo-root 相対パスを `path.join(cwd, path)` で結合して HEAD 版 package.json を読む（tasks.md T-04 Step 4）。`path.join` は `..` を正規化するが `cwd` 外への traversal を防ぐ機構ではない。git diff 出力は通常リポジトリ内のパスに限定されるため現実的なリスクは極めて低い。ただし、spec/tasks にパス検証の言及がなく、設計ドキュメントに安全性の根拠が明示されていない。

### F-06: `getChangedFileList` の `baseBranch` デフォルト値は実質 dead code（trivial）

tasks.md T-02 では「`baseBranch` 未指定時は `"main"` を既定にする」と書かれているが、T-05 で gate が `baseBranch !== undefined` のガード後に呼ぶため、`getChangedFileList` には必ず defined な値が渡される。デフォルト値は呼び出し側からは到達しない。機能的問題はなく型シグネチャの一貫性（既存 `getChangedFilesAndLines` に合わせる）として保持するなら許容範囲だが、dead code であることを tasks.md に記載しておくと実装者の混乱を防げる。
