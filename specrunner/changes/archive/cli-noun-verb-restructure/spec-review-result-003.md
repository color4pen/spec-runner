# Spec Review Result 003

- **change**: cli-noun-verb-restructure
- **reviewer**: spec-reviewer agent
- **date**: 2026-05-20
- **verdict**: approved

---

## spec-review-result-002 指摘の解消確認

| ID | 指摘内容 | 解消状況 |
|---|---|---|
| HIGH-1 | Renamed Requirement body 継承の曖昧性 | ✅ tasks.md Task 8 に `## Renamed` body 継承挙動の詳細注記 + 影響テーブルを追加。merger 定義と body 取りこぼし有無が明示された |
| HIGH-2 | jobId UUID 検証が delta spec の Requirement に不在 | ✅ `cli-commands/spec.md` L281-295 に `Requirement: job サブコマンドは jobId 引数を UUID 形式で検証する` を追加。path traversal 防止 Scenario・正常 UUID 受理 Scenario とも定義済み |
| MEDIUM-3 | Task 2b が dependency 図に未記載 | ✅ dependency 図に `Task 2b (slug/jobId validation)─┤← Task 1,2,3 完了後、Task 2 と並列可` として追記 |
| MEDIUM-4 | Hint 文 rename 漏れが tasks に未記載 | ✅ Task 6 に "Stale string updates (must do in this task)" セクションを追加。`run.ts` Hint 文 `request list → request ls` および `MANAGED_RESET_USAGE → RUNTIME_RESET_USAGE` の更新を明示 |

---

## 網羅性（再確認）

request.md の 22 AC を delta spec / design.md / tasks.md で追跡:

| # | AC | 対応箇所 | Status |
|---|---|---|---|
| 1 | `request new/generate/ls/show/rm/validate/template/review` 動作 | delta L72-114, Task 2, design AD-5/AD-6/AD-7 | ✅ |
| 2 | `job start/ls/show/rm/resume/finish` 動作 | delta L115-154, Task 3 | ✅ |
| 3 | `run <slug>` 唯一 alias | delta L155-162, Task 4, design AD-3 | ✅ |
| 4 | 旧 top-level `ps/rm/resume/finish` 削除 | delta L7/L14-27, Task 4 | ✅ |
| 5 | `runtime setup/status/reset` 同等動作 | managed-cli-commands delta 全体, Task 5 | ✅ |
| 6 | 旧 `managed` Unknown command | managed-cli-commands delta L24-27, Task 5 | ✅ |
| 7 | `job start/resume/finish` worktree guard | delta L164-178, Task 1, design AD-2 | ✅ |
| 8 | `job ls/rm` worktree 内 OK | delta L175-188, Task 1 | ✅ |
| 9 | `request review/validate <slug>` 解決 | delta L95-103, Task 2, design AD-8 | ✅ |
| 10 | `job start <slug>` slug/file 両受け | delta L130-138, Task 3 | ✅ |
| 11 | `--help` 主語別グルーピング | delta L29-70, Task 6, design AD-10 | ✅ |
| 12 | README 新体系 | Task 7 | ✅ |
| 13 | `cli-commands` delta update | specs/cli-commands/spec.md, Task 8 | ✅ |
| 14 | `cli-finish/resume-command` delta update | specs/cli-finish-command, cli-resume-command, Task 8 | ✅ |
| 15 | `managed-cli-commands` delta update | specs/managed-cli-commands/spec.md, Task 8 | ✅ |
| 16 | 旧 `request create` Unknown | delta L87/L105-108 | ✅ |
| 17 | 旧 `request list` Unknown | delta L88/L110-113 | ✅ |
| 18 | `request show <slug>` 本文出力 | delta L216-231 | ✅ |
| 19 | `job show <jobId|slug>` 主要フィールド出力 | delta L253-279, Task 3, design AD-5 | ✅ |
| 20 | `job unknown` エラーメッセージ | delta L150-153, Task 3 | ✅ |
| 21 | `typecheck && test` green | Task 9 | ✅ |
| 22 | ADR 5 判断記録 | Task 10 | ✅ |

**AC 22/22 全カバー**。

---

## 整合性（再確認）

- design.md AD-1〜AD-10 と tasks.md Task 1〜10 の 1:1 対応は変化なし
- Task 8 の body 継承注記により「merger が Renamed をどう解釈するか」が明文化され、HIGH-1 の実装リスクが除去された
- delta-spec-validation-result.md: approved（canonical パス・フォーマット準拠）
- `## Renamed` FROM 文字列 18 件は前回レビューで main spec との一致を確認済み

---

## セキュリティ（再確認）

| 観点 | 状態 |
|---|---|
| slug path traversal (`../../`)  | ✅ `/^[a-z0-9][a-z0-9-]{0,63}$/` で全 5 コマンドに適用。delta spec L297-309 に Requirement + 2 Scenario |
| jobId path injection (`../`)    | ✅ `/^[a-f0-9-]{36}$/` で 4 コマンドに適用。delta spec L281-295 に Requirement + 2 Scenario（HIGH-2 解消） |
| `request rm` 再帰削除の防止     | ✅ slug validation で事前に弾く。Scenario で FS 操作不実行を明記 |
| worktree 内からの `job start`   | ✅ `guardedSubcommands` 機構で subcommand dispatch path も guard。delta spec L164-178 |

---

## 総合所見

spec-review-result-002 で指摘した 4 件（HIGH ×2、MEDIUM ×2）がすべて specs・tasks の両レイヤーで解消済み。AC 22/22 カバー、3 層（delta spec / design.md / tasks.md）の整合、セキュリティ Requirement の完全性とも問題なし。実装フェーズに進める状態にある。
