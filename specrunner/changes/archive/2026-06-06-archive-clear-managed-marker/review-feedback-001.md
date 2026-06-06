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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | correctness | src/core/archive/orchestrator.ts | 両 `fs.unlink` の catch ブロックが全エラーを silent に握り潰している。ENOENT 以外のエラーでも `stderrWrite` が呼ばれず、D3・T-01 AC・要件 R3「warning のみ」を満たしていない。コメントも "ENOENT → no-op" と書かれているが実装は全 error を no-op にしている。 | 各 catch を `(err) =>` で受け取り、`(err as NodeJS.ErrnoException).code === "ENOENT"` なら silent、それ以外は `stderrWrite(\`Warning: failed to delete ...\`)` を出して処理を継続する。managed.ts の `clearManagedMarker` ではなく cancel の `cleanupJobResources` パターン（ENOENT 分岐あり）に合わせる。 | yes |
| 2 | low | testing | src/core/archive/__tests__/orchestrator.test.ts | ENOENT 以外の失敗時に warning が出ることを検証するテストが存在しない。T-02 AC「ENOENT 以外の error で reject しても `{ exitCode: 0 }` で stderr に warning が出ることを検証する」が未達。T-03a/b/c は全て ENOENT エラーのみで warning 不在の assertion もない。 | ENOENT 以外（例: `EACCES`）で reject する unlink mock を使い、`stderrSpy`（`process.stderr.write`）に warning 文字列が含まれることを assert するテストを追加する。liveness と marker それぞれ、または両方同時に失敗するケースを 1〜2 件追加すれば十分。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 5 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.35

## Summary

D1（削除を `if (worktreePath)` 外に配置）、D2（repoint の撤去）は正しく実装されており、構造・import・ファイルパス計算はすべて仕様通り。typecheck・test も全件 green。

ブロッキング問題は 1 件: **D3 の「ENOENT 以外 → warning」が実装されていない**。catch ブロックが `error.code` を見ておらず、EACCES 等の実際の失敗も silent に流れる。要件 R3 との乖離。

修正は小さい（catch 内に 3 行の ENOENT 分岐を追加し、対応テストを 1〜2 件追加）。アーキテクチャ変更は不要。
