# Design: auth/setup UX — login を GitHub 専用に戻し credential 保存を分離し doctor を導線の中心にする

## Context

認証まわりの "provider" が 3 系統に混線している:

- `init --provider anthropic|openai` — agent/model の既定 provider（scaffold の中身）
- `login --provider github|claude` — credential の保存先/種類
- `runtime setup` — Anthropic managed runtime

`login --provider claude` は「Claude へのログイン」ではなく、外部で `claude setup-token` が発行した token を credentials.json へコピーする保存操作である。GitHub Device Flow とは無関係な処理が 1 コマンドに同居している。

確立済みの設計原則: **provider 固有の対話認証は upstream（gh CLI / Claude Code 自身 / Codex の auth chain）に委譲する**。spec-runner が credential を保存する唯一の正当な理由は headless（cron / inbox）で OS Keychain が使えない問題を解くことである。

現状コード（検証済みの前提）:

- `src/cli/login.ts` — `provider?: "github" | "claude"`。claude 分岐は token を `readline`（`output: process.stdout`）で読み、**echo される**。GitHub 分岐は Device Flow 前に `GH_TOKEN`/`GITHUB_TOKEN` env と credentials.json の既存 token だけを見て、`gh auth token` を参照せず、**token が「在るか」だけで有効性を確認しない**。
- 実行時の GitHub token 解決順（`resolveGitHubToken`）は `GH_TOKEN → GITHUB_TOKEN → gh auth token → credentials.json`。上位の env/gh が expired でも credentials.json に有効 token があると、実行時は expired な方が使われる。
- `flag-parser.ts` は CommandDef に無い flag を handler 到達前に `Unknown flag(s)` で拒否する（handler で専用 migration メッセージを出せない）。
- doctor は fail のみが exit 非 0（warn は 0）。fail==0 でも "Ready" を出さない。
- `credentials-io.saveCredentials` は既存ファイルと **deep merge** する（他 provider key を壊さない — 検証済み）。credentials.json は 0600。
- **`login --provider anthropic` を案内する dead guidance が production 5 箇所**、加えて**`login --provider claude` を案内する箇所が 4 箇所**（D6 で全列挙）。`login --provider anthropic` は registry に存在すらしない（login flag の値は `github|claude`）。
- `init.ts` の provider 解決は `!configExists` ブロック内にのみあり、既存 global config 下では `--provider` が**無言で無視**される。
- `verifyTokenScopes(): Promise<{status, scopes}>` が GitHub client port に存在（doctor の `github-token-valid` が使用）。login はこれを再利用できる。

## Goals / Non-Goals

**Goals**:

- `login` を GitHub Device Flow 専用に戻す。既存認証の判定を「token が在るか」から「**実行時に使われる最優先 token が有効か**」へ変える。
- `credentials set claude-code` / `credentials set anthropic-api-key` を新設し、headless 用の credential 保存を login から分離する。**入力を echo しない**。
- `login --provider ...` を実在コマンドへ誘導しつつ非 0 で捕捉する（dead flag を registry に通常 flag として残さない）。
- dead guidance（`login --provider anthropic` / `login --provider claude`）を実在コマンドの案内へ全置換する。
- doctor を導線の中心にする: hint は実在コマンドのみ、headless Claude credential 未設定は warn（cron/inbox 限定の注記付き）、readiness を fail==0 とし warn 残存でも `Ready to run.` + 次の一歩を案内する。
- init の provider flag が既存 config 下で無言無視されるのをやめ、無視した事実と対処を出力する。
- README Quick Start を doctor 中心導線へ書き換える。

**Non-Goals**:

- Claude Code / Codex の対話認証そのもの（upstream 委譲、現状維持）。
- `runtime setup` の機能変更（案内文の修正のみ）。
- credentials の暗号化・Keychain 統合。
- README の Quick Start 節以外の再構成。
- operator guide（別 request）。

## Decisions

### D1: `login` を GitHub 専用化し、有効性ベースで Device Flow を判定する

`LoginOpts` から `provider` / `promptToken` を削除する。`runLogin` は GitHub Device Flow のみを担う。判定ロジック（`--force` 未指定時）:

1. 実行時と同一の `resolveGitHubToken(env, { host })` で **最優先 token と出所（`env` | `gh` | `credentials`）** を解決する。
2. 解決できた場合、その token を GitHub client の `verifyTokenScopes()` で検証し、`valid | invalid | unknown` に分類する（`github-token-valid` check と同一分類: 200=valid / 401=invalid / それ以外・timeout=unknown）。
3. 分岐:
   - **valid** → 出所を表示（例 `Already authenticated (source: gh auth token).`）して Device Flow を省略し exit 0。
   - **invalid かつ source == credentials** → credentials.json を Device Flow で更新する（下へ進む）。
   - **invalid かつ source ∈ {env(GH_TOKEN/GITHUB_TOKEN), gh}** → **Device Flow へ進まない**。credentials.json を更新しても実行時に上位 source が優先され「ログイン成功なのに動かない」となるため、その認証源の修正/解除（`GH_TOKEN` の unset / `gh auth login` の再実行等）を案内して exit 非 0。
   - **unknown（検証到達不可・timeout）** → 有効か確認できないので Device Flow へ進まず、connectivity 確認を案内して exit 非 0（既存 token を無検証で上書きしない fail-safe）。
4. `resolveGitHubToken` が throw（token が 1 つも無い）→ 初回ログインとして Device Flow へ進む。

`--force` 指定時は上記の解決/検証をすべて飛ばし、無条件で Device Flow を実行して credentials.json を上書きする（現行の force セマンティクスを維持）。

env source の具体名は `github-token-present` check と同じ方式で判定する（`GH_TOKEN` が非空なら `GH_TOKEN`、そうでなければ `GITHUB_TOKEN`）。

host / apiBaseUrl は既存の `resolveGitHubHost` / `resolveGitHubApiBaseUrl` を config から解決し、`createGitHubClient` で検証用 client を組む（`doctor.ts` と同じ composition）。login は `src/cli/`（composition layer）なので adapter import は許容される。

**Rationale**: 「token が在るか」判定は、上位 source が expired でも下位に有効 token があれば skip してしまい、実行時に expired が使われる矛盾を生む。**実行時と同じ解決順で最優先 token を検証**することで、login の判定と実行時挙動を一致させる。env/gh source の invalid で Device Flow を回すと credentials.json を更新しても無意味なので、そこは明示 fail にして「動かない成功」を消す。

**Alternatives considered**:
- token 存在のみで skip（現行）→ 実行時挙動と乖離するため却下。
- doctor に判定を委ねる → login は単体で正しく振る舞うべき（doctor 未実行でも成立させる）ため却下。検証プリミティブ（`verifyTokenScopes`）だけを共有する。
- unknown 時に Device Flow を強行 → 有効かもしれない env/credentials を無検証で上書きし、透過的に「動かない成功」を再発させ得るため却下。

### D2: `login --provider ...` は "deprecated flag" 概念で捕捉する

`FlagDef` に `deprecated?: { message: string }` を追加する。`parseFlags` は `def.deprecated` を持つ flag に遭遇した時点で（値の消費・enum 検証より前に）`FlagParseError(def.deprecated.message)` を throw する。dispatcher は既存の FlagParseError 経路で message を stderr に出し exit 2（非 0）する。

`login` は `provider` を **通常 flag ではなく deprecated marker** として登録する:

```
provider: { type: "string", deprecated: { message:
  "specrunner login is GitHub-only now. To store a Claude Code token for headless runs, run: specrunner credentials set claude-code" } }
```

deprecated flag は `LOGIN_USAGE`（help surface）に載せない。

**Rationale**: request が挙げた 2 案のうち後者（CommandSpec への deprecated flag 概念導入）。宣言的な command registry の思想に沿い、generic dispatcher を login 固有ロジックで汚さずに済む。marker は「廃止された」ことを parser 挙動（拒否＋案内）と help 非掲載で表現しており、「廃止したのに存在する通常 flag」には当たらない（request が禁止した形ではない）。将来の別 flag 廃止にも再利用できる小さな seam。

**Alternatives considered**:
- legacy argv interception（dispatcher で raw argv を pre-scan）→ generic dispatcher に login 固有の分岐が漏れ、宣言性が崩れるため却下。
- `provider` を通常 flag として温存 → request が明示的に不可としたため却下。

### D3: `credentials set <name>` サブコマンドを新設する

新規 top-level parent command `credentials`（`login` / `init` と同格、repo 不要）に `set` サブコマンドを置く。positional `<name>` は `claude-code | anthropic-api-key`（値は handler で検証。flag-parser の enum は flag 専用で positional に効かないため）。

- `claude-code` → 既存 `saveClaudeCodeOAuthToken` で `anthropic.claudeCodeOAuthToken` を保存。
- `anthropic-api-key` → 既存 `saveSpecRunnerApiKey` で `anthropic.apiKey` を保存。

両者とも `saveCredentials` 経由で credentials.json（0600）へ deep-merge 保存する（他 key を壊さない）。保存後に該当 doctor check で検証できる旨を案内する（例: `Run 'specrunner doctor' to verify (claude-code/oauth-token-present).`）。値は出力しない。

**入力の echo 抑止**（新規 `src/util/secret-input.ts` の `readSecret`）:
- **TTY**: raw mode（`stdin.setRawMode(true)`）で 1 文字ずつ受け、画面へ echo せず改行/EOT で確定する（古典的な hidden-input reader）。
- **非 TTY**: stdin を末尾まで読み trim する（cron / スクリプトからの投入経路）。

`readSecret({ isTTY, input, output })` は seam（stream 注入）でユニットテスト可能にする。

**Rationale**: 保存先・permission・merge は既存 credential I/O が満たしている（再利用）。echo 抑止は stdlib（`readline` / raw mode）で足りるので新規依存を足さない。TTY と非 TTY を分けるのは silent TTY 読取が pipe に効かず、cron 経路が stdin pipe だから。

**Alternatives considered**:
- password prompt ライブラリ導入 → 依存極小の North Star に反し、数十行で足りるため却下。
- `readline` の `_writeToOutput` mute hack → raw mode より脆く可搬性が低いため却下。

### D4: dead guidance を実在コマンドへ全置換する

`login --provider anthropic` / `login --provider claude` を案内する箇所を、実在コマンド or env の案内へ置換する。置換方針:

- managed / API key 系 → `specrunner credentials set anthropic-api-key`（または `SPECRUNNER_API_KEY` env）。
- headless Claude token 系 → `specrunner credentials set claude-code`。

「future `login --provider anthropic`」構想コメント（`anthropic.ts`）も削除する。全対象は D6 に列挙。

**Rationale**: request 要件 3 + 4。ユーザーを存在しない/廃止されたコマンドへ導く UX を根絶する。request が名指しした anthropic 5 箇所に留めず、同時に廃止される `login --provider claude` の sibling caller も全置換する（root-cause 一括修正）。

**Alternatives considered**:
- anthropic 5 箇所だけ直す → 同時廃止の `login --provider claude` 側が dead のまま残り、要件 4（hint は実在コマンドのみ）に反するため却下。

### D5: doctor を導線の中心にする

- **hint の実在性**: doctor が CLI コマンドを案内する場合、現行 registry に実在するコマンド/サブコマンドに限る。コマンドで解決できない事象（接続確認等）の hint は現状維持。機械検証は D7 のテストで固定する。
- **headless Claude credential 未設定**: `claude-code/oauth-token-present` は現行どおり **warn**（fail にしない）を維持し、hint を `specrunner credentials set claude-code` に更新のうえ「**cron / inbox 利用時のみ必要**」の注記を含める（attended 利用者の doctor を汚さない）。
- **readiness = fail==0**: `formatHuman` は Summary の後、`fail === 0` のとき `Ready to run.` と次の一歩（`specrunner request new <slug>`）を 1 行案内する。warn が残っていても Ready とする。fail>0 のときは従来どおり fail 由来の Next steps を出し、Ready は出さない。exit code は現行（fail>0 で 1、それ以外 0）を維持。

**Rationale**: 要件 4。all-pass を求めると optional な warn（headless credential 等）で永遠に "not ready" になる。実行に必要なのは fail==0 なので readiness をそこに合わせ、次の一歩まで案内して導線を閉じる。

**Alternatives considered**:
- readiness を JSON summary にも `ready` として足す → 現行の受け入れ基準・機械検証は human 出力で満たせるため今回は追加しない（YAGNI、必要になれば足す）。

### D6: dead guidance / usage の変更対象を全列挙する

`login --provider anthropic`（5）:
- `src/core/doctor/checks/config/managed-key-present.ts`
- `src/core/doctor/checks/auth/managed-key-valid.ts`
- `src/core/doctor/checks/agents/environment-provider-alive.ts`
- `src/core/doctor/checks/agents/agent-provider-alive.ts`
- `src/core/runtime/prereqs.ts`

`login --provider anthropic` 構想コメント:
- `src/core/credentials/anthropic.ts`（`ANTHROPIC_KEY_MISSING_HINT` の "future ..." 文言）

`login --provider claude`（sibling、同時廃止のため要更新）:
- `src/core/credentials/claude-code.ts`（`CLAUDE_CODE_TOKEN_MISSING_HINT`）
- `src/core/runtime/provider-readiness.ts`（`auth-missing` / `auth-invalid` の 2 hint）
- `src/core/doctor/checks/config/claude-code-token-present.ts`（warn hint）
- `src/cli/command-registry.ts` `LOGIN_USAGE`（Claude Code セクション）

usage / help surface:
- `src/cli/command-registry.ts` `LOGIN_USAGE` — `--provider` 行と Claude Code セクションを削除、GitHub 専用の説明にする。
- `src/cli/command-registry.ts` `USAGE`（top-level） — `login` 行を GitHub 専用へ、`credentials set <name>` 行を追加。
- `src/cli/command-registry.ts` — `CREDENTIALS_USAGE` を新設。

**Rationale**: 「grep every caller」。request が名指しした 5 箇所だけ直すと、同時廃止される `login --provider claude` 側が dead のまま残る。

**Alternatives considered**:
- request 記載の 5 箇所のみを対象にする → sibling が残るため却下（上記）。

### D7: 機械検証テストの配置

- **dead guidance 再発防止**: `src/` 全体に `login --provider anthropic`（および `login --provider claude`）の文字列が存在しないことを走査する grep 系テスト（`tests/` の既存 grep テスト群に倣う）。
- **doctor hint の実在性**: `src/core/doctor/**` を走査し、hint 中の `specrunner <verb> [<sub>]` が `COMMANDS`（および parent の subcommand）に実在することを検証するテスト（`tests/hint-command-existence.test.ts` を拡張、または新規）。`credentials` command / `set` subcommand が registry に在ることでこの検証を通す。
- **login migration**: `parseFlags(["--provider","claude"], <login flags>)` が `credentials set claude-code` を含む message で throw することを固定。
- **login validity 4 分岐**（valid skip / invalid+env fail / invalid+credentials device-flow / no-token device-flow）を固定。
- **credentials set** の 0600 保存と **no-echo**（TTY silent / 非 TTY stdin）を固定。
- **doctor readiness**（fail==0 → Ready + 次の一歩、fail>0 → Ready 無し）を `formatHuman` で固定。
- **doctor warn**（headless Claude credential 未設定が warn かつ cron/inbox 注記を含む）を固定。
- **init 無言無視の解消**（既存 global config + provider flag で案内を出力し、config は不変）を固定。
- **README** Quick Start が doctor 中心（`specrunner doctor` を含み、無条件必須の `login` 手順を持たない）を固定。

**Rationale**: 受け入れ基準を機械検証へ落とす。特に「dead guidance の再発防止」と「hint 実在性」は文字列走査/registry 突合という機械歯でないと規模で漏れる。

**Alternatives considered**:
- 目視レビューのみ → 再発を防げないため却下。

### D8: 既存の default-pin テストの更新（列挙）

挙動変更に伴い旧文言/旧経路を pin している既存テストを更新する:
- `src/cli/__tests__/login.test.ts` — TC-001/002/015/016/017（claude login 経路）と provider dispatch を削除し、GitHub 専用 + validity 分岐へ書き換える。claude 保存のテストは新規 credentials テストへ移す。
- `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts` — hint 期待を `login --provider claude` から `credentials set claude-code` へ更新し、cron/inbox 注記の assert を追加。
- `tests/init.test.ts` の "config exists, provider flag is ignored" は config 不変を維持したまま存置（無言無視解消の案内テストは別途追加）。

**Rationale**: 既定値/経路を pin するテストは挙動変更で必ず赤化する。事前列挙して受け入れ基準に更新許容を明記することで、pipeline が「テストを緩めた」誤検知を避ける。

**Alternatives considered**:
- 実装時に発見して都度直す → 漏れが出るため、事前列挙する。

### D9: init の provider flag 無言無視をやめる（名称は据え置き）

`init` の flag 名は `--provider` のまま（`--default-provider` へ改名しない）。`runInit` で `configExists === true` かつ `flagProvider !== undefined` の場合に、無視した事実と対処（`getConfigPath()` の config を手で編集する旨）を出力する。init は従来どおり冪等 exit 0 を維持し、config は上書きしない。併せて `init.ts` の config 生成時の無条件 `Run 'specrunner login'` 案内を **doctor 誘導**（`Run 'specrunner doctor' to see what's still needed.`）へ変える。

**Rationale**: 改名は deprecated alias の維持コスト（旧名 `--provider` を残す + 案内 + テスト）を生むが、実バグは「無言無視」であり、それは案内出力で直接直せる。受け入れ基準も改名を要求していない（YAGNI）。改名しないことで diff と surface を最小化する。

**Alternatives considered**:
- `--default-provider` へ改名 + `--provider` を deprecate 案内付きで残す → surface とテストが増える割に、無言無視の解消という本質に寄与しないため却下。

### D10: README Quick Start の doctor 中心化

Quick Start 節（`## Quick Start` 配下、"Joining an existing project" サブセクション含む）のみを次の導線へ書き換える:

`init → doctor → 不足しているものだけをセットアップ → doctor → 最初の job`

無条件の `npx specrunner login` を主手順から外し、`gh auth login` 済み / env 供給済みなら login 不要である旨を明記する。login は doctor が GitHub token 不足を指摘したときのみ実行するステップとして提示する。Quick Start 節以外は触れない。

**Rationale**: 要件 6。無条件 login 案内が「upstream 委譲済みユーザーに不要な Device Flow を踏ませる」問題の入口だったため、doctor に不足を判定させて必要な分だけ案内する導線へ反転する。

**Alternatives considered**:
- README 全体を再構成 → スコープ外。Quick Start 節に限定する。

## Risks / Trade-offs

- **[Risk] login が検証のため GitHub API を叩く（現行は叩かない）** → offline / API 障害時に valid を確認できない。**Mitigation**: unknown は Device Flow を回さず connectivity 案内で非 0 終了する fail-safe とし、`--force` で常に Device Flow を回す逃げ道を残す。
- **[Risk] TTY silent 読取（raw mode）はプラットフォーム挙動差・テスト困難** → **Mitigation**: `readSecret` を stream 注入の seam にし、非 TTY 経路（stdin pipe）を主テスト対象にする。TTY 経路は「echo 用 output stream に secret が書かれない」「raw mode が有効化される」を fake stdin で検証する。
- **[Risk] deprecated flag を parser で throw する（handler より前）ため、message は usage と併記で出る** → **Mitigation**: message 自体に移行先コマンドを含め、非 0 終了と案内という受け入れ基準を満たす。
- **[Risk] `login --provider claude` の sibling caller を漏らすと dead guidance が残る** → **Mitigation**: D6 で全列挙し、D7 の src 全体 grep テストで再発を機械検出する。
- **[Trade-off] init の flag を改名しない** → 命名の曖昧さは残るが、無言無視という実害は解消し、surface を増やさない。

## Open Questions

なし（validity の unknown 分岐、flag 改名の採否、migration 実現方式はいずれも本 design で確定した）。
