# ADR: auth/setup UX — login を GitHub 専用に戻し credential 保存を分離し doctor を導線の中心にする

**Date**: 2026-08-16
**Status**: Accepted

## Context

認証まわりの "provider" が 3 系統に混線していた: `init --provider anthropic|openai`（agent/model の既定 provider）、`login --provider github|claude`（credential の保存先/種類）、`runtime setup`（Anthropic managed runtime）。

`login --provider claude` は「Claude へのログイン」ではなく、外部ツールが発行した token を credentials.json へコピーする保存操作であり、GitHub Device Flow とは無関係な処理が 1 コマンドに同居していた。

実害:
- 存在しない `login --provider anthropic` を doctor / runtime が production 5 箇所で案内していた。
- `login --provider claude` の secret 入力が `readline.question` で echo されていた。
- login が Device Flow 前に確認するのは `GITHUB_TOKEN` env と credentials.json の既存 token のみで `gh auth token` を参照せず、「token が在るか」だけで有効性を確認しなかった。実行時の解決順は GH_TOKEN → GITHUB_TOKEN → `gh auth token` → credentials.json であり、上位 source が expired でも credentials.json に有効 token があれば login が Device Flow をスキップし、実行時には expired な上位 source が使われる矛盾が生じていた。
- `init --provider` が既存 global config 下で無言無視されていた。

設計原則は既に確立されていた: **provider 固有の対話認証は upstream（gh CLI / Claude Code 自身）に委譲し、spec-runner は抱え込まない。spec-runner が credential を保存する正当な理由は headless（cron / inbox）で OS Keychain が使えない問題を解くことだけである。**

## Decision

### 1. login を GitHub 専用化し有効性ベースの判定に変える

`LoginOpts` から `provider` を削除する。`runLogin` は GitHub Device Flow のみを担う。

Device Flow の判定ロジック（`--force` 未指定時）:

1. 実行時と同一の `resolveGitHubToken(env, { host })` で **最優先 token と出所** を解決する。
2. 解決できた場合、`verifyTokenScopes()` で有効性を検証し `valid | invalid | unknown` に分類する。
3. 分岐:
   - **valid** → 出所を表示して Device Flow を省略し exit 0。
   - **invalid かつ source == credentials** → Device Flow で更新へ進む。
   - **invalid かつ source ∈ {GH_TOKEN, GITHUB_TOKEN, gh}** → Device Flow へ進まない。credentials.json を更新しても実行時に上位 source が優先されるため、その認証源の修正/解除を案内して exit 非 0。
   - **unknown（GitHub API 到達不可/timeout）** → Device Flow へ進まず、connectivity 確認を案内して exit 非 0（有効かもしれない token を無検証で上書きしない fail-safe）。
4. `resolveGitHubToken` が throw（token が 1 つも無い）→ 初回ログインとして Device Flow へ進む。

`--force` 指定時は解決/検証をすべてスキップし、無条件で Device Flow を実行して credentials.json を上書きする。

#### Alternative A: token 存在のみで skip（現行方式）

**Pros**: GitHub API 呼び出しが不要、offline でも動作する。  
**Why not**: 実行時の token 解決順と判定が乖離する。上位 source（GH_TOKEN 等）が expired でも credentials.json に有効 token があれば login がスキップし、実行時には expired な上位 source が使われる「動かない成功」状態になる。

#### Alternative B: validity 不明時に Device Flow を強行

**Pros**: ユーザーは常に「何かしら token を得た」状態で終われる。  
**Why not**: 有効かもしれない既存 token を無検証で上書きするため、偶発的なダウングレードが起きる。また「Device Flow に成功したのに動かない」という透過的な障害を再発させる。

### 2. 廃止 flag を parser の `deprecated` マーカーで捕捉する

`FlagDef` に `deprecated?: { message: string }` を追加する。`parseFlags` は `def.deprecated` を持つ flag に遭遇した時点で `FlagParseError(def.deprecated.message)` を throw する。dispatcher は既存の FlagParseError 経路で message を stderr に出し exit 2 とする。

`login` は `--provider` を **通常 flag ではなく deprecated マーカー** として登録し、help surface（`LOGIN_USAGE`）に載せない。

#### Alternative A: legacy argv interception（dispatcher で raw argv を pre-scan）

**Pros**: `FlagDef` 型を変更せず、既存 flag-parser をそのまま使える。  
**Why not**: generic dispatcher に login 固有の分岐が漏れ込み、宣言的な command registry の思想が崩れる。将来の別 flag 廃止ごとに dispatcher を修正する必要が生じる。

#### Alternative B: `--provider` を通常 flag として温存し handler 側で拒否

**Pros**: コード変更が最小。  
**Why not**: 廃止されたのに registry に正規 flag として存在することになり、request が明示的に禁じた形（「廃止したのに存在する通常 flag は不可」）に当たる。help surface に `--provider` が残り、誤解を招く。

### 3. `credentials set <name>` を新設し credential 保存を login から分離する

新規 top-level command `credentials` に `set` サブコマンドを置く。positional `<name>` は `claude-code | anthropic-api-key`（handler 側で検証）。

- `claude-code` → `saveClaudeCodeOAuthToken` で `anthropic.claudeCodeOAuthToken` を保存。
- `anthropic-api-key` → `saveSpecRunnerApiKey` で `anthropic.apiKey` を保存。

保存は `saveCredentials`（deep-merge、0600）経由。他の provider key は壊さない。

**secret 入力の echo 抑止**（新規 `src/util/secret-input.ts` の `readSecret`）:
- **TTY**: raw mode で 1 文字ずつ受け、output へ echo せず改行/EOT で確定。
- **非 TTY**: stdin を EOF まで読み trim（cron / スクリプト経由）。

`readSecret({ isTTY, input, output })` は stream 注入でユニットテスト可能にする。

#### Alternative A: password prompt ライブラリ導入（`inquirer` / `prompts` 等）

**Pros**: battle-tested、マスク表示・カーソル制御など追加 UX が付属。  
**Why not**: 依存極小を最大の強みとする North Star に反する。raw mode + stdin 読み取りの約 40 行で要件を満たせるため新規依存を追加する正当性がない。

#### Alternative B: `readline` の `_writeToOutput` mute hack

**Pros**: `readline` は既に使用済みで追加 import が不要。  
**Why not**: `_writeToOutput` は private API でありブラウザ互換性もない。Bun/Node バージョンアップで無予告に壊れる可能性がある。raw mode の方が動作が明示的で可搬性が高い。

### 4. dead guidance を全廃し機械検証で再発を防ぐ

`login --provider anthropic`（5 箇所）・`login --provider claude`（4 箇所）の案内をすべて実在コマンド（`credentials set anthropic-api-key` または `SPECRUNNER_API_KEY` env / `credentials set claude-code`）の案内へ置換する。「future `login --provider anthropic`」構想コメントも削除する。

再発防止: `tests/dead-guidance.test.ts` が `src/` 全 .ts ファイルを grep し `login --provider anthropic` / `login --provider claude` の文字列が存在しないことを機械検証する。

### 5. doctor を導線の中心にする（readiness = fail == 0）

- **hint の実在性**: doctor が CLI コマンドを案内する場合、現行 registry に実在するコマンドに限る。`tests/hint-command-existence.test.ts` が `src/core/doctor/**` を走査し、hint 中の `specrunner <verb> [<sub>]` が registry に実在することを継続的に機械検証する。
- **headless Claude credential 未設定**: `claude-code/oauth-token-present` は **warn**（fail にしない）。hint に「cron / inbox 利用時のみ必要」の注記と `specrunner credentials set claude-code` の誘導を含める（attended 利用者の doctor を汚さない）。
- **readiness = fail == 0**: `formatHuman` は `fail === 0` のとき `Ready to run.` と次の一歩（`specrunner request new <slug>`）を 1 行案内する。warn が残っていても Ready とする。fail > 0 のときは Ready を出さない。exit code は現行（fail > 0 で 1、それ以外 0）を維持。

#### Alternative A: readiness を all checks pass で判定

**Pros**: 厳格、「全項目が green でなければ Ready を出さない」という直感的な意味。  
**Why not**: headless 用 Claude credential 未設定（warn）が残っていると attended 利用者が永遠に "not ready" になる。attended 利用者には不要な項目が readiness をブロックすべきではない。

#### Alternative B: JSON summary に `ready` フィールドを追加

**Pros**: machine-parseable な readiness 判定が可能になる。  
**Why not**: 受け入れ基準は human 出力の検証で満たせるため今回は不要（YAGNI）。必要になれば後から足せる。

### 6. init の provider flag 無言無視をやめる（flag 名は据え置き）

flag 名は `--provider` のまま（`--default-provider` へ改名しない）。`configExists === true` かつ `flagProvider !== undefined` の場合に、無視した事実と対処（config ファイルの編集場所）を出力する。init は冪等 exit 0 を維持し config は上書きしない。config 生成時の無条件 `Run 'specrunner login'` 案内を `specrunner doctor` への誘導へ変える。

#### Alternative A: `--default-provider` へ改名し `--provider` を deprecated alias として残す

**Pros**: flag 名が「agent/model の既定 provider を設定する値」だと明示される。  
**Why not**: 無言無視の解消という本質的なバグは flag 名とは独立に案内出力で直接直せる。改名すると deprecated alias の維持コスト（旧名 `--provider` の案内・テスト）が増える割に、受け入れ基準が改名を要求していない（YAGNI）。

### 7. README Quick Start を doctor 中心導線へ反転する

Quick Start 節のみを次の導線へ書き換える:

`init → doctor → 不足しているものだけをセットアップ → doctor → 最初の job`

`gh auth login` 済み / env 供給済みなら `specrunner login` は不要であることを明記する。Quick Start 節以外は触れない。

## Consequences

### Positive

- auth に関する単一の設計原則（upstream 委譲、headless のみ spec-runner が保存）が CLI 体系に一貫して表れる。
- login の判定と実行時 token 解決順が一致し、「ログイン成功なのに動かない」状態が消える。
- dead guidance の再発が機械歯（grep テスト + hint 実在性テスト）で防がれる。
- doctor が readiness の信頼できる判定者になり、attended 利用者に unnecessary な warn を押しつけない。
- `deprecated` flag 機構は将来の他 flag 廃止にも再利用できる。

### Negative / Neutral

- login が有効性確認のため GitHub API を叩くようになる（現行は叩かない）。offline / API 障害時に unknown 扱いで fail する。`--force` 逃げ道を維持することで緩和。
- TTY silent 読取（raw mode）はプラットフォーム挙動差がある。stream 注入 seam でテスト可能にすることで緩和。
- init の flag 名の曖昧さ（`--provider` = 「agent の既定 provider」vs login の provider）は残る。無言無視の実害は解消。

## Files Changed

| File | Change |
|------|--------|
| `src/cli/login.ts` | MODIFIED: `provider`/`promptToken` 削除。validity ベースの Device Flow 判定ロジック実装 |
| `src/cli/credentials.ts` | NEW: `credentials set <name>` handler |
| `src/util/secret-input.ts` | NEW: `readSecret` — TTY silent / 非 TTY stdin の echo なし secret 読取 |
| `src/cli/flag-parser.ts` | MODIFIED: `FlagDef` に `deprecated?: { message }` 追加。遭遇時に `FlagParseError` を throw |
| `src/cli/command-registry.ts` | MODIFIED: `credentials` command 追加、`LOGIN_USAGE` から `--provider` 削除、`login.flags.provider` を deprecated マーカーへ変更、top-level `USAGE` に `credentials set` 行追加 |
| `src/cli/init.ts` | MODIFIED: 既存 config + provider flag の notice 出力、init 完了時の案内を `specrunner doctor` 誘導へ |
| `src/core/credentials/anthropic.ts` | MODIFIED: dead guidance コメント削除 |
| `src/core/credentials/claude-code.ts` | MODIFIED: hint を `credentials set claude-code` へ更新 |
| `src/core/doctor/checks/config/claude-code-token-present.ts` | MODIFIED: hint に `credentials set claude-code` + cron/inbox 限定注記 |
| `src/core/doctor/checks/config/managed-key-present.ts` | MODIFIED: dead guidance → `credentials set anthropic-api-key` |
| `src/core/doctor/checks/auth/managed-key-valid.ts` | MODIFIED: dead guidance → `credentials set anthropic-api-key` |
| `src/core/doctor/checks/agents/agent-provider-alive.ts` | MODIFIED: dead guidance → `credentials set anthropic-api-key` |
| `src/core/doctor/checks/agents/environment-provider-alive.ts` | MODIFIED: dead guidance → `credentials set anthropic-api-key` |
| `src/core/runtime/prereqs.ts` | MODIFIED: dead guidance → `credentials set anthropic-api-key` |
| `src/core/runtime/provider-readiness.ts` | MODIFIED: dead guidance → `credentials set claude-code` |
| `src/core/doctor/formatter.ts` | MODIFIED: `fail === 0` 判定で `Ready to run.` + 次の一歩を出力 |
| `README.md` | MODIFIED: Quick Start 節を doctor 中心導線へ書き換え |
| `tests/dead-guidance.test.ts` | NEW: `src/` 全 .ts に dead guidance 文字列が無いことを機械検証 |
| `tests/hint-command-existence.test.ts` | MODIFIED: doctor hint 中の `specrunner` コマンドが registry に実在することを機械検証 |
| `tests/credentials.test.ts` | NEW: `credentials set` の 0600 保存・no-echo・deep-merge を固定 |
| `tests/doctor-readiness.test.ts` | NEW: readiness = fail==0 の挙動を固定 |
| `tests/init-provider-notice.test.ts` | NEW: 既存 config + provider flag で notice 出力・config 不変を固定 |
| `tests/readme-quickstart.test.ts` | NEW: Quick Start が doctor 中心で無条件 login 手順を持たないことを固定 |
| `tests/unit/cli/login.test.ts` | MODIFIED: validity 4 分岐・migration 捕捉・force 動作を固定 |
| `tests/unit/cli/removed-commands.test.ts` | MODIFIED: deprecated `--provider` の migration メッセージ捕捉を固定 |
| `src/cli/__tests__/login.test.ts` | MODIFIED: claude login 経路テストを削除し GitHub 専用 + validity 分岐へ書き換え |
