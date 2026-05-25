# ADR-20260525: `config.jobs.location` の `"xdg"` opt-out を廃止し jobs/logs を常に project 内に置く

**Date**: 2026-05-25
**Status**: accepted
**Supersedes**: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md` — D2 (xdg opt-out の維持) と D3 (module-level state パターン) を上書きする

## Context

`2026-05-24-jobs-to-dotspecrunner.md` で、job state / verbose log の格納先を `<repo-root>/.specrunner/` に移管した (D2)。その際、CI 環境での repo 書き込み回避を意図して `config.jobs.location: "xdg"` による opt-out を維持した。

また、path 解決の切り替え機構として module-level state パターン (`setJobsLocation()` / `resetJobsLocation()`) を採用した (D3)。この選択の理由は「呼び出しサイトが多く全シグネチャ変更は過剰」だった。

運用を経て、以下の問題が顕在化した:

1. **後方互換性の空手形**: XDG mode を残しても、旧 XDG path に残った state file の自動移行は実装されていない。`"xdg"` を設定しても旧 job は resume できず、opt-out の実質的な価値がない。

2. **構造的脆弱性**: module-level state の初期値は `"xdg"` に設定されており、CLI entry で `setJobsLocation()` の呼び出しを忘れると silent に XDG モードにフォールバックする。新規 CLI entry を追加するたびに呼び忘れリスクが累積する。このバグはテストでも型システムでも検出できない。

3. **需要の薄さ**: specrunner は repo-bound tool であり、複数 repo の job 履歴を XDG に集約したい需要が本質的に存在しない。CI 環境でも repo への書き込みは `.specrunner/` を CI artifact として扱えば解決できる。

4. **コストの非対称性**: xdg opt-out を維持するためのボイラープレート (`setJobsLocation()` 6 箇所 + 早期 config-load) のコストが、実際に恩恵を受けるユーザー数を上回っている。

## Decision

`config.jobs.location` 設定キーと `"xdg"` モードを完全に廃止する。jobs/logs は常に `<repo-root>/.specrunner/` 配下に置く。

あわせて、module-level state パターン (`jobsLocation` / `projectRoot` / `setJobsLocation()` / `resetJobsLocation()`) を削除し、`getJobsDir()` / `getVerboseLogDir()` を `repoRoot: string` を必須引数とする純粋関数に置き換える。

## Design Decisions

### D1: `getJobsDir(repoRoot)` / `getVerboseLogDir(repoRoot)` を純粋関数にする

**選択**: `repoRoot: string` を必須引数として受け取る純粋関数に変換する。

**理由**:
- module-level state を完全に削除できる — `setJobsLocation` / `resetJobsLocation` の呼び忘れによる silent fallback が構造的に発生しない
- テストでの state leak がゼロになる (`afterEach` の cleanup 漏れも起きない)
- 依存関係が型レベルで可視化される (`repoRoot` を渡さないとコンパイルエラー)
- `feedback_llm_uncertainty_principle` に合致 — module が判断する場面 (「どこに書くか」) を消す

**却下案**:
- `git rev-parse --show-toplevel` を各 helper 内で実行 → 副作用が隠れ、テスト困難
- 新たな `setRepoRoot()` module-level state → 旧問題の再導入

### D2: `JobStateStore` コンストラクタ / static メソッドに `repoRoot` を追加する

**選択**: `new JobStateStore(jobId, repoRoot)` / `JobStateStore.create(repoRoot, params)` / `JobStateStore.list(repoRoot)` / `JobStateStore.delete(repoRoot, jobId)` / `JobStateStore.resolveId(repoRoot, prefix)` として `repoRoot` を明示的に受け取る。

**`StoreFactory` 型は変更しない**: signature `(jobId: string) => JobStateStore` を維持し、composition root (runtime) で `repoRoot` を closure capture する:

```ts
storeFactory: (id: string) => new JobStateStore(id, this.cwd)
```

これにより呼び出しサイト (pipeline / cancel / finish など) への `repoRoot` 伝播が不要になる。

### D3: `initVerboseLog(repoRoot, jobId)` に `repoRoot` を追加する

**選択**: `initVerboseLog` の第一引数に `repoRoot` を追加。`CommandRunner.execute()` で `PrepareResult.repoRoot` から取得する (各 `prepare()` subclass が既に resolve 済み)。

### D4: CLI entry の fallback 戦略変更

**旧**: config 読み込み失敗 → `setJobsLocation("xdg")` にフォールバック
**新**: `git rev-parse --show-toplevel` 失敗 → jobs ディレクトリが存在しない (ENOENT → 空リスト返却 or エラー終了)

**合理性**: specrunner は repo-bound tool。repo 外では jobs が存在しないのが正常。CI 環境も `.specrunner/` を repo 内に持つことで対応する。

### D5: 旧 config の `jobs` section は未知 field として無視する

旧 config に `{ "jobs": { "location": "xdg" } }` が残っていても:
- `validateConfig()` から jobs validation block を削除 → 未知 field として passthrough
- error にならない (`loadConfig` は known fields のみ extract し、残りを無視する既存挙動と整合)

## Alternatives Considered

### Alternative 1: `"xdg"` モードを維持し migration 警告のみ追加する

`"xdg"` 設定を読んだ時に `console.warn` で「deprecated: 将来削除」と通知する案。

- **Pros**: 後方互換性を維持しつつ廃止を予告できる
- **Cons**: xdg state file の移行が実装されないまま残り続ける。module-level state の構造的脆弱性も残る。deprecation warning の期間設定・削除タイミングの判断が必要
- **Why not**: xdg mode を使っているユーザーが migration なしに恩恵を受けられない。脆弱性は期間限定解決にならない

### Alternative 2: `"xdg"` モードを維持し旧 XDG path からの自動 migration を実装する

起動時に `~/.local/share/specrunner/jobs/` を走査し、`<repo-root>` が一致する job state を `.specrunner/jobs/` に移動する案。

- **Pros**: 既存ユーザーが resume できる
- **Cons**: `repoRoot` が job state に埋め込まれておらず、現状の JSON schema では自動識別が困難。migration は別 request で扱う方針 (PR #387, jobs-to-dotspecrunner と同方針)
- **Why not**: scope の拡大が過剰。xdg mode 自体の利用者が限定的であり ROI が低い

## Consequences

### Positive

- `setJobsLocation()` 呼び忘れによる silent XDG fallback バグが構造的に発生しなくなる
- 新規 CLI entry 追加時の boilerplate (早期 config-load + `setJobsLocation()`) が不要
- `getJobsDir` / `getVerboseLogDir` が純粋関数になりテストの信頼性が向上する
- `config.jobs.location` の概念がなくなり、ドキュメント・設定の認知負荷が低下する

### Negative

- `config.jobs.location: "xdg"` を設定していたユーザーの設定は無視される (error にはならない)
- XDG path に残っている job state / log は resume 不可。旧 XDG path のファイルは手動で移行が必要
- CI 環境で repo への書き込みを避けていたユーザーは `.specrunner/` を CI artifact として設定し直す必要がある

### Known Debt

- `tests/unit/cli/resume.test.ts:29` の mock fixture に `jobs: { location: "xdg" }` が残っている (stale field)。runtime 影響なし・テストは green だが、次の機会に削除する
- 旧 XDG path に残っている job state の detection / 警告 / migration は未実装。将来 `specrunner gc` や migration コマンドで対処する余地を残す
- worktree 内から parent repo の `.specrunner/` への書き込み戦略は未解決 (別 request で扱う)

## References

- Request: `specrunner/changes/remove-xdg-mode/request.md`
- Design: `specrunner/changes/remove-xdg-mode/design.md`
- Superseded: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md` (D2: xdg opt-out の維持、D3: module-level state パターン)
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md` (JobStateStore の DI パターン)
- Related: `specrunner/adr/2026-05-19-verbose-execution-log.md` (verbose log 格納先の経緯)
