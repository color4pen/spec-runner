# Spec Review Result: job-cancel-command (Round 2)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## Summary

前回レビュー (spec-review-result-001) の needs-fix 判定根拠 F-1 および軽微指摘 M-1 / M-2 がすべて解消されていることを確認した。新規ブロッカーなし。

---

## 前回指摘の解消確認

### F-1: `--purge` + `canceled` idempotent case の矛盾 → ✅ 解消

`specs/cli-commands/spec.md` の `canceled` status dispatch 行:

> "state file は touch しない (`--purge` 指定時は例外: state file を削除する)"

の文言が追加済。`tasks.md` Task 3.1 (line 114) にも
`"`canceled` (idempotent) case でも `--purge` 指定時は cleanup 後に state file を削除する`"` が追記済。
spec と tasks が一致している。

### M-1: `specrunner rm` top-level シナリオの欠落 → ✅ 解消

`specs/cli-commands/spec.md` に以下のシナリオが追加済:

```
#### Scenario: `specrunner rm` を実行した場合

- **WHEN** ユーザーが `specrunner rm <jobId>` を実行する
- **THEN** `Unknown command: rm` を stderr に出し exit code 2 で終了する
```

受け入れ基準 ("`specrunner rm` は unknown subcommand エラーで exit する") を spec が完全にカバーするようになった。

### M-2: managed mode の scope-out 未明記 → ✅ 解消

`request.md` の「スコープ外」セクション (line 88) に追記済:

> - **managed mode の cancel 時 session 明示終了** (= `running` job cancel 時に Anthropic 側 session を API で終了する操作、現状は session 自動 expire に委ねる)

design.md D4 の設計判断との境界が明確になった。

---

## 今回の全体レビュー

### 網羅性

受け入れ基準 14 項目すべてについて spec / tasks カバレッジを確認した:

| 受け入れ基準 | カバー箇所 |
|---|---|
| 各 status の cancel 動作 | cli-commands/spec.md status dispatch 表 (全 6 status) |
| `archived` → reject | spec 表 + Scenario |
| `awaiting-merge` + no `--force` → reject | spec 表 + Scenario |
| `--purge` → state file 削除 | spec 別 Requirement + Scenario |
| `--all-terminated [--yes]` | spec 別 Requirement + Scenario |
| `archived` が `--all-terminated` 対象外 | --all-terminated Scenario で `archived` 1 件残存を明示 |
| state file に `canceled` / `USER_CANCELED` / `canceledAt` | cli-commands 共通ルール + job-state-store/spec.md |
| worktree 削除 | cli-commands 共通ルール |
| local / remote branch 削除 | cli-commands 共通ルール |
| `assertJobFinishable` hint 更新 | cli-commands/spec.md 末尾 Requirement + Scenario |
| `job rm` / `specrunner rm` → unknown error | cli-commands/spec.md に両 Scenario あり |
| `git ls-files src/cli/rm.ts ...` が空 | tasks.md Task 7.1 |
| `bun run typecheck && bun run test` green | tasks.md Task 9 |

### 整合性

design.md D1–D9 の設計判断と tasks.md / specs/ の一致を検証した:

- **D1 (VALID_TRANSITIONS)**: tasks.md 1.2 の transition 定義と一致。`running → canceled`、`awaiting-merge → canceled` が追加される。
- **D2 (pid kill)**: tasks.md `gracefulKill` の SIGTERM → 100ms polling → SIGKILL フローと仕様が一致。
- **D3 (remote branch 削除 best-effort)**: spec の "best-effort" 記述と design の "exit code 0 を維持" が一致。
- **D5 (BULK_CLEANUP_STATUSES)**: `{failed, terminated, canceled}` で `archived` 除外が spec / design / tasks で一致。
- **D6 (schema 拡張)**: job-state-store/spec.md の `canceledAt?: string` (optional) と tasks.md 1.1 が一致。

### セキュリティ観点

| 観点 | 評価 |
|---|---|
| `process.kill(state.pid)` | pid は XDG_DATA_HOME の user-owned state file から取得。EPERM は warning で続行。自分のプロセスへの signal のみ有効。問題なし |
| branch 名の shell injection | spawn は配列引数形式を使用予定 (tasks.md のパターンは既存 finish orchestrator と同様)。shell interpolation なし。問題なし |
| `--all-terminated` 誤削除 | TTY: y/N 確認、non-TTY: `--yes` 必須。誤実行への防御あり。問題なし |
| jobId path traversal | state file パスが `~/.local/share/specrunner/jobs/<jobId>.json` になるため、`../` を含む jobId は任意ファイル読み取りに悪用されうる。ただし本ツールは single-user developer CLI であり、攻撃者が state file を書き換えられる時点で他の攻撃経路も存在する。開発者 CLI として許容範囲 |

### 軽微な観察 (non-blocking)

#### O-1: `delta/cli-commands.md` の `canceled` 行が `--purge` 例外を欠いている

`delta/cli-commands.md` line 22:
```
| `canceled` | idempotent: worktree/branch の cleanup のみ実行 (state file は touch しない) |
```

`specs/cli-commands/spec.md` line 14 では `--purge` 例外が追加済だが、delta ファイルには反映されていない。delta ファイルは変更記述子であり implementer が参照する主要ドキュメントは spec file のため実装への影響はない。

#### O-2: `--purge` と `--all-terminated` の相互排他が formal spec に記載なし

tasks.md Task 4.1 には "「`--purge` と `--all-terminated` の排他 (bulk は常に purge 相当のため flag 不要)」" と記載があるが、cli-commands/spec.md の Requirement にこの制約の明示がない。`--all-terminated` が state file 物理削除を行う旨は spec に記載済のため実装者は意図を把握できるが、明示的な "両フラグ同時指定時の動作" を spec に追記すると将来の混乱を防げる。

---

## 確認済み (問題なし)

- delta-spec-validation-result: approved 済
- `specrunner job cancel --help` 行の `job rm → job cancel` 置換
- worktree guard 対象外 (`cancel` は linked worktree 内から実行可能) の明示
- `src/core/rm/` 削除タスクの task 7.1 カバレッジ
- schema backward compat: `canceledAt` は optional field で既存 state file に absent = OK
