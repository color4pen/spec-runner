# Design: jobs-to-dotspecrunner

## Overview

job state (`<jobId>.json`) と verbose log (`<jobId>.log`) の格納先を XDG 固定パスからプロジェクトローカルの `.specrunner/` 配下に移す。`config.jobs.location` で XDG への切り替えも可能にする。

## Design Decisions

### D1: module-level state pattern で path 解決を切り替える

`src/util/xdg.ts` の `getJobsDir()` / `getVerboseLogDir()` は現状パラメータなしの pure 関数。呼び出し箇所が多く（`JobStateStore` 4 箇所、`stdout.ts` 2 箇所）、全シグネチャを変更するのは過剰。

`stdout.ts` の `verbose` flag と同じパターンで module-level state を導入する:

```typescript
// Module-level state — defaults to XDG (backward compat, test safety)
let jobsLocation: "project" | "xdg" = "xdg";
let projectRoot: string | null = null;

export function setJobsLocation(location: "project" | "xdg", repoRoot?: string): void {
  jobsLocation = location;
  projectRoot = location === "project" && repoRoot ? repoRoot : null;
}
```

**default は `"xdg"`** とする。CLI startup が `setJobsLocation()` を呼ぶまで既存挙動を維持し、テストも壊れない。config のデフォルト値 `"project"` は CLI entry point が config を読んだ後に反映する。

`getJobsDir()` / `getVerboseLogDir()` は module state を参照して分岐:
- `"project"` + `projectRoot` あり → `<repoRoot>/.specrunner/jobs/` / `<repoRoot>/.specrunner/logs/`
- それ以外 → 既存 XDG パス

### D2: config schema に `jobs` section を追加

```typescript
export interface JobsConfig {
  location?: "project" | "xdg";
}

export interface SpecRunnerConfig {
  // ... existing fields
  jobs?: JobsConfig;
}
```

- `jobs` section 自体が optional（既存 config との後方互換）
- `jobs.location` 未設定時は `"project"` として扱う（CLI entry point が解釈）
- validation: `jobs.location` は `"project"` or `"xdg"` のみ（それ以外は `CONFIG_INVALID`）

### D3: CLI entry point で `setJobsLocation()` を呼ぶ

config load 後、job state アクセス前に 1 回だけ呼ぶ。対象 entry point:

| Entry point | Config source | repoRoot 取得方法 |
|-------------|--------------|-----------------|
| `run.ts` (`runRunCore`) | `preflightResult.config` | `cwd` (= `process.cwd()`) |
| `resume.ts` | `bootstrap().config` | `cwd` |
| `ps.ts` (`runPs`) | `loadConfig()` (新規追加) | `git rev-parse --show-toplevel` (新規追加) |
| `cancel.ts` | `loadConfig()` (新規追加) | 既存の `git rev-parse --show-toplevel` |
| `finish.ts` | 既存の config load | 既存の repo root 解決 |
| `job-show.ts` | `loadConfig()` (新規追加) | `git rev-parse --show-toplevel` (新規追加) |

**`ps` / `job-show` / `cancel`**: config load 失敗時は XDG fallback（`setJobsLocation("xdg")`）。git repo 外での実行も想定し、repo root 解決失敗時も XDG fallback。

### D4: `.gitignore` 管理ユーティリティ

`src/util/gitignore.ts` に `ensureDotSpecrunnerGitignore(repoRoot: string)` を新設:

1. `<repoRoot>/.gitignore` を読む（存在しなければ空文字列）
2. `.specrunner/` が行として含まれるかチェック
3. 未含の場合のみ末尾に `\n.specrunner/\n` を append
4. 冪等（既に存在すれば no-op）

呼び出し元:
- `runInit()`: CWD が git repo の場合のみ実行（git repo 判定は `git rev-parse --show-toplevel` の成否で判断）
- pipeline preflight 後: `runRunCore()` 内で `jobs.location === "project"` の場合に実行

### D5: 影響を受ける spec

| Spec | 変更内容 |
|------|---------|
| `job-state-store` | path requirement: デフォルトが `.specrunner/jobs/` に変更、`config.jobs.location: "xdg"` で従来パス |
| `verbose-execution-log` | path requirement: デフォルトが `.specrunner/logs/` に変更 |
| `cli-config-store` | `jobs` section 追加 |
| `cli-commands` | `init` で `.gitignore` に `.specrunner/` を追記 |

### D6: スコープ外の確認

- `JobState` schema / format は一切変更しない
- credentials / config は XDG のまま維持（`getConfigPath()` / `getCredentialsPath()` は変更なし）
- 旧 XDG パスの migration / detection は行わない
- worktree 内からの書き込みは既存 repoRoot 検出ロジック踏襲（別 request）
