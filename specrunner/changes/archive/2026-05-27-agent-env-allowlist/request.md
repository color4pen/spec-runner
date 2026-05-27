# agent 実行時の env から credential key を除去して漏洩を構造的に防止する

## Meta

- **type**: spec-change
- **slug**: agent-env-allowlist
- **base-branch**: main
- **adr**: false

## 背景

agent (Claude Code SDK) 起動時に `process.env` がフィルタなしで子プロセスに継承される。`permissionMode: "bypassPermissions"` + Bash 許可の構成で agent が `echo $GITHUB_TOKEN` 等を実行すると認証情報が漏洩する。prompt injection がなくても、agent が意図せず env を参照するケースは起こりうる。

Closes #422

## 要件

1. `src/util/spawn.ts:44` の `spawnCommand()` で `process.env` から secret を除去した env を渡す
2. secret として除去する対象: `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`
3. `src/adapter/claude-code/agent-runner.ts:185-194` の `queryOptions` に env フィルタ済みの環境変数を渡す（SDK は `env` フィールドをサポート済み — `sdk.d.ts:1232` で確認）
4. `src/core/runtime/local.ts:97-104` の `buildSdkOptions` も同様に対策
5. `src/core/verification/commands.ts:56-60` の `spawn("sh", ["-c", command])` も同じ env フィルタを適用する
6. `src/core/verification/runner.ts:74` の `spawnScript()` fallback 経路（verification.commands 未設定時）も同じ env フィルタを適用する

## スコープ外

- `permissionMode: "bypassPermissions"` の廃止（CI/CD ランナーとして必須の設計）
- prompt injection 防御の強化（`<user-request>` タグ等は既存のまま）
- agent に渡す tool allowlist の変更

## 受け入れ基準

- [ ] `spawnCommand()` が渡す env に `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` が含まれない
- [ ] verification commands の spawn にも同じフィルタが適用される
- [ ] opts.env で明示的に渡された変数は引き続き機能する（既存の PATH 拡張等）
- [ ] 既存テストが通る + フィルタのユニットテストが追加される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

env フィルタは `spawnCommand()` 内部に組み込む案と、呼び出し側でフィルタする案がある。`spawnCommand()` はプロジェクト内の全 subprocess の共通経路なので、ここに組み込むことで漏れを構造的に防ぐ。ただし将来 secret を env 経由で渡す必要が出た場合に備え、opts.env による明示的上書きは維持する。

方式は denylist（対象 key を明示列挙して除去）。allowlist（許可する key を列挙）ではない。将来 secret key が増えた場合は denylist に都度追加する運用。

全対象 key は起動時に解決済みでインスタンスに保持されており、env に残す必要がない:
- `GITHUB_TOKEN` → `GitHubClient` コンストラクタ引数で保持
- `SPECRUNNER_API_KEY` → `resolveAnthropicApiKey()` で解決済み、managed runtime のみ使用
- `ANTHROPIC_API_KEY` → specrunner 自身は未使用。local runtime の Claude Code SDK は独自の認証機構を持ち env 依存しない
- `ANTHROPIC_BASE_URL` → 別 request (#429) で SDK に baseURL を明示するため env override を残す必要なし
