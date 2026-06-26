# ADR-20260626: subprocess spawn を stripSecrets 強制 seam に集約し、直接 `node:child_process` import を禁止

**Date**: 2026-06-26
**Status**: accepted

## Context

PR #714（credential-containment）は `util/git-exec.ts` / codex SDK / verification の git 呼び出しを `stripSecrets` 経由にし、B-6 の歯を `src/core` / `src/adapter` / `src/util` へ拡張した。しかし同じクラスの漏れが `src/git/` 内に残存していた。`node:child_process` を直接 import し `env:` オプションを省略した subprocess 呼び出しは、Node のデフォルト挙動で full `process.env`（`GH_TOKEN` / `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` / `SPECRUNNER_API_KEY` および全 `*_TOKEN` / `*_API_KEY` / `*_SECRET`）を子プロセスへ継承させる。

漏れていた呼び出しサイト:

| ファイル | 呼び出し | リスク |
|---------|---------|-------|
| `src/git/dynamic-context.ts` | `execFileAsync("git", args, { cwd })` | **毎 pipeline run の冒頭に agent-writable worktree cwd で実行**。悪意ある `.git/hooks` / `core.hooksPath` が継承された秘密を exfiltrate できる（credential-containment が名指しした脅威）。 |
| `src/git/remote.ts` | `remote get-url origin` / `rev-parse --git-dir` | 毎 run / inbox / archive で呼び出される（`preflight.ts:97`）。 |
| `src/git/transport-auth.ts` | `remote get-url origin` | local / managed / archive / cancel パスで呼び出される。 |
| `src/cli/doctor.ts` | `execFileAsync(file, args, { timeout, signal })` | composition-root、cwd = repo root、`--version` / `whoami` / origin 参照のみ。相対的に低リスクだが同クラスの漏れ。 |

### 既存の歯が検出できない理由

B-6 の歯（`core-invariants.test.ts`、`grepE("process\\.env", …)`）は **`process.env` の読み取り**を検出する。env 省略 spawn は `process.env` を一度も書かないまま継承するため、このトークンを含まない。`src/git` を B-6 の grep 対象に加えても検出不能——漏れの本体は「env を渡し忘れた spawn」であり、`process.env` という文字列が存在しない。

### すでに安全なサイト（seam が機能している）

- `src/util/spawn.ts` `spawnCommand` — `opts.env` 未指定でも `stripSecrets(process.env)` を渡す。
- `src/util/git-exec.ts` `runSubprocess` — PR #714 で修正済み。`gitExec` / `gitExecExitCode` の単一チョークポイント。
- `src/core/verification/commands.ts` / `runner.ts` — すでに stripSecrets 済み。

## Decision

### D1 — 構造歯 B-12: `node:child_process` の直接 import を seam 外で禁止

新しいアーキテクチャ不変条件（タグ **B-12**）を `core-invariants.test.ts` に追加する。`src/` 全体を対象に `from ['"]node:child_process` を grep し、allowlist に含まれないファイルを violation として assert する。allowlist は既存 B-1〜B-11 / DSM と同じ一方向 ratchet（CODEOWNERS ゲート、縮むのみ）で管理する。

allowlist 対象:

| ファイル | 理由 |
|---------|------|
| `src/util/spawn.ts` | spawn seam 本体 |
| `src/util/git-exec.ts` | git exec seam 本体 |
| `src/core/verification/commands.ts` | 既存 stripSecrets 済み・env テストで固定 |
| `src/core/verification/runner.ts` | 既存 stripSecrets 済み・env テストで固定 |
| `src/cli/doctor.ts` | composition-root・`execFile + AbortSignal + timeout` が現行 seam 非対応（D4 参照）。env strip 済み・doctor env テストで固定 |

**採用理由**: 漏れは「省略」（env: を書かない）であり、内容 grep では検出できない。import を縛ることで「見えない省略」を「見える違反」に転換する。seam を通れば必ず strip されるため、各サイトが env 知識を持つ必要がなくなる。

### D2 — `src/git/` の 3 サイトを `git-exec` seam に移行

`dynamic-context.ts`、`remote.ts`、`transport-auth.ts` は `node:child_process` の直接 import を削除し、`util/git-exec.ts` の `gitExec` / `gitExecExitCode` / `runSubprocess` を呼び出す。seam が transitively に strip するため、各サイトは env に関する判断を持たない。

- `dynamic-context.ts`: `runGit(cwd, args)` → `gitExec(defaultSpawnFn, cwd, args)` に委譲。
- `transport-auth.ts`: `getRawOriginUrl(cwd)` → `gitExec(defaultSpawnFn, cwd, ["remote","get-url","origin"])` に委譲。
- `remote.ts`: `getOriginInfo` を `runSubprocess` ベースに書き直し、誤り弁別ロジックを `exitCode` + `rev-parse` プローブに置き換える（D3 参照）。

git のリモート認証は `git -c http.<scope>.extraheader=…` 注入（`transport-auth.ts`）で行われ、env トークンに依存しないため、env から秘密を除去しても push / fetch / log / diff / remote 参照は壊れない。

### D3 — `remote.ts` の誤り弁別を exitCode + rev-parse プローブに移行

旧実装は `err.message` の locale 依存文字列（`"not a git repository"`、`"128"`、`"No such remote"`）で「git リポジトリでない」と「origin が未設定」を区別していた。`runSubprocess` は非ゼロ exit で resolve（スロー不要）するため、この弁別を維持しつつ seam へ移行するために:

- exit 0 → stdout を parse してリモート URL を返す。
- exit 非 0 → `gitExecExitCode(…, ["rev-parse","--git-dir"])` でプローブ: exit 0 なら "Origin remote not configured"（`SpecRunnerError("NOT_GIT_REPO")`）、exit 非 0 なら `notGitRepoError()`。
- spawn error（catch） → `notGitRepoError()`。

外部から観測可能な `SpecRunnerError` コードは変わらない。旧コードも内部で `rev-parse` を使用していたため、プローブを primary discriminator に昇格するのは整合的。

### D4 — `doctor.ts`: `node:child_process` を保持し、env を call-site で strip、import を B-12 allowlist に追加

`doctor.ts` の `ExecFileFunction` は `execFile` の `timeout` + `AbortSignal` を必要とする。現行の `util/spawn.ts` seam は `spawn` ベースで `timeoutMs` のみ提供し、`AbortSignal` に対応しない。そのため:

- `node:child_process` import を維持しつつ `buildExecFile` 内の `execFileAsync` 呼び出しに `env: stripSecrets(env)` を追加。
- `buildExecFile` に `execFileAsyncImpl` と `env` の省略可能パラメータを注入口として追加し、unit テスト可能にする。
- B-12 allowlist に「composition-root で execFile + AbortSignal が必要」という理由付きでエントリを追加。

これにより「strip または理由付き allowlist」という受け入れ基準を両方満たす（env を strip した上で allowlist にも記録する）。

### D5 — B-6 claude allowlist エントリを site 固有のパターンに絞り込む

`arch-allowlist.ts` の B-6 エントリ（`src/adapter/claude-code/agent-runner.ts` 用）のパターンは `"as Record<string, string | undefined>"` という汎用 cast idiom を使用しており、同ファイル内の将来の cast 付き raw-env spawn を黙って allow してしまう。

`agent-runner.ts` の OAuth token resolver 呼び出しを 1 行に集約（`resolveClaudeCodeOAuthTokenFn(` と `process.env` を同一行に収める）し、allowlist パターンを `"resolveClaudeCodeOAuthTokenFn("` に絞り込む。`arch-allowlist.ts` の MATCHING SEMANTICS（file + substring の同時一致）により、他の `process.env` 行はこのエントリで抑制されなくなる。

### D6 — seam 集約ルールを ADR（本文書）に記録

B-12 は新しい構造不変条件であり、その根拠（subprocess spawn は strip seam に集約し、直接 import を seam 外で禁止する）を ADR に記録する。`architecture/model.md` §4 へのエントリ追加は CODEOWNERS の out-of-loop アクション（§7 による）のため本 change の実装者は行わない。enforcement の正とするのは `tests/unit/architecture/` 内の歯と allowlist。

## Alternatives Considered

### Alternative 1: B-6 の `process.env` grep を `src/git` に拡張

- **Pros**: 変更量が最小。既存の歯を使い回せる。
- **Cons**: B-6 は `process.env` トークンを探す。env 省略 spawn には `process.env` が現れないため、この漏れを原理的に検出できない。`src/git` を追加しても CI は green のまま問題のある spawn を素通りさせる。
- **Why not**: 今回の問題の根本が「env を書かない省略」であり、内容 grep では検出不能。

### Alternative 2: `src/git` の spawn に per-site `env: stripSecrets(process.env)` を追加し import を allowlist

- **Pros**: 構造変更が少ない。各サイトが明示的に env を指定する。
- **Cons**: per-site の指定を将来の開発者が忘れると同じクラスの漏れが再発する。`src/git` のファイルに `timeout` / `AbortSignal` のニーズはなく、seam を迂回する理由がない。
- **Why not**: D2 の seam 移行は同じ修正量で将来の再発を構造的に防ぐ。「env を渡さないといけない」という知識を各サイトに持たせ続けるのは設計として弱い。

### Alternative 3: per-site `env:` 省略を grep で検出する専用歯

- **Pros**: import を制約せずに spawn 呼び出しを直接監視できる。
- **Cons**: `env:` 引数はしばしば spawn 呼び出し行と異なる物理行にある。「引数が存在しない」ことは grep では表現できない（不在を grep で検出不能）。
- **Why not**: 「env が書いてない」という不在事実はコンテンツ grep の対象外。import の制約の方が確実。

### Alternative 4: `util/spawn.ts` seam に `AbortSignal` サポートを追加して `doctor.ts` も移行

- **Pros**: allowlist エントリなしに全サイトを seam 経由にできる。
- **Cons**: `spawn` を `execFile` 相当に拡張するのは seam の責務境界を大きく変える。doctor 以外に `AbortSignal` を必要とする用途が現時点で存在しない。
- **Why not**: 漏れの修正は D4（strip at call-site + allowlist）で完結する。seam の `AbortSignal` 対応は後続 change での評価事項（Open Question として記録）。

## Consequences

### Positive

- `src/git/` の全 subprocess が `stripSecrets` 済み env で実行され、worktree の悪意ある git hook による credential 漏洩を防ぐ。
- B-12 の歯により、新たな `node:child_process` 直接 import が seam 外に追加された時点で CI が red になる。「env を書き忘れた spawn」という invisible な漏れが「import 違反」という visible な形で検出される。
- allowlist が一方向 ratchet（CODEOWNERS ゲート）で管理されるため、エントリの追加は明示的な議論を必要とする。
- B-6 claude エントリが site 固有のパターンに絞られ、`agent-runner.ts` 内の将来の raw-env spawn が suppressされない。

### Negative

- `remote.ts` の誤り弁別ロジックが書き直されたため、既存テスト（`TC-013`、`TC-015`）の mock 形式を seam 形式に更新する必要があった。
- `execFile` → `spawn` のセマンティクス差（バッファリング、`maxBuffer`）があるが、対象コマンドが小出力であるため実運用上の影響はない。

### Known Debt

- `doctor.ts` の B-12 allowlist エントリは `util/spawn.ts` が `AbortSignal` を受け入れるようになれば削除できる。その変更まで allowlist エントリが残る。
- `remote.ts` の「git リポジトリだが origin が未設定」ケースの専用テストが未追加（`TC-004`、`should` 分類）。次イテレーションでの補完を推奨。

## References

- Request: `specrunner/changes/subprocess-credential-seam/request.md`
- Design: `specrunner/changes/subprocess-credential-seam/design.md`
- Spec: `specrunner/changes/subprocess-credential-seam/spec.md`
- 先行 ADR: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（B-1〜B-11 ratchet の確立）
- 先行 PR: #714 credential-containment（`util/git-exec.ts` / codex SDK の strip）
- Implementation: `src/util/git-exec.ts`、`src/git/dynamic-context.ts`、`src/git/remote.ts`、`src/git/transport-auth.ts`、`src/cli/doctor.ts`、`tests/unit/architecture/core-invariants.test.ts`（B-12）、`tests/unit/architecture/arch-allowlist.ts`
