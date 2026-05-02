# spec-reviewer decisions — cli-finish-command (iteration 1)

- `specrunner ps --active` フラグの Requirement 欠落を HIGH completeness finding として指摘する :: delta job-state-store spec / tasks.md 11.2 が `--active` フィルタを参照するが、(a) 既存 cli-commands spec に `--active` Requirement なし、(b) delta cli-commands spec の ADDED Requirement にも `--active` 定義なし、(c) `src/cli/ps.ts` 実装にもフラグなし。spec が self-consistent でない
- gh `mergeStateStatus` の safe default を MEDIUM consistency finding として spec.md 本文への追記対象にする :: design.md Decisions §7 に書かれているだけで Requirement / Scenario レベルで MUST 化されていないため、未知値で throw する実装が許容されてしまう
- `gh pr create --body-file <tempfile>` 規約違反を MEDIUM completeness finding として指摘する :: review-lessons の再発検出項目で、`--body "<inline>"` を許容すると後続レビューで HIGH に昇格しうる。spec.md / tasks.md の archive PR コマンド例を `--body-file` 形式に揃える必要
- LLM 不使用 Scenario の network 範囲記述を MEDIUM maintainability finding として精緻化させる :: 「Anthropic API 呼び出し 0」だけでは `git push` / `openspec` の network 接続を assertion で扱えない。grep ベースの static check に明示的に倒す
- usage 出力の 6 サブコマンド列挙順を LOW maintainability finding として固定させる :: 既存 doctor spec が「5 サブコマンド」順を暗黙固定しているのに対し、delta MODIFIED が順序を明示しないため `finish` の挿入位置が implementer 任意になる
- module-architect decisions の tasks.md §1 への下ろし漏れを LOW maintainability finding として指摘する :: review-lessons「module-architect decisions が tasks の冒頭タスクに具体作業として下りているか」に該当。R1/R3 が tasks に未反映
- security category は skipped 扱いで weight 再正規化する :: review-standards.md「skipped の場合、…他エージェントのスコアのみで加重合計を再計算する。デフォルトスコアの代入は禁止」に従い、weighted sum を 0.85 で再正規化（5.90/0.85 ≈ 6.94）。HIGH≥1 のため verdict は pass threshold とは無関係に needs-fix で固定
