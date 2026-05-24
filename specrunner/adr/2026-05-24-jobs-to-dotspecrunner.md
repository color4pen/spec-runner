# ADR-20260524: job state / verbose log を `.specrunner/` 配下に移管する

**Date**: 2026-05-24
**Status**: accepted
**Supersedes**: `specrunner/adr/2026-05-19-verbose-execution-log.md` (Log destination: XDG_STATE_HOME の決定を上書き)

## Context

verbose-execution-log ADR (2026-05-19) では、job state と verbose log の格納先を XDG Base Directory Specification に従い以下に定めた:

- `~/.local/share/specrunner/jobs/<jobId>.json` (job state)
- `~/.local/state/specrunner/logs/<jobId>.log` (verbose log)

運用を経て、この決定に複数の問題が顕在化した:

1. **多 repo 混在**: specrunner は repo-bound なツールであり、実行履歴は「どの repo での活動か」という文脈を持つ。XDG 配下では複数 repo の履歴が混在し、file system 上で区別できない。
2. **発見性の欠如**: 新規ユーザーが `ls` や IDE のファイルツリーでジョブ状態を発見できない。`~/.local/share/` を辿る必要がある。
3. **ディレクトリ慣習との不整合**: `specrunner/` (no dot) は human-editable な領域（spec / change / draft / adr）として既に運用されている。machine-generated な状態を同じ `specrunner/` 配下や XDG に分散させると、human/machine の境界が不明瞭になる。

## Decision

machine-generated な state / log を `<repo-root>/.specrunner/` 配下に集約する:

- `.specrunner/jobs/<jobId>.json` — job state
- `.specrunner/logs/<jobId>.log` — verbose log

`config.jobs.location: "xdg"` を設定した場合は従来の XDG パスにフォールバックする。

## Design Decisions

### D1: `.specrunner/` (dot prefix) を新設し human/machine 領域を分離する

`specrunner/` (no dot) を human-editable（spec / change / draft / adr）、`.specrunner/` (dot prefix) を machine-generated（jobs / logs）として明確に分離する。

この慣習は `.git/`、`.next/`、`.cache/`、`.terraform/` 等の先行事例と一致する。dot prefix は「ツールが管理する、人間が直接編集しないディレクトリ」を意味するエコシステム標準である。

**却下した代替案**: `specrunner/.machine/`
- `specrunner/` 配下の追加サブディレクトリとして置く案は、human-editable な `specrunner/` ディレクトリを汚染する。将来 `specrunner/` を git submodule 化・共有化するシナリオでも machine state を切り離せない。dot prefix なら `specrunner/` と `.specrunner/` が同一階層で視覚的に区別できる。

### D2: project-local をデフォルト、XDG を opt-out にする

specrunner が repo-bound である以上、ジョブ状態はそのリポジトリ直下に置くのが自然。

`config.jobs.location` の仕様:
- `"project"` (default): `<repo-root>/.specrunner/jobs/`, `<repo-root>/.specrunner/logs/`
- `"xdg"`: `~/.local/share/specrunner/jobs/`, `~/.local/state/specrunner/logs/`

credentials / config は per-user かつ secret な性質を持つため XDG_CONFIG_HOME のまま維持する（`getConfigPath()` / `getCredentialsPath()` は変更なし）。

### D3: module-level state パターン (`setJobsLocation()`) で path 解決を切り替える

`getJobsDir()` / `getVerboseLogDir()` の呼び出しサイトが多い（`JobStateStore` 4 箇所、`stdout.ts` 2 箇所）ため、全シグネチャ変更は過剰。`stdout.ts` の `verbose` flag と同じ module-level state パターンで切り替えを実装する:

```typescript
let jobsLocation: "project" | "xdg" = "xdg";  // module default = XDG
let projectRoot: string | null = null;

export function setJobsLocation(location: "project" | "xdg", repoRoot?: string): void { ... }
```

**module default は `"xdg"`**: CLI entry point が config を読んで `setJobsLocation()` を呼ぶまで既存挙動を維持し、テスト環境でも環境汚染を防ぐ。config のデフォルト値 `"project"` は CLI entry point が config 読み込み後に反映する。

`ps` / `job-show` / `cancel` では config load 失敗時・git repo 外では XDG fallback（`setJobsLocation("xdg")`）。

**却下した代替案**: `getJobsDir(config)` と全シグネチャ変更
- 呼び出しサイトの変更が広範囲に及ぶ。module-level state は既存の `verbose` flag で実績があり、process-wide な一度の設定に適している。

### D4: `.gitignore` 追記はツールが宣言する責任

machine-generated state を `.gitignore` するのは terraform / vagrant / next.js 等と同様の慣習。ユーザーが手で書く必要をなくすため、`specrunner init` 実行時および pipeline run 時（`jobs.location === "project"` の場合）に `ensureDotSpecrunnerGitignore(repoRoot)` を呼び、`.gitignore` に `.specrunner/` を冪等に追記する。

## Alternatives Considered

### Alternative 1: XDG を維持し repo 情報を job state に埋め込む

job state の JSON に `repoRoot` フィールドを追加し、`specrunner ps` 時に filter する案。

- **Pros**: ファイルシステム上の移動が不要
- **Cons**: `ls` / ファイルツリーでの発見性が解決しない。repo を削除後も XDG に状態が残り続ける。filter ロジックの実装・保守コストがかかる
- **Why not**: 発見性と multi-repo 分離の問題を根本解決しない

### Alternative 2: `specrunner/` 配下の専用サブディレクトリ（dot なし）

`specrunner/jobs/`, `specrunner/logs/` として human-editable 領域と同列に置く案。

- **Pros**: 既存の `specrunner/` ディレクトリを再利用できる
- **Cons**: human-editable な spec / adr と machine-generated な jobs が混在する。`.gitignore` の精度が落ちる（`specrunner/jobs/` のみ除外が必要）。将来 `specrunner/` を人間が管理する資産として扱いたい場合に障害になる
- **Why not**: human/machine の境界を明確にするという設計目標に反する

### Alternative 3: `.specrunner/` に credentials / config も移す

per-user な設定も project-local に集約する案。

- **Pros**: すべての specrunner データが一箇所にまとまる
- **Cons**: credentials は project-local に置くと git add のリスクが高まる。複数 repo で同じ credentials を共有できなくなり、per-repo 設定が必須になる
- **Why not**: XDG_CONFIG_HOME は per-user / secret な用途に適しており変更しない

## Consequences

### Positive

- `specrunner ps` / `specrunner job show` でカレント repo のジョブのみが表示される（将来の実装）
- 新規ユーザーが `ls -a` でジョブ状態を発見できる
- 複数 repo 間でのジョブ履歴の混在が解消される
- `.specrunner/` が `.gitignore` 対象となり、machine state を誤って commit するリスクが低下する
- CI 環境では `jobs.location: "xdg"` に切り替えることで、repo への書き込みなしに動作させられる

### Negative

- 既存ユーザーの XDG に残っている job state / log は自動移行されない（意図的にスコープ外）。旧ログが見えなくなるが、ジョブは完了しているため実害は限定的
- worktree 内から parent repo の `.specrunner/` への書き込み戦略は未解決（既存 repo root 検出ロジックを踏襲、必要なら別 request で対処）

### Known Debt

- 旧 XDG パスに残っている job state の migration / detection / 警告は未実装。将来 `specrunner gc` や migration コマンドで対処する余地を残す
- worktree 内から parent repo の `.specrunner/` への書き込み戦略（`git worktree` 利用時の repoRoot 解決）は別 request で扱う

## References

- Request: `specrunner/changes/jobs-to-dotspecrunner/request.md`
- Design: `specrunner/changes/jobs-to-dotspecrunner/design.md`
- Superseded: `specrunner/adr/2026-05-19-verbose-execution-log.md`（Log destination の決定を更新）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の DI パターン）
