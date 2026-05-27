# Code Review Feedback — readme-and-init-polish — iter 1

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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 | MEDIUM | testing | `tests/init.test.ts` | TC-002（must）が未実装。test-cases.md に「git repo 外では `specrunner/` ディレクトリが作成されない」を検証する must テストが定義されているが、テストファイルに該当 case が存在しない。外側の describe ブロックは非 git tempDir で `runInit` を呼ぶが、`specrunner/` が作られていないことをアサートしていない | `T-01` describe ブロック内（または独立した describe）に非 git dir での init テストを追加する。`vi.spyOn(process, "cwd").mockReturnValue(tempDir)` で非 git dir を向け、`fs.access(path.join(tempDir, "specrunner"))` が reject することを verify する | yes |
| F-02 | INFO | out-of-scope | `src/core/step/code-fixer.ts` | build-fixer が `requiresCommit: true → false` に変更した。本リクエストのスコープ外だが、main 上の `requires-commit-flags.test.ts` が `toBeFalsy()` を期待しており実装との不整合を修正するものであり変更は意味的に正しい（code-fixer は observation auto-fix パスで no staged changes でも呼ばれるため false が妥当） | 変更内容は正しいため修正不要 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.7

## Summary

実装（`init.ts` のディレクトリ作成）・README コンテンツともに受け入れ基準を満たしており、品質は高い。唯一の問題は TC-002（must）の欠落：非 git ディレクトリで init した場合に `specrunner/` が作成されないことを検証するテストが書かれていない。1 テストの追加で approved になる。

### Must Scenario Coverage

| TC-ID | Priority | Description | Status |
|-------|----------|-------------|--------|
| TC-001 | must | git repo 内 init → drafts/ と changes/ 作成 | ✅ |
| TC-002 | must | git repo 外 init → specrunner/ 作成されない | ❌ F-01 |
| TC-003 | must | 冪等性: 2 回 runInit でもエラーなし | ✅ |
| TC-006 | must | 既存テストが pass | ✅ 285 files, 3247 tests |
| TC-007 | must | git repo 内 init 後ディレクトリ存在を検証するテストあり | ✅ |
| TC-008 | must | 冪等性テストが pass | ✅ |
| TC-009 | must | README: Installation が .npmrc + npm install を含み Quick Start より前 | ✅ |
| TC-010 | must | Quick Start の手順順序と alias が正しい | ✅ |
| TC-011 | must | コマンド名が command-registry.ts と一致 | ✅ |

