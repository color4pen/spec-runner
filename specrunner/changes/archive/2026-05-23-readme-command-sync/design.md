# Design: readme-command-sync

## 概要

README.md の Command Reference / Quick Start を `src/cli/command-registry.ts` の USAGE 定数および COMMANDS 定義と 1:1 に同期する。コード変更なし、ドキュメントのみ。

## 正（source of truth）

`command-registry.ts` の `USAGE` 定数（L54-83）と `COMMANDS` オブジェクト（L116-445）。

## 差分一覧

### 1. Request commands — 削除対象

| README 行 | 記載 | 理由 |
|---|---|---|
| L48 | `request show <slug>` | COMMANDS.request.subcommands に `show` なし（#358 で削除） |
| L49 | `request rm <slug>` | COMMANDS.request.subcommands に `rm` なし（#358 で削除） |

### 2. Job commands — 置換対象

| README 行 | 現記載 | 修正後 | 理由 |
|---|---|---|---|
| L61 | `job rm <jobId>  Remove job state file` | `job cancel <jobId>  Cancel job and cleanup` | COMMANDS.job.subcommands に `rm` なし、`cancel` あり（#359 で統合） |

### 3. Managed Quick Start — 修正対象

README L99-105 の managed runtime セクション:

**現行:**
```bash
export SPECRUNNER_API_KEY=sk-ant-...
specrunner init --runtime managed
specrunner login
specrunner runtime setup
specrunner job start my-feature
```

**修正後:**
```bash
specrunner init
specrunner login
export SPECRUNNER_API_KEY=sk-ant-...
specrunner runtime setup
specrunner job start my-feature
```

理由: `init --runtime managed` は `init.ts:15-18` でエラー終了する。正しい手順は `init`（local-default scaffold）→ `SPECRUNNER_API_KEY` 設定 → `runtime setup`。

### 4. 全体照合

USAGE 定数との照合結果（上記 3 点以外）:

| セクション | README | USAGE | 一致 |
|---|---|---|---|
| request new | `<slug>` | `<slug>` | ✓ |
| request generate | `"<text>"` | `"<text>"` | ✓ |
| request ls | — | — | ✓ |
| request validate | `<file\|slug>` | `<file\|slug>` | ✓ |
| request template | — | — | ✓ |
| request review | `<slug\|file>` | `<slug\|file>` | ✓ |
| job start | `<request-slug\|file>` | `<request-slug\|file>` | ✓ |
| job ls | — | — | ✓ |
| job show | `<jobId\|slug>` | `<jobId\|slug>` | ✓ |
| job resume | `<slug>` | `<slug>` | ✓ |
| job finish | `<slug>` | `<slug>` | ✓ |
| init | — | — | ✓ |
| login | — | — | ✓ |
| doctor | — | — | ✓ |
| runtime setup\|status\|reset | — | — | ✓ |
| run | `<slug\|file>` | `<slug\|file>` | ✓ |

→ 上記 3 点を修正すれば USAGE と完全一致。

## スコープ外（別 issue 候補）

- `init.ts:16` のエラーメッセージが `managed setup` と案内するが、実コマンドは `runtime setup`。内部不整合だが README sync の範囲外。
