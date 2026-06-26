# 全 subprocess spawn を stripSecrets seam に集約し、env 省略による credential 継承を構造的に塞ぐ

## Meta

- **type**: spec-change
- **slug**: subprocess-credential-seam
- **base-branch**: main
- **adr**: true

## 背景

直前の credential-containment（PR #714）は codex SDK / `util/git-exec.ts` / verification の `git show` を `stripSecrets` 経由にし、B-6 の歯を `src/core` / `src/adapter` / `src/util` へ拡張した。しかし**同じクラスの漏れが残っている**: `node:child_process` を直接使い、`env:` オプションを省略した subprocess 呼び出しは、Node のデフォルト挙動で full `process.env`（`GH_TOKEN` / `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` / `SPECRUNNER_API_KEY` および全 `*_TOKEN` / `*_API_KEY` / `*_SECRET`）を子プロセスへ継承させる。

最も危険なのは `src/git/dynamic-context.ts` で、これは**毎パイプライン run の冒頭に、agent が書き換える worktree（semi-untrusted）の cwd で** `git log` / `git diff` を spawn する。worktree に悪意ある `.git/hooks` / `core.hooksPath` 等が仕込まれていれば、継承された秘密を hook が exfiltrate できる。これは credential-containment が背景で名指しした「worktree の git hook 等に秘密が露出」脅威そのものであり、対象範囲（src/git）だけが取りこぼされていた。

構造的な根因は2つ:
1. subprocess の spawn 経路が `stripSecrets` を強制する seam（`util/spawn.ts` / `util/git-exec.ts`）に集約されておらず、各所が `node:child_process` を直接 import して spawn できる。
2. B-6 の歯は `process.env` の直接参照を grep で検出する方式のため、**「env オプションを省略した spawn」（process.env を一度も書かずに継承する漏れ）を原理的に検出できない**。env を足し忘れた spawn は CI 緑のまま通る。

本 request は漏れている全サイトを seam 経由に揃え、再発を構造的に防ぐ guard を入れて、credential 封じ込めをこのクラス全体で完成させる。

## 現状コードの前提

- `src/util/spawn.ts:45-47` — `spawnCommand` は `opts.env` 未指定でも `stripSecrets(process.env)` を子へ渡す（seam として正しく strip する）。
- `src/util/git-exec.ts:19` — `runSubprocess` も `stripSecrets(process.env)` を渡す（PR #714 で修正済み）。
- 以下は `node:child_process` を直接 import し、`env:` を渡さず full `process.env` を継承する（漏れ）:
  - `src/git/dynamic-context.ts:42` — `await execFileAsync("git", args, { cwd })`。呼出元 `src/core/command/runner.ts:179` `collectDynamicContext(workspace.cwd, ...)`（毎 run・worktree cwd）。
  - `src/git/remote.ts:27` `execFileAsync("git", ["remote","get-url","origin"], { cwd })` と `src/git/remote.ts:43` `execFileAsync("git", ["rev-parse","--git-dir"], { cwd })`。呼出元 `src/core/preflight.ts:97`（毎 run / inbox / archive）。
  - `src/git/transport-auth.ts:159` — `execFileAsync("git", ["remote","get-url","origin"], { cwd })`。
  - `src/cli/doctor.ts:67` — `buildExecFile` の `execFileAsync(file, args, { timeout, signal })` が `env` を渡さない（`git --version` / `codex --version` / `git remote get-url` 等）。composition-root・pipeline 経路外・cwd は repo root のため相対的に低リスク。
- `grep -rn "env:" src/git/` は 0 件（src/git のどの spawn も env を渡していない）。
- B-6 の歯: `tests/unit/architecture/core-invariants.test.ts:343-345` の `grepE("process\\.env", ...)` は `src/core` / `src/adapter` / `src/util` のみ走査し、`src/git`（コメント上 shared-kernel 分類）を含まない。かつ grep 方式のため env 省略 spawn は検出対象外。
- `node:child_process` を直接 import する src ファイル: seam = `src/util/spawn.ts` / `src/util/git-exec.ts`、strip 済み直接利用 = `src/core/verification/commands.ts:7`（`commands.ts:70` で `{...stripSecrets(env), PATH}`）/ `src/core/verification/runner.ts:9`（`runner.ts:78,186` で stripSecrets）、漏れ = `src/git/*`（3 ファイル）/ `src/cli/doctor.ts`。
- `tests/unit/architecture/arch-allowlist.ts` の B-6 claude エントリ pattern は `"as Record<string, string | undefined>"`（このファイルの汎用 cast idiom）で、`src/adapter/claude-code/agent-runner.ts` 内では将来の cast 付き env 漏れも黙って allow してしまう（同ファイル内の guard 抜け）。

## 要件

1. 漏れている全 subprocess 呼び出しを `stripSecrets` 済み env で起動する: `src/git/dynamic-context.ts` / `src/git/remote.ts` / `src/git/transport-auth.ts` の execFile 呼び出し、および `src/cli/doctor.ts` の execFile アダプタ。git の認証は extraheader 注入（`transport-auth.ts`）で env トークンに依存しないため、env から秘密を抜いても push / fetch / log / diff / remote 参照は壊れない。
2. 再発を構造的に防ぐ guard を追加する。**B-6 の現行 grep（`process.env` 参照）は env 省略 spawn を検出できない**ため、別機構が要る。推奨は「subprocess spawn 経路を seam に集約し、`node:child_process` の直接 import を seam モジュール（`util/spawn.ts` / `util/git-exec.ts`）以外で禁止する歯」。seam 外で直接 spawn が必要な composition-root 等は理由付きで allowlist する。機構の最終決定は design に委ねる（全面 seam 集約 / per-site env 明示 + spawn-site 専用歯 のいずれか）。
3. B-6 allowlist の claude エントリ pattern を、汎用 cast idiom から site 固有の識別子（例: `resolveClaudeCodeOAuthTokenFn(` 等、resolver 呼出行を一意に指すもの）へ狭め、同ファイル内の将来の env 漏れを allow しないようにする（`arch-allowlist.ts:29-34` の MATCHING SEMANTICS 規約に合わせる）。

## スコープ外

- 既にマージ済みの credential-containment / findings-parse-soundness のロールバック（不要。両者は受け入れ基準を満たしている）。
- `verification/commands.ts` / `verification/runner.ts` の機能変更（既に stripSecrets 済み。seam 集約方針を採る場合の移行対象にはなり得るが、漏れの修正対象ではない）。
- managed `isGitHubDirectoryListing` の JSON 配列ファイル false-positive（別件・fail-safe で実害低）。
- agent の Bash がディスク上の `credentials.json` を読む経路（FS / sandbox の領分。env hygiene の対象外）。

## 受け入れ基準

- [ ] `src/git/` の全 subprocess（dynamic-context / remote / transport-auth）が `stripSecrets` 済み env で git を起動することをテストで固定する。
- [ ] `src/cli/doctor.ts` の execFile が `stripSecrets` 済み env で起動する（または composition-root として理由付き allowlist される）ことをテストまたは guard で固定する。
- [ ] env 省略による credential 継承 spawn を検出する guard が存在し、修正前の `src/git` の状態（env 無し execFile）に対して red になることを確認する。
- [ ] `node:child_process` の直接 import が seam モジュール以外で（allowlist を除き）禁止されること、または同等の spawn-site guard が機能することをテストで固定する。
- [ ] B-6 allowlist の claude エントリ pattern が狭まり、`src/adapter/claude-code/agent-runner.ts` 内の cast 付き raw-env spawn を注入すると歯が red になることをテストで固定する。
- [ ] git の push / fetch / log / diff / remote 参照が env 変更後も機能することを既存テストで担保する（退行なし）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: subprocess spawn を `stripSecrets` 強制 seam に集約し、直接 `node:child_process` 利用を禁止する構造 guard。**却下: B-6 grep に `src/git` を足すだけ** — grep は `process.env` 参照を見るため env 省略 spawn（process.env を書かない漏れ）を原理的に捕まえられず、本問題の再発を防げない。漏れの本体は「env を渡し忘れた spawn」であり、検出には spawn 経路そのものを縛る必要がある。
- **採用**: git 系 execFile の env strip は安全。git のリモート認証は `git -c http.<scope>.extraheader=...` 注入（`transport-auth.ts`）で行い env トークンに依存しないため、秘密を抜いても transport は壊れない。
- **doctor の扱い**: pipeline 経路外・cwd=repo root・`--version`/`whoami`/origin 参照のみで相対的に低リスク。seam 移行が過剰なら理由付き allowlist で可（design 判断）。ただしクラスとしては漏れなので未対応のまま放置はしない。
- **type / adr**: 構造 guard（spawn seam 集約 + 直接 import 禁止）という設計追加を含むため bug-fix でなく spec-change とし、seam 集約ルールを ADR に記録する（`adr: true`）。
