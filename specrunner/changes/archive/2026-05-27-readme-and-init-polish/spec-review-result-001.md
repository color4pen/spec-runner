# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Testability | tasks.md (T-02) | `process.chdir` はプロセスグローバル状態を変更するため、vitest の並列実行環境でフレイキーになるリスクがある。タスクは `vi.spyOn` か `process.chdir` を同列に挙げているが、`process.chdir` を選んだ場合は `afterEach` でのリストアが必須になる。 | 実装時に `vi.spyOn(process, 'cwd').mockReturnValue(tempDir)` を採用すること。`process.chdir` を使う場合は `afterEach` で元のディレクトリへ戻す (`process.chdir(originalCwd)`) こと。 |
| 2 | LOW | Spec Coverage | tasks.md (T-03) | README Quick Start では `npx` プレフィックスを使っているが、`npm install -g` でグローバルインストールした場合は `npx` 不要。ユーザーが混乱するケースがある。 | Installation セクションに "グローバルインストール後は `npx` を省略できる" 旨を一言添えると親切。スコープ内で対応可能。 |

## Review Summary

**対象アーティファクト**: request.md / design.md / tasks.md / specs/cli-commands/spec.md

**一致性チェック**:
- request.md の受け入れ基準 → design.md の Goals → tasks.md の実装タスク → delta spec のシナリオ、すべて一貫している。
- `init.ts` の現状実装（git rev-parse → repoRoot 取得）と設計の「既存の git guard を再利用」が整合している。
- `draftPath(slug)` = `specrunner/drafts/<slug>/request.md` は `request-new.ts` と `paths.ts` で確認済み。T-03 step 4 のパス記述は正確。
- コマンド名（`request new`, `run`, `job finish`）は `command-registry.ts` の USAGE と一致。

**セキュリティ**:
- init で作成するディレクトリ（`specrunner/drafts/`、`specrunner/changes/`）はハードコードされた相対パスであり、ユーザー入力に依存しない。パストラバーサルリスクなし。
- `repoRoot` は `git rev-parse --show-toplevel` の出力（信頼済み）。
- README 変更はコード変更を含まないため、セキュリティ上の影響なし。

**スコープ判断**: spec-change として適切。既存アーキテクチャへの影響は init の副作用追加のみで最小限。ADR 不要の判断も妥当。
