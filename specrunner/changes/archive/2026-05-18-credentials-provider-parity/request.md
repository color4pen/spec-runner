# credential の保存・解決経路を provider 間で対称化し、runtime 要件を declarative に集約する

## Meta

- **type**: spec-change
- **slug**: credentials-provider-parity
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

spec-runner は外部サービス向け credential を 2 種類扱う:

- **GitHub access token** — `~/.config/specrunner/credentials.json` (0600) に保存され、`resolveGitHubToken` が「credentials → `GITHUB_TOKEN` env → throw」の優先順位で解決する。doctor は `DoctorContext.resolvedGitHubToken` で pre-resolve 済みの値を全 check に注入する
- **Anthropic API key (`SPECRUNNER_API_KEY`)** — credentials.json には保存されず、env 専用。callsite が `process.env["SPECRUNNER_API_KEY"]` を直接読む。`resolveSpecRunnerApiKey` のような resolver は存在しない

この **非対称性** は historic accident（managed runtime が後発で導入された経緯）であって設計意図ではない。module-architect の機械的分析（testability / coupling / SRP / cohesion / reusability / readability の 6 軸）でも以下が観察された:

- runtime → 必要 secret の判定が複数 callsite に重複（preflight + bootstrap/run/rm の `runtime === "managed" && env["SPECRUNNER_API_KEY"]` 同型判定 3 + managed.ts 3 + doctor checks 4）
- `process.env["SPECRUNNER_API_KEY"]` の直読が src 配下で **14 occurrence** (= 2026-05-17 時点で grep 実測。PR #267 / #248 等で増減あり、本 request は数字に厳密依存しない)
- doctor の managed-only check が「prereq ガード + provider 問い合わせ」を 1 check で実施（SRP 違反）
- bootstrap が「config load + token resolve + client build + runtime create」を 1 関数に同居

**直近 main の構造変化 (= 古い request 前提の補正)**:

- `DoctorContext` の実 location は `src/core/doctor/types.ts:80` (= 旧 `src/cli/doctor/context.ts` ではなく `core/doctor/` に集約済)
- doctor checks の実 location は `src/core/doctor/checks/{config,auth,agents}/...` (= `src/cli/doctor/checks/` ではない)
- PR #267 で `anthropic-key-present` / `anthropic-key-valid` は `managed-key-present` / `managed-key-valid` に rename 済

加えて、現状は「local runtime では何が必要か」「managed runtime では何が必要か」を一覧する declarative な場所が無く、各 module が自前で `runtime === "managed"` の分岐を持っている。

## 目的

「**spec-runner が外部サービスに認証するための credential は credentials.json が SOT、env は override**」を 1 つの一貫した model として全 provider に適用する。これは `gh` / `aws-cli` / `gcloud` などが採っている業界標準パターン。

この model を採用することで:

- SOT が 1 つに収束する（spec-runner が「覚えているもの」= credentials.json）
- resolver pattern が provider 非依存に統一される（callsite は `resolveXxx(env)` を呼ぶだけ）
- runtime 分岐が declarative になる（`requirements.ts` の 1 table を doctor / preflight / bootstrap が参照）
- 将来 provider が増えた時 natural に同じ shape で追加できる

## 要件

### 1. `core/credentials/anthropic.ts` を新設する

`core/credentials/github.ts` と対称な module を作る。

- `resolveSpecRunnerApiKey(env, opts?: { optional?: boolean })`: credentials.json `anthropic.apiKey` → `SPECRUNNER_API_KEY` env → throw (optional なら undefined) の優先順位
- `saveSpecRunnerApiKey(value: string)`: credentials.json に atomic write、既存 keys を保持
- error code は `ANTHROPIC_KEY_MISSING` を `src/errors.ts` に追加
- `optional` semantics が必要な根拠: `managed reset` のように apiKey 不在でも続行する callsite が現存する（`src/cli/managed.ts:runManagedReset`）

### 2. `core/credentials/requirements.ts` を新設する

runtime → required credential keys の declarative matrix を 1 ファイルに集約する。

- `requirementsFor(runtime: "local" | "managed"): RequiredCredential[]` のような関数を export
- local: `["github.token"]`
- managed: `["github.token", "anthropic.apiKey"]`
- preflight / doctor / bootstrap がこの table を参照して loop する

### 3. `core/credentials/types.ts` を拡張する

`CredentialsFile` 型に `anthropic?: { apiKey?: string }` を追加する。既存 `github?: { token?: string }` と並列に置く。

### 4. callsite を resolver 経由に書き換える

- `src/cli/bootstrap.ts:37-38` — `process.env["SPECRUNNER_API_KEY"]` 直読を `resolveSpecRunnerApiKey(env, { optional: config.runtime === "local" })` に置き換える
- `src/cli/run.ts:47-48` — 同上
- `src/cli/rm.ts:57-58` — 同上
- `src/cli/managed.ts:29` / `:161` / `:178` — `resolveSpecRunnerApiKey(env, { optional: <呼び出し文脈に応じて> })` に置き換える。`runManagedSetup` (`:29`) は required、`runManagedStatus` (`:161`) は presence boolean のみ必要なので optional、`runManagedReset` (`:178`) は optional
- `src/core/preflight.ts:29-54` — `checkRuntimePrereqs` が `requirementsFor(runtime)` を呼んで loop する形に書き換える

**着手時の確認手順**: 上記行番号は 2026-05-18 時点の grep 実測。**実装着手前に `grep -n 'process\.env\["SPECRUNNER_API_KEY"\]' src/` で全 callsite を再確認**してから書き換えに入る (= 着手までに main が進んで行番号がズレる前提)。受け入れ基準の「src/ 配下で 0 occurrence」を満たせば自動的に全件捕捉される。

### 5. `DoctorContext` を拡張する

- `resolvedSpecRunnerApiKey?: string` field を `src/core/doctor/types.ts` の `DoctorContext` interface に追加 (= `resolvedGitHubToken` と並列)
- `src/cli/doctor.ts` で resolver (`resolveSpecRunnerApiKey`) を呼び、ctx に注入する (= 既存 `resolvedGitHubToken` の pre-resolve パターン (PR #260) と同じ)
- managed-only doctor checks (`src/core/doctor/checks/config/managed-key-present.ts`, `src/core/doctor/checks/auth/managed-key-valid.ts`, `src/core/doctor/checks/agents/agent-provider-alive.ts`, `src/core/doctor/checks/agents/environment-provider-alive.ts`) は `ctx.env` 直読を `ctx.resolvedSpecRunnerApiKey` 参照に切り替える
- check 先頭の「prereq ガード」（apiKey 不在チェック）は削除し、ctx 注入時に already-skipped 判定する設計にする（SRP 改善）

### 6. spec を更新する

- 新規 spec: `specrunner/specs/credential-store/spec.md` を作成し、「provider 別の credential が credentials.json に並列に格納される」「resolver の優先順位は credentials → env → error (optional は undefined)」を Requirement として明文化する
- 既存 spec: `specrunner/specs/github-device-flow-auth/spec.md` の credentials 保存節を、上記新 spec を参照する形に整理する
- `specrunner/specs/managed-agent-runtime/spec.md` の secret 要求記述を新 spec の参照に変える

### 7. test

- `tests/core/credentials/anthropic.test.ts` 新設: resolver の 3 経路（credentials / env / throw）と optional semantics をカバー
- `tests/core/credentials/requirements.test.ts` 新設: matrix が runtime 別に正しい配列を返すこと
- 既存 callsite test（bootstrap / preflight / doctor checks）を新 API に追従させる

## スコープ外

- `specrunner login` への Anthropic provider 追加（`specrunner login --provider anthropic` のような CLI UX）。**model 確立後の別 request で扱う**
- `SPECRUNNER_GITHUB_CLIENT_ID` の constant 集約。client_id は secret ではなく public identifier であり別レイヤ
- OS keychain 連携 / 暗号化 storage。threat model 変更を伴うので別判断
- Codex 認証の spec-runner 側統合。現状は Codex CLI に委譲する設計が確立しており（PR #231）、本 request では触らない
- SecretStore interface / provider plugin の抽象化。provider 2 種類で justification が無く over-engineering

## 受け入れ基準

- [ ] `src/core/credentials/anthropic.ts` が存在し、`resolveSpecRunnerApiKey` / `saveSpecRunnerApiKey` を export している
- [ ] `src/core/credentials/requirements.ts` が存在し、`requirementsFor("local")` と `requirementsFor("managed")` が正しい credential keys を返す
- [ ] `process.env["SPECRUNNER_API_KEY"]` の直読が src/ 配下で **0 occurrence** （resolver 内部の 1 箇所のみ）
- [ ] `config.runtime === "managed" && process.env["SPECRUNNER_API_KEY"]` 型の判定が src/ 配下で **0 occurrence**（bootstrap / run / rm から消える）
- [ ] doctor の managed-only check 4 つの先頭から「apiKey 不在チェック」boilerplate が削除されている
- [ ] `DoctorContext.resolvedSpecRunnerApiKey` field が存在し、`doctor.ts` で pre-resolve されている
- [ ] credentials.json に Anthropic key を保存し、env を unset した状態で `specrunner managed status` が動作する（手動 acceptance）
- [ ] env override が動作する: credentials.json を空にして `SPECRUNNER_API_KEY=...` で `specrunner managed status` が動作する（手動 acceptance）
- [ ] credentials.json に GitHub token + Anthropic key の両方が共存できる（既存 key を消さない）
- [ ] `specrunner/specs/credential-store/spec.md` が新設されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect 分析（6 軸: testability / readability / cohesion / coupling / reusability / SRP）の結論を採用:

- **Case B（宣言 + resolver 吸収）** を選択
  - `core/credentials/requirements.ts` で runtime → required の matrix を declare
  - `core/credentials/anthropic.ts` で resolver を追加し env 直読を消す
  - `DoctorContext` に pre-resolved field を追加して doctor check の SRP を改善
- **Case A（宣言だけ）は不採用**: env 直読が残るため testability / coupling の改善が中途半端
- **Case C（SecretStore interface + provider plugin）は不採用**: provider 2 種類で justification が無い over-engineering
- `optional` / `required` 2 種 resolver semantics は `managed reset` のような既存挙動を保持するために必須
