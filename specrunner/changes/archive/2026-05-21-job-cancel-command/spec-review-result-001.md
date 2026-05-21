# Spec Review Result: job-cancel-command

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## Summary

仕様全体の構造・網羅性・整合性は高い。design.md の設計判断 (D1–D9) は根拠が明確で、
tasks.md の実装タスクも十分に詳細。ただし 1 件の仕様上の曖昧さ（実装者が矛盾する動作を生む可能性あり）と
2 件の軽微な spec カバレッジ不足を確認したため needs-fix とする。

---

## 要修正 (needs-fix 判定根拠)

### F-1: `--purge` + `canceled` idempotent case が矛盾している

**対象**: `specrunner/changes/job-cancel-command/specs/cli-commands/spec.md`、および `tasks.md` Tasks 3.1

**問題**:

spec と tasks に相互矛盾する 2 つのルールが存在する。

| ルール | 記載箇所 |
|---|---|
| `canceled` status → "idempotent: worktree/branch の cleanup のみ実行 (state file は **touch しない**)" | specs/cli-commands/spec.md (status dispatch 表) |
| `--purge` → "cancel 動作の後に state file を **物理削除する**" | specs/cli-commands/spec.md (--purge Requirement) |
| tasks: "`--purge` 指定時: cleanup + state 更新の**後に** `JobStateStore.delete(jobId)` で物理削除" | tasks.md Tasks 3.1 |

`--purge` を指定して既に `canceled` な job に `job cancel` を実行した場合:
- "touch しない" を優先 → state file は残る (ユーザーが `--purge` を指定したのに)
- `--purge` を優先 → state file は削除される (意味的に正しいが spec 違反)

実装者によって動作が分かれる可能性があり、テストケースも書きにくい。

**修正方針**: specs/cli-commands/spec.md の `canceled` status dispatch 行に一文追加:
> "state file は touch しない (`--purge` 指定時は例外: state file を削除する)"

tasks.md 3.1 の `--purge` 説明にも同様に:
> "`canceled` (idempotent) case でも `--purge` 指定時は cleanup 後に state file を削除する"

---

## 軽微な指摘 (実装への影響は低いが記録)

### M-1: `specrunner rm` top-level のシナリオが spec にない

**対象**: 受け入れ基準 + specs/cli-commands/spec.md

受け入れ基準に「`specrunner rm` は unknown subcommand エラーで exit する」とあるが、
specs/cli-commands/spec.md のシナリオは `specrunner job rm <jobId>` のみをカバーしており、
top-level `specrunner rm` のシナリオがない。

実コード確認済: `command-registry.ts` に top-level `rm` は存在しない (`job` の subcommand のみ)。
したがって `specrunner rm` はパーサーレベルで "Unknown command: rm" 扱いとなる。
実装上は問題ないが、spec が受け入れ基準を完全に網羅していない。

**修正方針** (任意): 既存の `specrunner job rm` scenario の隣に scenario を追加:

```
#### Scenario: `specrunner rm` を実行した場合

- **WHEN** ユーザーが `specrunner rm <jobId>` を実行する
- **THEN** `Unknown command: rm` を stderr に出し exit code 2 で終了する
```

### M-2: managed mode での `running` job cancel 時のセッション未終了が scope-out に明示されていない

**対象**: request.md スコープ外セクション

design.md D4 には「SessionDeleteClient は cancel では不要 (managed mode session は cancel で削除しない)」と明記されているが、
request.md の「スコープ外」セクションには記載がない。

managed mode で `running` 中の job を cancel した場合、ローカルプロセスは SIGTERM/SIGKILL されるが
Anthropic 側の managed session は自動 expire まで残存する。
意図的な設計判断だが、request.md のスコープ外に一行追記すると後継 issue との境界が明確になる。

**修正方針** (任意): request.md の「スコープ外」に追記:
> - **managed mode の cancel 時 session 明示終了** (= `running` job cancel 時に Anthropic 側 session を API で終了する操作、現状は session 自動 expire に委ねる)

---

## 確認済み (問題なし)

- **VALID_TRANSITIONS 拡張 (D1)**: `running → canceled`、`awaiting-merge → canceled` の追加は lifecycle.ts の既存定義と整合。`assertJobFinishable` の `canTransition(status, "archived")` ロジックへの副作用なし。
- **`--all-terminated` の対象から `archived` 除外**: BULK_CLEANUP_STATUSES = `{failed, terminated, canceled}` で明示。旧 `ALLOWED_STATUSES = {failed, terminated, archived}` からの変更差分が設計・タスク・spec で一致。
- **status dispatch の動作定義**: 7 ステータス全て (running / awaiting-resume / awaiting-merge / failed / terminated / archived / canceled) をカバー。
- **delta-spec-validation-result**: approved。delta path・フォーマット適合済。
- **`assertJobFinishable` hint 更新**: `src/core/finish/job-state-update.ts` の現行コード (`specrunner job rm`) と要件の乖離を確認。tasks 6.1 で `specrunner job cancel <jobId>` への修正が正しく定義されている。
- **セキュリティ**: `state.pid` はユーザー所有の XDG_DATA_HOME (`~/.local/share/specrunner/jobs/`) に格納。`process.kill()` は他ユーザーの PID に対し EPERM で失敗 (best-effort warning 扱い)。開発者 CLI として許容範囲。remote branch 削除の best-effort 扱いも同様に適切。
- **DI 設計 (D4)**: `CancelDeps` は `spawn / worktreeManager / sleep / kill / isAlive / repoRoot` で構成。テスタビリティ確保。
- **スキーマ backward compat**: `canceledAt?: string` は optional field。`validateJobState` は変更不要。既存 state file との互換性あり。
