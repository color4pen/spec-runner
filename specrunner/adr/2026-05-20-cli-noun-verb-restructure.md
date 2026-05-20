# ADR: CLI を noun-verb 体系で再編し request / job 責務境界を確立する

**Date**: 2026-05-20
**Status**: Accepted

## Context

SpecRunner CLI は初期に `init` / `login` / `run` / `ps` / `resume` / `finish` / `rm` / `doctor` / `request <sub>` / `managed <sub>` という 9 サブコマンド + 5 トップレベル動詞の混成構造を持っていた。

課題:
- 初見で「何を操作しているか」が読み取りづらい（動詞先行で対象が不明確）
- `bin/specrunner.ts` の subcommand dispatch path が worktree guard を通っていない既存 bug（`managed setup` が guard 対象外）
- `job start/resume/finish` 導入時に同じ guard 漏れを踏む構造的問題
- npm 配布前（`"private": true` 維持中）の現時点が破壊コストゼロでの再編の好機

過去案（`alias 5 個永続維持`）は 1 ユーザー dogfood 環境の実態と整合しないとして却下済み。アーキテクト評価で `gh` / `docker 19+` / `aws` 慣用の noun-verb 体系が推奨された。

## Decision

### 1. noun-verb 体系の採用

`gh` / `docker 19+` / `aws` の慣用に倣い、**noun-verb 体系**（`<object> <verb>`）を採用する。

```
specrunner request new|generate|ls|show|rm|validate|template|review
specrunner job start|ls|show|rm|resume|finish
specrunner init|login|doctor
specrunner runtime setup|status|reset
```

**採用理由**:
- gh / docker / aws で実証済みの UX パターン
- 「何を対象に何をするか」が一目でわかる
- 将来のサブコマンド追加時に一貫した命名ルールを提供できる

### 2. `request` / `job` 責務境界の判断軸

| Noun | 対象 | 判断軸 |
|---|---|---|
| `request` | static markdown file | `specrunner/requests/active/<slug>/request.md` のファイル操作 |
| `job` | stateful execution | jobId 発行 + state file 操作、pipeline 実行 |

**判断軸**: 「**static file を扱うか、stateful 実行を扱うか**」で分ける。LLM を呼ぶか否かは内部実装の話であり、主語選択には影響させない。

例: `request review` は state-less な one-shot LLM 呼び出しであり、jobId を振らず ps に出ず resume できない。これは "request" 文書のレビューであり `job review` ではない。`job review` という noun 選択は「実行していない request に対して job? 」という混乱を招く。

### 3. `run` alias のみ維持の判断

**`run <slug>`** のみを唯一の互換 alias として `job start <slug>` に展開する。  
`ps` / top-level `rm` / top-level `resume` / top-level `finish` は全廃。

**理由**:
- `npm run` / `python run` / `make run` の world-wide な慣性が最強のため `run` のみ保持
- その他コマンドは慣性が弱く、配布前（1 ユーザー dogfood 環境）での破壊コストはゼロに近い

### 4. `managed` → `runtime` rename 判断

`managed setup/status/reset` を `runtime setup/status/reset` に rename する。

| 観点 | 判断材料 |
|---|---|
| 破壊コスト | 配布前（`"private": true` 維持中）でゼロに近い |
| noun-verb 原則との整合 | `runtime` は object としての主語、noun-verb 原則に整合 |
| 将来拡張性 | "managed" は Anthropic Managed Agents 固有の実装語、"runtime" は実装を抽象化した語 |

handler ファイル（`src/cli/managed.ts`）は rename せず。内部実装の変更は最小化する。

### 5. worktree guard の subcommand dispatch 漏れ修正（`guardedSubcommands` 採用）

#### 問題

`WORKTREE_GUARDED_COMMANDS` は top-level command 名のみを guard していた。subcommand dispatch path（`"subcommands" in entry` 分岐）は guard を通らないため `managed setup` が guard 対象外（既存 bug）。`job start/resume/finish` 導入で同じ罠を踏む。

#### 採用方針: `guardedSubcommands` を `ParentCommandDef` に追加

```typescript
export interface ParentCommandDef {
  subcommands: Record<string, CommandDef>;
  guardedSubcommands?: Set<string>;  // NEW
}
```

subcommand dispatch 内で `entry.guardedSubcommands?.has(sub)` が true のとき `detectWorktree()` → guard エラーを呼ぶ。

```typescript
// job 定義
job: {
  guardedSubcommands: new Set(["start", "resume", "finish"]),
  subcommands: { start: {...}, ls: {...}, show: {...}, rm: {...}, resume: {...}, finish: {...} }
}
```

**他の候補との比較**:

| 案 | 内容 | 却下理由 |
|---|---|---|
| A | dispatch 後に resolved operation kind を作り共通 guard 判定 | 実装複雑度が高い |
| B | 各 handler 内で guard helper を呼ぶ | handler の責務外、追加時に忘れやすい |
| C (採用) | `guardedSubcommands` でデータとして宣言的に管理 | dispatch 側で一元処理、追加時に明示的 ✅ |

`WORKTREE_GUARDED_COMMANDS`（top-level）から `"finish"` / `"resume"` を削除し `"run"` のみ残す。これらは `job.guardedSubcommands` で guard される。

## Consequences

### Positive

- CLI の構造が直感的になる（`gh` / `docker` 利用者には即座に馴染む）
- worktree guard が subcommand にも適用され、既存 bug が修正される
- 将来の noun 追加（例: `pipeline`, `config`）が一貫したパターンで可能
- `"managed"` という実装詳細語が公開インターフェースから消える

### Negative / Neutral

- `specrunner ps` / `specrunner rm` / `specrunner resume` / `specrunner finish` → `Unknown command: <name>` を返す（廃止）
- `specrunner managed setup` → `Unknown command: managed` を返す（廃止）
- `specrunner run <slug>` のみ後方互換 alias として維持
- `job start/resume/finish` が linked worktree 内から実行された場合 worktree guard error（修正後の正常動作）
- `job ls/rm/show` は worktree 内でも実行可能

## Files Changed

| File | Change |
|------|--------|
| `src/cli/command-registry.ts` | COMMANDS 再配置: `job` ParentCommandDef 新設、`request` subcommands 追加/rename、`runtime` 追加、旧 top-level 削除。`ParentCommandDef` に `guardedSubcommands` 追加。USAGE 書き換え |
| `bin/specrunner.ts` | subcommand dispatch path に worktree guard 追加。`WORKTREE_GUARDED_COMMANDS` は `run` のみ残す |
| `src/cli/job-show.ts` | NEW: `job show` handler |
| `src/core/command/request-new.ts` | NEW: `request new` handler |
| `src/core/command/request-show.ts` | NEW: `request show` handler |
| `src/core/command/request-rm.ts` | NEW: `request rm` handler |
| `README.md` | 新体系の最短フロー（`init → login → request new → job start → job ls → job finish`）に書き換え |
| `specrunner/specs/cli-commands/spec.md` | MODIFIED: 新体系コマンド一覧に更新（delta spec 経由） |
| `specrunner/specs/cli-finish-command/spec.md` | MODIFIED: `job finish` に主語更新（delta spec 経由） |
| `specrunner/specs/cli-resume-command/spec.md` | MODIFIED: `job resume` に主語更新（delta spec 経由） |
| `specrunner/specs/managed-cli-commands/spec.md` | MODIFIED: `runtime setup/status/reset` に rename（delta spec 経由） |
