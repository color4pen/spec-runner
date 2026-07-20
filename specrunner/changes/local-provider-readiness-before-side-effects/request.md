# local runtime の provider readiness を副作用より前に確立する — auth 欠如が worktree / branch / journal 作成後に発覚する経路を塞ぐ

## Meta

- **type**: spec-change
- **slug**: local-provider-readiness-before-side-effects
- **base-branch**: main
- **adr**: true

<!-- readiness 確認の座り（probe か接続前倒しか）・失敗分類・注入 seam は新しい設計選択のため adr: true -->

## 背景

local runtime では、provider（agent 実行基盤）の利用可能性が確立する前に、job record・worktree・branch・journal などの永続的な副作用が発生し得る。provider の auth 欠如・不良は最初の agent step まで発覚せず、その時点では既に repo 状態と job 記録が変更されている。

実測（認証情報を持たない pristine 環境）: GitHub token 検査を通過させた `run` は Job ID を発行し、workspace 準備（git fetch）へ進んでから失敗した。provider への接続はさらに後段であり、有効な GitHub token を持ち Anthropic 側 auth を欠く利用者（spec-runner 未経験の参加者に典型的な状態）は、worktree / branch / journal 作成後の agent step で初めて失敗する。

解決策は特定の機構に固定しない。本質は「**副作用より前に provider readiness で失敗できる**」ことであり、達成手段（軽量 probe の追加か、最初の実 agent 接続を副作用より前へ移動するか）は設計に委ねる。

## 現状コードの前提

- `src/core/runtime/prereqs.ts:38-43` — local runtime の Anthropic 側検査は `resolveClaudeCodeOAuthToken(env, { optional: true }).catch(() => undefined)` の best-effort のみ。「Local Claude Code can still authenticate through Claude's own interactive stores」というコメントの通り、**この機械で agent が実際に動くかは preflight で一切検証されない**
- `src/core/credentials/requirements.ts` — 宣言的 requirements matrix（local: `github.token` + `anthropic.claudeCodeOAuthToken` / managed: `github.token` + `anthropic.apiKey`）が既にあり、runtime 別分岐はここに集約されている
- `src/core/command/pipeline-run.ts:93-104` — 「Resolve pipeline id and run preflight capability gate BEFORE bootstrapping job」「before any job state is created」の preflight slot が既に存在する。readiness の座る位置の先例
- `src/core/command/runner.ts:96-159` — 実行順は prepare()（jobState / Job ID 確定）→ `setupWorkspace()`（git fetch → worktree / branch 作成、`src/core/runtime/local.ts:464` 周辺）→ pipeline（最初の agent step）。workspace 失敗時点で failed job record が残る
- provider への実接続点: anthropic は `src/adapter/claude-code/`（`sdk-loader.ts` / `one-shot-query-client.ts` / `agent-runner.ts`）、openai 構成時は codex CLI
- doctor には managed 用の `agent-provider-alive`（5s timeout の到達性検査）があるが、local 用の同種検査は無い。doctor の拡充は本 request のスコープ外（run の副作用境界が主題）
- `git fetch` の認証系 stderr は `describeGitFetchFailure`（`src/core/runtime/git-fetch-error.ts`）で wrap される先例がある（パターン判定 + 元 stderr 保持）

## 要件

1. **readiness を run ごとに一度だけ確認する**: local runtime の `run` / `resume` 開始時、provider readiness を 1 回確認する。既存の preflight slot（job state 生成前）と同じ層に置く。
2. **失敗を区別する**: auth 欠如・auth 不良・通信不能・provider 障害を区別し、それぞれ異なるメッセージで報告する。
3. **変更前に失敗できる**: readiness 失敗時、job record・worktree・branch・journal のいずれも作成されない。
4. **復旧を現行コマンドで案内する**: 失敗種別ごとに provider 別の現行コマンド（例: anthropic は `claude setup-token` → `specrunner login --provider claude` 等、実在するものに限る）を処方する。
5. **生エラーを露出しない**: credential 値や provider の生エラーをそのまま表示しない。詳細は wrap の下に保持する（`describeGitFetchFailure` と同じ方針）。
6. **CI は probe 注入で検証する**: readiness 判定は注入可能な seam を持ち、CI / テストは実 token 無しで成功・各失敗種別を再現できる。
7. **live probe のコストが問題になる場合は接続の前倒しで達成してよい**: 追加 API 呼び出しが余分な課金・遅延・誤判定を生む場合は、「追加 probe」ではなく最初の実 agent 接続を副作用より前へ移動する設計を選ぶ。いずれを選ぶかと理由を design に明記する。
8. **managed runtime には影響させない**: managed の既存 preflight / 実行経路の挙動を変えない。

## スコープ外

- doctor への local 版 provider-alive check の追加（別判断）
- managed runtime の readiness / preflight の変更
- GitHub token 検査・git transport auth の変更
- provider の新規サポート追加

## 受け入れ基準

- [ ] **T1（変更前失敗）**: readiness が失敗する各種別で、job record・worktree・branch・journal が一切作成されないことを固定する。**破壊確認**: readiness gate を無効化すると、失敗が副作用の後（workspace 以降）へ移ることでテストが落ちること。
- [ ] **T2（種別の区別）**: auth 欠如 / auth 不良 / 通信不能 / provider 障害の 4 種別が、注入 probe でそれぞれ再現され、異なるメッセージ + 種別ごとの復旧処方（実在コマンドのみ。hint 実在検査の既存歯の対象に載ること）で報告されることを固定する。
- [ ] **T3（一度だけ）**: 1 回の `run` / `resume` で readiness 確認がちょうど 1 回であることを固定する（注入 probe の呼び出し回数計測）。
- [ ] **T4（生エラー非露出）**: provider の生エラー・credential 値が第一文に現れず、詳細として保持されることを固定する。
- [ ] **T5（実 token 不要）**: T1〜T4 のテストが実 token 無しで green であること。CI に long-lived token を追加しないこと。
- [ ] **T6（managed 不変）**: managed runtime の既存テストが無変更で green。
- [ ] **T7**: `typecheck && test` が green。

## architect 評価済みの設計判断

- **readiness は既存 preflight slot（job state 生成前）に置く**。→ 却下: setupWorkspace 内・agent step 直前（副作用の後になり本 request の本質を満たさない）。
- **判定は注入可能な seam を介す**。→ 却下: adapter 内へ直書き（CI が実 token を要するか、検証不能になる）。
- **probe か接続前倒しかは設計判断とし、選定理由を design に明記する**。→ 却下: 本 request で機構を固定（課金・遅延・誤判定のトレードオフは実装調査を伴わないと判断できない。要件は「副作用より前に失敗できる」の一点であり、達成手段は同値）。
- **doctor の local 版 provider-alive は本 request に含めない**。→ 却下: 同時実装（run の副作用境界と診断 UX は別種の契約で、混ぜると review 面積が跳ねる。doctor 側は readiness seam の再利用として後続判断）。
