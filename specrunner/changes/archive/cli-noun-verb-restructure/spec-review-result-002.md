# Spec Review Result 002

- **change**: cli-noun-verb-restructure
- **reviewer**: spec-reviewer agent
- **date**: 2026-05-20
- **verdict**: needs-fix

---

## 網羅性

request.md の 22 個の AC を delta spec / design.md / tasks.md にマッピング:

| # | AC | 対応箇所 | Status |
|---|---|---|---|
| 1 | `request new/generate/ls/show/rm/validate/template/review` 動作 | delta L72-114, Task 2 AC, design AD-5/AD-6/AD-7 | ✅ |
| 2 | `job start/ls/show/rm/resume/finish` 動作 | delta L115-154, Task 3 AC | ✅ |
| 3 | `run <slug>` 唯一 alias | delta L155-162, Task 4 AC, design AD-3 | ✅ |
| 4 | 旧 top-level `ps/rm/resume/finish` 削除 | delta L7/L14-27, Task 4 AC | ✅ |
| 5 | `runtime setup/status/reset` 同等動作 | managed-cli-commands delta 全体, Task 5 AC | ✅ |
| 6 | 旧 `managed setup/...` Unknown command | managed-cli-commands delta L7/L24-27, Task 5 AC | ✅ |
| 7 | `job start/resume/finish` の worktree guard | delta L164-178, Task 1 AC, design AD-2 | ✅ |
| 8 | `job ls/rm` は worktree 内 OK | delta L175-188, Task 1 AC | ✅ |
| 9 | `request review/validate <slug>` 解決 | delta L95-103, Task 2 AC, design AD-8 | ✅ |
| 10 | `job start <slug>` slug/file 両受け | delta L130-138, Task 3 AC | ✅ |
| 11 | `--help` 主語別グルーピング | delta L29-70, Task 6 AC, design AD-10 | ✅ |
| 12 | README 新体系 | Task 7 AC | ✅ |
| 13 | `cli-commands` delta update | specs/cli-commands/spec.md, Task 8 AC | ✅ |
| 14 | `cli-finish/resume-command` delta update | specs/cli-finish-command/spec.md, specs/cli-resume-command/spec.md, Task 8 AC | ✅ |
| 15 | `managed-cli-commands` delta update | specs/managed-cli-commands/spec.md, Task 8 AC | ✅ |
| 16 | 旧 `request create` Unknown | delta L87/L105-108 | ✅ |
| 17 | 旧 `request list` Unknown | delta L88/L110-113 | ✅ |
| 18 | `request show <slug>` 本文出力 | delta L90-93/L216-231 | ✅ |
| 19 | `job show <jobId|slug>` 主要フィールド出力 | delta L253-279, Task 3 AC, design AD-5 | ✅ |
| 20 | `job unknown` エラーメッセージ | delta L150-153, Task 3 AC | ✅ |
| 21 | `typecheck && test` green | Task 9 AC | ✅ |
| 22 | ADR 5 判断記録 | Task 10 AC | ✅ |

**AC 22/22 全カバー**。ただし暗黙の要件で取りこぼしが 2 件:

- `src/cli/run.ts` の Hint 文 (`Use 'specrunner request list' to see available slugs.`) が rename 後に stale になるが tasks.md に明示なし
- `MANAGED_RESET_USAGE` 本文内の `managed` 単語残置の扱いが不明（`runtime` に更新すべき箇所の可能性）

---

## 整合性

design.md AD-1〜AD-10 と tasks.md Task 1〜10 は 1:1 対応で矛盾なし。

- AD-2 の `guardedSubcommands` 採用 と Task 1 の interface 拡張は整合
- AD-3 (`run` は `job start` と同じ handler を共有) と Task 4 (`runRun()` の re-use) は一致
- AD-4 (`managed` → `runtime` は key 変更のみ) と Task 5 の方針は一致
- Task 4 を Task 1 より先に実行すべきとの dependency note は AD-2 の安全境界と整合し、transient window 発生を防ぐ優れた配慮

軽微な表現不整合:

- design.md で `src/cli/rm.ts` を「移動」と表現しているが、実体は `command-registry.ts` 内の登録位置変更のみ。実装者が誤解して rm.ts を物理移動する恐れがある

---

## Delta Spec 正確性

新フォーマット (`## Requirements` + `## Renamed` / `## Removed`) に正しく準拠。

`## Renamed FROM` ヘッダー一致チェック（main spec との対照）:

| Delta File | Renamed FROM | Main Spec 一致 |
|---|---|---|
| cli-commands | `specrunner バイナリは 6 つのサブコマンドを提供する` | ✅ |
| cli-commands | `specrunner run` は起動前に fail-fast バリデーションを固定順序で実行する | ✅ |
| cli-commands | `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する | ✅ |
| cli-commands | `specrunner request create` / `specrunner request review` は LLM 呼び出しの進捗を stderr に出力する | ✅ |
| cli-commands | `specrunner run` の preflight は GitHub token 取得元を info ログに出力する | ✅ |
| cli-commands Removed | `specrunner ps` は実行中のジョブを一覧表示する | ✅ |
| cli-finish-command | 9 件 (`specrunner finish` 系) | ✅ |
| managed-cli-commands | 4 件 (`managed status/reset` 系) | ✅ |

**HIGH 懸念**:

`## Renamed` で `specrunner バイナリは 6 つのサブコマンドを提供する` (main spec L124) と `specrunner run <request.md>` (main spec L115) を header rewrite する場合、これらの Requirement の **body には重要な仕様が含まれる**（finish フラグ詳細、spec-review-result.md not found Scenario 等）。

`## Renamed` が「header のみ書き換え、body は新 Requirement で完全置換」と解釈される merger 実装の場合、delta spec 内に body を再掲していないと **既存仕様が意図せず消失**する。Task 8 に明示的な注意がなく、実装者が罠を踏む可能性がある。

---

## Worktree Guard 修正

- design.md AD-2: `ParentCommandDef.guardedSubcommands` 追加 + subcommand dispatch path での `detectWorktree` 呼び出し + `job` 定義に `guardedSubcommands: new Set(["start", "resume", "finish"])` を明示
- tasks.md Task 1: AC 3 件 + test 3 件で網羅
- delta spec L164-188: `job start` / `job ls` / `job rm` / `job show` の 4 Scenario で guard 有無を明示

**元 request の「subcommand dispatch path の guard 漏れ修正」要件は design・tasks・delta spec の 3 層で十分に整合している。**

---

## セキュリティ

### slug バリデーション

- design AD-9 で正規表現 `/^[a-z0-9][a-z0-9-]{0,63}$/` を `request new/show/rm/validate/review` 全引数に適用する方針を明示
- Task 2b で 5 コマンドへのバリデーション追加を独立タスク化
- delta spec L281-293 に slug validation 専用 Requirement + path traversal 拒否 Scenario を定義
- `request rm` の再帰削除に対する path traversal 防止は L232-251 で明示的に扱われている

### jobId バリデーション（HIGH 懸念）

- design.md L178 で UUID 正規表現 `/^[a-f0-9-]{36}$/` を「推奨」として記載
- Task 3 の Detail に「jobId は UUID 正規表現で検証」と記載されているが AC ではない
- **delta spec の `## Requirements` に jobId UUID 検証 Requirement が存在しない**

`~/.local/share/specrunner/jobs/<jobId>.json` への path.resolve だけでは `../`-含む jobId で `~/.local/share/specrunner/jobs/../../sensitive.json` 等が解決される可能性がある。`job rm` / `job show` / `job resume` / `job finish` の全引数に適用する Requirement として昇格が必要。

---

## 実装可能性

- Task 粒度はおおむね適切（1 task = 1〜3 ファイル変更、AC 3〜7 件）
- Task 1 → 2,3,5 並列 → 6 → 7,8,10 の dependency graph が明示されているのは良い

**MEDIUM 懸念**:

- Task 2b が dependency 図に記載されておらず、実装者がどのタイミングで実行すべきか不明
- Task 9 の「既存テスト修正」が具体ファイル名なし（`tests/unit/cli/` 配下とだけ記載）。実装者は `runPs` / `runRm` 等を grep して漁ることになる

---

## 修正指示

### [HIGH-1] Renamed Requirement の body 継承明示

**対象**: `specrunner/changes/cli-noun-verb-restructure/specs/cli-commands/spec.md`

`## Renamed` セクションで書き換えている以下 2 件の Requirement は body に重要な仕様を含む:

1. `specrunner バイナリは 6 つのサブコマンドを提供する` → `noun-verb 体系のサブコマンド群を提供する`
   - body 内の finish フラグ詳細 (`--pr` / `--job` / `--dry-run`) が delta spec 内に再掲されているか確認し、欠落していれば追記する

2. `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する → `specrunner job start <slug|file>` ...
   - body 内の spec-review-result.md not found Scenario が delta spec 内に再掲されているか確認し、欠落していれば追記する

または、merger が「`## Renamed` は header のみ置換、body は delta の新 Requirement body で上書き」と定義されているなら、その旨を Task 8 の Detail に明記する。

### [HIGH-2] jobId UUID 検証を delta spec に Requirement として追加

**対象**: `specrunner/changes/cli-noun-verb-restructure/specs/cli-commands/spec.md`

`## Requirements` セクションに以下を追加:

```
### Requirement: job サブコマンドは jobId 引数を UUID 形式で検証する

`job rm` / `job show` / `job resume` / `job finish` の `<jobId>` 引数は `/^[a-f0-9-]{36}$/` にマッチしない場合、`Error: invalid jobId format` を stderr に出力して終了する。

**Scenario**: UUID でない jobId を渡した場合にエラーを返す
- **Given**: ユーザーが `specrunner job rm ../../../etc/passwd` を実行する
- **When**: jobId バリデーションが走る
- **Then**: `Error: invalid jobId format` を stderr に出力して exit code 1 で終了する
- **And**: ファイルシステムへのアクセスは行われない
```

### [MEDIUM-3] Task 2b を dependency 図に追加

**対象**: `specrunner/changes/cli-noun-verb-restructure/tasks.md`

Task 2b (slug validation 追加) を dependency graph に明記する。推奨: Task 1 完了後、Task 2 と並列で実行可能。

### [MEDIUM-4] Hint 文の rename 漏れ修正を tasks に追加

**対象**: `specrunner/changes/cli-noun-verb-restructure/tasks.md`

Task 6 (Help text 更新) または Task 9 (テスト修正) の Detail に以下を追記:

- `src/cli/run.ts` の Hint 文 `Use 'specrunner request list' to see available slugs.` を `Use 'specrunner request ls' to see available slugs.` に更新する
- `MANAGED_RESET_USAGE` 等の usage 文字列内 `managed` 参照を `runtime` に更新する

---

## 総合所見

**強み**:
- AC 22/22 全カバー。delta spec・design.md・tasks.md の 3 層整合が高い
- `## Renamed` FROM ヘッダー文字列が main spec と完全一致（18 件検証済み）
- worktree guard の subcommand dispatch 漏れ修正は 3 層で補強されており再発防止まで込み
- slug validation の path traversal 防止が独立タスク + 独立 Requirement で明確化されている
- Task 1 ↔ Task 4 の dependency note による transient window 回避は実装品質への優れた配慮

**要修正点**:
- HIGH-1: Renamed Requirement の body 取りこぼし懸念（仕様の意図せぬ消失リスク）
- HIGH-2: jobId UUID 検証が delta spec の Requirement に不在（セキュリティホール）
- MEDIUM-3: Task 2b の dependency 図欠落
- MEDIUM-4: Hint 文の rename 漏れの tasks 未記載
