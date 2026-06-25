# subprocess / SDK spawn と log から credential を漏らさない（B-6 / B-7 封じ込めの実適用）

## Meta

- **type**: bug-fix
- **slug**: credential-containment
- **base-branch**: main
- **adr**: false

## 背景

中核不変条件の一つは「秘密（GitHub token / API キー）を子プロセスや外部 SDK に継承させない（B-6）／ログに出さない（B-7）」。`stripSecrets` seam と `maskSensitive` は存在するが、最も危険な call-site がこれらを経由せず raw `process.env` を継承する／マスクし損なっている。

- codex(OpenAI) runtime では別ベンダのプロセスへ GitHub / Anthropic キーがクロスプロバイダ漏洩する。
- `git-exec` と verification の `git show` は full `process.env` を継承するため、worktree の git hook 等に秘密が露出する。
- denylist が固定5キーのみで、GitHub Enterprise host token や別名の秘密を取りこぼす。
- `maskSensitive` が underscore を含むキー本体や大文字プレフィックスを取りこぼす。
- B-6 を強制する歯が `src/core/` しか走査しないため、これらの漏れは CI 緑のまま検出されず再発し放題になっている。

本 request は seam を全 spawn 入口に実適用し、denylist のカバレッジを上げ、log mask を直し、歯の走査範囲を adapter / util へ広げて再発を構造的に防ぐ。agent の shell / 一般ツール使用を壊さないため、env は denylist 方式（全継承マイナス秘密）を維持する。

## 現状コードの前提

- `src/adapter/codex/agent-runner.ts:267` — codex SDK インスタンス生成のデフォルトが `() => new sdk!.Codex()` で、`env` オプションを渡さない。
- `src/adapter/claude-code/agent-runner.ts:268,287` — claude adapter は `stripSecrets(process.env)` を作り `env:` として SDK に渡す（参照実装）。
- `src/util/git-exec.ts:14-32` — `runSubprocess` が `env` を指定せず spawn し、full `process.env` を継承する。
- `src/git/transport-auth.ts:5-7,72` — git のリモート認証は `git -c http.<scope>.extraheader=...` 注入で行い、env のトークンに依存しない（git-exec から秘密を抜いても push / fetch は影響を受けない）。
- `src/core/verification/runner.ts` の package.json integrity check — `spawn("git", ["show", ...], { cwd, shell: false })` が `env` を指定せず full `process.env` を継承する。
- `src/util/env-filter.ts:12-18` — `SECRET_DENYLIST` は固定5キー（`GH_TOKEN` / `GITHUB_TOKEN` / `SPECRUNNER_API_KEY` / `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`）で、パターンや GitHub Enterprise host token を含まない。
- `src/logger/stdout.ts:141-148` — `MASK_PATTERNS` は case-sensitive（`i` フラグ無し）。
- `src/logger/stdout.ts:154-164` — `maskSensitive` は match に `_` が含まれると最初の `_` で切るため、`_` を含む sk-ant- / sk- キーの本体（最初の `_` より前）がマスクされず残る。
- `tests/unit/architecture/core-invariants.test.ts:328-339` — B-6 の歯は `grepE("process\\.env", "src/core")` で `src/core/` のみを走査し、`src/adapter/` `src/util/` の spawn を検査しない。

## 要件

1. codex adapter の SDK 生成を `new Codex({ env: <stripSecrets 済み env>, ... })` にし、codex subprocess が秘密を継承しないようにする。codex 自身の認証は denylist 済み env または `apiKey` オプションで明示的に渡す。
2. `src/util/git-exec.ts` の spawn に stripSecrets 済み env を渡す（git 認証は extraheader 注入のため push / fetch は影響を受けない）。
3. `src/core/verification/runner.ts` の integrity check の `git show` を stripSecrets seam 経由にする。
4. `SECRET_DENYLIST` を **denylist 方式のまま拡張**する。固定キーに加え、`*_TOKEN` / `*_API_KEY` / `*_SECRET`（大文字小文字無視）のパターンと GitHub Enterprise host token を strip 対象にする。`PATH` / `HOME` 等の benign 変数は保持し、agent の shell / 一般ツール使用に影響を与えない。
5. `maskSensitive` を修正する。トークンパターンを case-insensitive にし、`_` を含むキー本体がマスクから漏れないようにする。
6. B-6 を強制する歯（`tests/unit/architecture/core-invariants.test.ts`）の grep 走査範囲を `src/adapter/` と `src/util/` に拡張し、stripSecrets を経由しない spawn / SDK env 注入を検出できるようにする。既存の seam 経由 call-site（claude adapter 等）は allow とする。

## スコープ外

- B-5 / B-8 / B-9 の歯の拡張、動的 import の closure 検査（別 request: 歯の健全化）。本 request は B-6 の走査範囲のみ拡張する。
- agent の Bash がディスク上の `credentials.json` を直接読む経路（FS / sandbox の領分）。env hygiene では塞げないため本 request では扱わない。
- `credentials.json` のファイル権限強制（warn → refuse）や loose-permission の auto-tighten。
- GitHub API client の next-URL same-origin チェック。
- findings パース健全性（別 request: findings-parse-soundness）。

## 受け入れ基準

- [ ] codex runtime の agent subprocess が `GH_TOKEN` / `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` / `SPECRUNNER_API_KEY` を含まない env で起動することをテストで固定する。
- [ ] `git-exec` 経由の spawn と verification の `git show` が stripSecrets 済み env で起動することをテストで固定する。
- [ ] `SECRET_DENYLIST` 拡張後、`*_TOKEN` / `*_API_KEY` / `*_SECRET` 系と GitHub Enterprise host token が strip され、`PATH` 等の benign 変数は保持されることをテストで固定する。
- [ ] `maskSensitive` が `_` を含む sk-ant- / sk- キーと大文字プレフィックスのキーの本体を漏らさないことをテストで固定する。
- [ ] B-6 の歯が `src/adapter/` `src/util/` を走査し、stripSecrets を経由しない spawn を検出することを確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- env は **denylist 方式（全継承マイナス秘密）を維持**する。却下案: from-scratch allowlist（必要な変数だけ通す）。`PATH` / `LANG` / `XDG_*` 等の benign 変数を取りこぼし agent の shell / ツール使用を壊すため却下。カバレッジ不足はパターン strip + 既知 host token 追加で補う。
- codex は SDK の `env` オプションで塞ぐ。却下案: 起動時に親 `process.env` から秘密を `delete`。codex SDK が `CodexOptions.env`（指定時 `process.env` を継承しない）を提供しており、グローバル env の変異は並列 fan-out で racy になるため、SDK の env オプションを使う方が安全。
- 修正と同じ request で **B-6 の歯を拡張**して再発を構造的に防ぐ。却下案: 修正のみ。歯が adapter / util を見ないままだと、将来の env 素通り変更が CI 緑のまま再混入する（本問題そのものの再来）ため、ガードを同梱する。
- 外部制約: `@openai/codex-sdk`（v0.130）の `CodexOptions` は `env?: Record<string, string>`（指定時 `process.env` を継承しない）と `apiKey?: string` を持つ。
