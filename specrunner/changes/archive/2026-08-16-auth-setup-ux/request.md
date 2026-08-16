# auth/setup UX の整理: login を GitHub 専用に戻し、credential 保存を分離し、doctor を導線の中心にする

## Meta

- **type**: spec-change
- **slug**: auth-setup-ux
- **base-branch**: main
- **adr**: true

## 背景

認証まわりの "provider" が 3 系統に混線している: `init --provider anthropic|openai`(agent/model の既定 provider)、`login --provider github|claude`(credential の保存先/種類)、`runtime setup`(Anthropic managed runtime)。`login --provider claude` は「Claude へのログイン」ではなく、`claude setup-token` で別途発行した token を credentials.json へコピーする保存操作であり、GitHub Device Flow とはまったく別の処理が 1 コマンドに同居している。

設計原則は既に確立している: **provider 固有の対話認証は upstream(gh CLI / Claude Code 自身 / Codex の auth chain)に委譲し、spec-runner は抱え込まない**。spec-runner が credential を保存する正当な理由は headless(cron / inbox)で Keychain が使えない問題を解くことだけである。この原則にコマンド体系を揃える:

- `specrunner login` = GitHub ログインだけ
- `specrunner credentials set claude-code` = headless 用 Claude Code token の保存
- `specrunner credentials set anthropic-api-key` = managed runtime 用 API key の保存
- `specrunner doctor` = 何が足りないかと次のコマンドを案内する導線の中心

実害も出ている(現状コードの前提を参照): 存在しない `login --provider anthropic` を doctor / runtime が案内している、secret 入力が echo される、GitHub 認証済みユーザーに再度 Device Flow を踏ませ得る、`init --provider` が既存 global config 下で無言無視される。

## 現状コードの前提

- `src/cli/login.ts:14` — `provider?: "github" | "claude"`。claude 分岐は `saveClaudeCodeOAuthToken` による token 保存。token 入力は `readline.question`(137-138 行)で **echo される**
- login が Device Flow 前に確認するのは `GITHUB_TOKEN` env と credentials.json の既存 token のみ。`gh auth token` は参照しない。一方、実行時の GitHub token 解決順は GH_TOKEN → GITHUB_TOKEN → `gh auth token` → credentials.json であり、`gh auth login` 済みユーザーに login は不要
- resolver は token を「見つける」だけで有効性は確認しない。有効性確認は doctor の `github-token-valid` が GitHub API で別途行う。したがって上位の認証源(GH_TOKEN 等)が expired の場合、credentials.json に有効な token があっても実行時は expired な方が使われる
- flag parser は CommandDef に存在しない flag を handler 到達前に `Unknown flag(s): --provider` で拒否する(専用 migration メッセージは handler では出せない)
- doctor は warn があっても exit 0(fail のみが非 0)
- init は user-global config 生成時に無条件で「Run 'specrunner login'」を案内している
- **存在しない `specrunner login --provider anthropic` の案内が production 5 箇所**: `src/core/doctor/checks/config/managed-key-present.ts:22` / `src/core/doctor/checks/auth/managed-key-valid.ts:22` / `src/core/doctor/checks/agents/environment-provider-alive.ts:22` / `src/core/doctor/checks/agents/agent-provider-alive.ts:33` / `src/core/runtime/prereqs.ts:35`。API key resolver には「future `login --provider anthropic`」の未実装構想コメントが残る
- `src/cli/init.ts` — provider(anthropic|openai)の解決は「user-global config が存在しない時だけ」通るブロック内にあり、既存 config があると `--provider` は**無言で無視**される
- `README.md:19-20` — Quick Start は無条件に `npx specrunner init` → `npx specrunner login` を案内
- credentials.json は `~/.config/specrunner/credentials.json`(permission 0600)。managed runtime の API key は `SPECRUNNER_API_KEY` env でも渡せる

## 要件

1. **login の GitHub 専用化と有効性ベースの判定** — `login` から `--provider` を公開 flag / help surface から削除し、GitHub Device Flow 専用に戻す。既存認証の判定は「token が在るか」ではなく「実行時に使われる token が有効か」で行う:
   - 実行時と同じ解決順(GH_TOKEN → GITHUB_TOKEN → `gh auth token` → credentials.json)で**最優先の token と出所**を解決し、有効性を確認する
   - 有効 → 出所を表示して Device Flow を省略し exit 0(`--force` で強制実行は維持)
   - 無効かつ出所が credentials.json → Device Flow による更新へ進む
   - 無効かつ出所が GH_TOKEN / GITHUB_TOKEN / `gh auth token` → **Device Flow へ進まない**(下位の credentials.json を更新しても実行時に使用されず「ログイン成功なのに動かない」となるため)。その認証源の修正・解除を案内して非 0 で fail する
   - 旧 `login --provider claude` は migration compatibility として捕捉し、`credentials set claude-code` を案内して非 0 終了する。現行 parser は未知 flag を handler 到達前に `Unknown flag(s)` で落とすため、実現方式(legacy argv interception / CommandSpec への deprecated flag 概念の導入)は design で確定する。command registry に通常 flag として残す形(廃止したのに存在する)は不可
2. **`credentials set <name>` サブコマンドの新設** — `credentials set claude-code`(headless 用 Claude Code token)と `credentials set anthropic-api-key`(managed runtime 用 API key)。credentials.json(0600)へ保存する。**入力は echo しない**(TTY では silent 読み取り、非 TTY では stdin から読む — cron / スクリプトからの投入経路)。保存後に doctor の該当 check で検証できる旨を案内する
3. **dead guidance の全廃** — `login --provider anthropic` を案内する 5 箇所を実在コマンド(`credentials set anthropic-api-key` または `SPECRUNNER_API_KEY`)の案内に置換する。「future login --provider anthropic」構想コメントも削除する
4. **doctor の司令塔化** — hint は具体的な次の行動を示す。**CLI コマンドを案内する場合は現行 CLI に実在するコマンドに限る**(コマンドで解決できない事象の hint — 接続確認等 — はそのままでよい)。headless 用 Claude credential の未設定は fail でなく **warn + 「cron / inbox 利用時のみ必要」の注記**とする(attended 利用者の doctor を汚さない)。readiness 判定は all pass でなく **fail == 0** とし、warn が残っていても「Ready to run.」と次の一歩(例: `specrunner request new <slug>`)を一行案内する
5. **init の provider flag の無言無視をやめる** — 既存 global config がある状態で provider flag が指定されたら、無視した事実と対処(config の編集場所)を必ず出力する。flag 名を「machine/user の既定値を作る値」だと示す名前(例: `--default-provider`)へ変える場合は旧名を deprecate 案内付きで残す。名称変更の採否は design で確定する
6. **setup 導線の反転** — README の Quick Start を「init → doctor → 不足しているものだけセットアップ → doctor → 最初の job」の doctor 中心導線に書き換える(無条件 `login` 案内をやめる。`gh auth login` 済み / env 供給済みなら login 不要であることを明記)。init が config 生成時に出す無条件の「Run 'specrunner login'」案内も `doctor` への誘導に変える。README の変更は Quick Start 節に限定する

## スコープ外

- Claude Code / Codex の対話認証そのもの(upstream に委譲、現状維持)
- `runtime setup` の機能変更(案内文の修正のみ)
- credentials の暗号化・Keychain 統合
- README の Quick Start 節以外の再構成
- operator guide(別 request。本 request の確定後に正しいコマンド体系を前提として書く)

## 受け入れ基準

- [ ] `--provider` が login の公開 flag / help surface に存在しないこと、かつ旧 `login --provider claude` が migration 捕捉されて `credentials set claude-code` を案内し非 0 終了することをテストで固定する
- [ ] login が最優先 token を**有効と確認**した時に Device Flow へ進まないこと(出所の表示を含む)をテストで固定する
- [ ] 最優先 token が無効かつ出所が GH_TOKEN / GITHUB_TOKEN / `gh auth token` の時、Device Flow へ進まず認証源の修正を案内して非 0 で fail することをテストで固定する
- [ ] 最優先 token が無効かつ出所が credentials.json の時、Device Flow による更新へ進むことをテストで固定する
- [ ] `credentials set claude-code` / `credentials set anthropic-api-key` が credentials.json(0600)へ保存することをテストで固定する
- [ ] credential 入力が echo されない経路(TTY silent / 非 TTY stdin)で実装されていることをテストで固定する
- [ ] `src/` に `login --provider anthropic` の文字列が存在しないことをテストで固定する(dead guidance の再発防止)
- [ ] doctor の hint に CLI コマンドが含まれる場合、それが現行 CLI に実在することを機械検証する
- [ ] headless Claude credential 未設定の doctor 結果が fail でなく warn であり、cron / inbox 限定の注記を含むことをテストで固定する
- [ ] doctor の readiness 判定が fail == 0 であること(warn が残っていても Ready + 次の一歩が案内される)をテストで固定する
- [ ] 既存 global config + provider flag 指定の init が無言にならない(案内を出力する)ことをテストで固定する
- [ ] README Quick Start が doctor 中心の導線になっていること
- [ ] `typecheck && test` が green
