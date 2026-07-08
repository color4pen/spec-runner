# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `tests/core/worktree/detection.test.ts` | TC-005（must）・TC-006（must）が未実装。`detectSpecrunnerWorktree` の直接単体テストが存在せず、`mainCheckoutPath` の返り値が一切 assert されていない。resume.test.ts は exit 2 を確認するが、ヒントに埋め込まれる `mainCheckoutPath` の正確性（例：macOS symlink で `/private/tmp/...` になる場合など）は未検証 | `detection.test.ts` に `detectSpecrunnerWorktree` describe ブロックを追加。TC-005: tempDir 配下に `.git/specrunner-worktrees/<slug>-<id>` を実在ディレクトリとして作成し `isSpecrunnerWorktree: true` かつ `mainCheckoutPath === await fs.realpath(tempDir)` を assert。TC-006: `.git` がディレクトリの main checkout パスを渡し `isSpecrunnerWorktree: false` を assert。TC-009（fail-open）もまとめて追加すると低コスト | yes |
| 2 | low | maintainability | `src/core/command/resume.ts:89-90` | design.md D4「`worktreeGuardError("job resume", mainCheckoutPath)` のメッセージ／hint を出力」に対し、実装は独自文言を inline 出力している（"job resume cannot be run from inside a specrunner worktree." vs "This command cannot be run from inside a worktree."）。CLI dispatch 層ガードとメッセージが一致せず、将来の文言統一時に漏れが生じやすい | `worktreeGuardError("job resume", mainCheckoutPath)` が返す `SpecRunnerError` の `.message` / `.hint` を `logError` / `stderrWrite` へ渡す形に変更するか、意図的な差分として design.md に注記を追加する | yes |
| 3 | low | testing | `tests/unit/core/step/fast-scope-checkpoint.test.ts`, `tests/unit/core/pipeline/resolve-scope.test.ts` | TC-002（should）未実装：`makeFastScopeFromConfig()` を使いながら changed files に `.specrunner/config.json` を含めないケースの no-breach テストがない。また TC-007（should）・TC-008（should）も未実装 | TC-002: fast-scope-checkpoint.test.ts の no-breach describe に、`makeFastScopeFromConfig()` + 無害なファイルのみを changed files とするテストを追加する。TC-007・TC-009 は detection.test.ts の F-001 修正時にまとめて追加する | yes |
| 4 | low | maintainability | `tests/unit/core/step/fast-scope-checkpoint.test.ts:210`, `tests/unit/core/pipeline/resolve-scope.test.ts:10` | テストのコメントに「3 dogfooding surfaces」「declares 3 surfaces」と記載されているが、guard-config を加えて 4 surface になっている | コメントを 4 に更新する | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.65

## Summary

実装の核心は正しく、request.md の受け入れ基準 5 項目はすべて満たされている。

- `.specrunner/config.json` への `guard-config` surface 追加（TC-001/TC-010/TC-011/TC-012 green）
- `detectSpecrunnerWorktree` の fail-open 実装（path segment 照合・realpath 正規化）
- `ResumeCommand.prepare()` 最上部でのガード配置（state 解決・config 読み込み前に exit 2）
- dogfooding テストおよび fixture テストへの追記

ブロッキング問題は 1 件: `detectSpecrunnerWorktree` の直接単体テストがなく、`mainCheckoutPath` の正当性が未検証（F-001、high）。テスト追加のみで解決できる小さな修正であり、実装コード自体の誤りではない。F-002（worktreeGuardError 不使用）も合わせて直すと CLI dispatch 層との一貫性が高まる。
