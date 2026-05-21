# config から GitHub secret を排除し、specrunner login を統一 auth 入口にする

## Meta

- **type**: spec-change
- **slug**: github-credential-env-separation
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #238 で `anthropic.apiKey` を `SPECRUNNER_API_KEY` env var に分離した。一方 `github.accessToken` は config (`~/.config/specrunner/config.json`) に平文で保存されたままで、0600 permission warning が消えない原因になっている。

加えて grep で確認すると、現状の GitHub auth は **2 系統が並行して存在** している：

**系統 A: `gh` CLI auth**
- 使用箇所: `src/core/pr-create/runner.ts`, `src/core/gh/pr.ts`, `src/core/finish/`（PR 作成 / list / merge / view）
- 認証ソース: `~/.config/gh/`（`gh auth login` で saved）or `GITHUB_TOKEN` env var
- `gh` CLI が自分で読み、spec-runner は touch しない

**系統 B: `createGitHubClient` (fetch ベース)**
- 使用箇所: `src/cli/run.ts:45`, `src/cli/bootstrap.ts:32`, `src/cli/doctor.ts:94`, `src/adapter/managed-agent/agent-runner.ts`（`getRefSha` / `getRawFile` / `verifyBranch` / `verifyPath` 等の read-only API + managed runtime での `createSession({ githubToken })` への relay）
- 認証ソース: `config.github.accessToken`（`specrunner login` が Device Flow OAuth で書く）

つまり `specrunner login` の token は **系統 B 専用** で、系統 A（`gh` CLI）には全く貢献しない。ユーザーは「`specrunner login` と `gh auth login` の両方やる」必要があるか、`GITHUB_TOKEN` env var で両方カバーする運用を強いられる。設計の負債。

## 目的

`config.github` フィールドを削除し、secret を `~/.config/specrunner/credentials.json` に分離する。`specrunner login` を auth の単一入口とし、内部の `gh` CLI 呼び出しには env 注入 wrapper で同じ token を渡す。系統 A / B が同じ token source を共有する状態にする。

## 要件

### Config schema 変更

1. `SpecRunnerConfig` / `RawConfig` から `github` フィールド（`GithubConfig`）を削除する。これにより以下のフィールドが消える: `accessToken` / `tokenObtainedAt` / `scopes`。`tokenObtainedAt` と `scopes` は **credentials file に引き継がない**（drop する）。理由は architect 評価済みの設計判断セクション参照
2. `checkConfigComplete` から `github.accessToken` チェックを削除し、credentials file の存在チェックに置き換える
3. `src/config/store.ts` の `saveConfig` で **`delete toSave["github"]`** を明示する（既存 config に github フィールドが残っていても save 時に復活しないように、PR #238 の `anthropic` strip と同じパターン）
4. （実装ノート）`src/config/schema.ts` の `validateConfig` と `src/config/migrate.ts` には現在 github 固有処理は存在しない。型から `github` フィールドを削除すれば参照箇所が型エラーで自動的に検出される。明示的な「github チェック削除作業」は不要、型変更に伴って既存参照が無効化されることを確認するだけでよい

### `specrunner login` の出力先変更

6. `specrunner login` の Device Flow OAuth ロジックは維持する（既存 `src/cli/login.ts` + **`src/auth/github-device.ts`** を流用。`src/adapter/github/` 配下には device flow 実装は無い）
7. token の出力先を **`~/.config/specrunner/credentials.json`**（0600）に変更する
8. credentials file の構造は **provider-keyed JSON** にする（将来 GitLab 等の追加に対する forward-compat insurance、[[issue #246]]）:
   ```json
   {
     "github": {
       "token": "ghp_..."
     }
   }
   ```
9. `specrunner login` 実行時、credentials file が存在しなければ新規作成、存在すれば `github` キーのみを update（他 provider キーは保持）

### Token resolver の新設

10. CLI entry 層（`src/cli/run.ts` / `src/cli/managed.ts` / `src/cli/bootstrap.ts` / `src/cli/finish.ts` 等）で token を以下の優先順位で解決する関数を新設する:
    - `~/.config/specrunner/credentials.json` の `github.token`（最優先）
    - `GITHUB_TOKEN` env var（fallback、CI 用）
    - どちらも無ければ `specrunner login` を案内するエラー
11. resolver の配置: 既存パターンに倣い `src/core/credentials/` または `src/adapter/credentials/` に置く（実装者判断）
12. resolver は subprocess primitive を必要としない（pure file I/O + env access）

### Constructor injection（系統 B）

13. 解決された token を `createGitHubClient(fetch, token)` に渡す（既存 signature 維持、`config.github?.accessToken` 参照を resolver 出力に置き換える）
14. **`ManagedAgentRunner` のコンストラクタに `githubToken` を追加** する。adapter 内部で `config.github!.accessToken` を直接参照している箇所（`src/adapter/managed-agent/agent-runner.ts:140/381/413`）を、コンストラクタ注入された token に置き換える
15. adapter が `process.env` や config を直接読まない（テスタビリティ確保 + 将来 secret manager 追加時の変更点を CLI entry 層に閉じるため）

### gh CLI subprocess への env 注入（系統 A）

16. spec-runner が `gh` CLI を spawn する箇所（`pr-create`, `gh/pr.ts`, `finish/`）で、subprocess の env に `GITHUB_TOKEN` を resolver 出力から注入する
17. 既存の subprocess spawn primitive（`src/util/spawn.ts` 等）に env 引数を渡せる形に拡張するか、`gh` 専用の thin wrapper（例: `spawnGh(args, cwd)`）を新設する。実装者は既存パターンに合わせて判断する
18. これにより `gh auth login` 未実行のユーザーでも `specrunner login` だけで `gh` 経由の操作が動く

### Run 時の検証

19. PR #238 で新設した `checkRuntimePrereqs` を更新して `GITHUB_TOKEN` 取得可能性をチェックする:
    - credentials file または env var のどちらかから token を resolve できれば pass
    - どちらも無ければ `specrunner login` 案内で fail
    - このチェックは両 runtime 共通（managed / local どちらでも GitHub 操作が要るため）

### `specrunner doctor` の拡張

20. doctor checks の更新:
    - `github-token-present` → credentials file または env var のいずれかから token が取れるかチェック
    - `github-token-valid` → resolved token を使った API 疎通検証（fetch 経由）
    - 既存の config 読み出しロジックを削除
    - `gh` バイナリ存在チェック（`runtime/gh-cli` 相当）を新設する（[[issue #247]] が完了するまで `gh` 依存が残るため）
    - `github-client-id` check（`SPECRUNNER_GITHUB_CLIENT_ID` env var）は Device Flow が `specrunner login` で残るため **削除しない**

### 0600 permission warning の移動

21. `src/config/store.ts` の loose permission warning を削除する（config から secret が完全に消えるため）
22. 同等の warning ロジックを credentials file 用に新設する（`src/core/credentials/` 配下、credentials file の load 時に 0600 でなければ warn）

## スコープ外

- multi-provider 対応（GitLab / Bitbucket 等）— [[issue #246]] で別途、credentials file 構造のみ insurance として provider-keyed JSON にしておく
- `gh` CLI 依存の脱却（REST API 直叩き化）— [[issue #247]] で別途、本 request では env 注入 wrapper で対処
- OS keychain 連携（macOS Keychain / Linux secret-service）
- credential helper パターン（git-credential-store 的な抽象化）
- 企業向け secrets manager 連携（Vault / AWS Secrets Manager）

## 受け入れ基準

- [ ] `SpecRunnerConfig` / `RawConfig` から `github` フィールドが削除されている
- [ ] `config.github.accessToken` を参照していた call site が全て token resolver 経由に置き換わっている（`run.ts:45`, `bootstrap.ts:32`, `doctor.ts:91`, `managed-agent/agent-runner.ts:140/381/413` を含む）
- [ ] `specrunner login` が `~/.config/specrunner/credentials.json` (0600) に provider-keyed JSON を書く
- [ ] credentials file の構造が `{ "github": { "token": "..." } }` 形式（GitLab 等の追加に対する forward-compat）
- [ ] credentials file 無い + `GITHUB_TOKEN` env var 無いで `specrunner run` を実行した場合、`specrunner login` 案内のエラーで停止する
- [ ] `gh` CLI subprocess 呼び出し時に `GITHUB_TOKEN` env が resolver 出力から注入される
- [ ] `gh auth login` 未実行でも `specrunner login` だけで PR 作成 / merge が動く
- [ ] `specrunner doctor` が credentials file ベースで token 検証を行う
- [ ] `specrunner doctor` が `gh` バイナリの存在を check する
- [ ] `src/config/store.ts` の config 用 0600 permission warning が削除されている
- [ ] credentials file 用 0600 permission warning が新設されている
- [ ] 既存 config に `github.accessToken` が残っていても load 時は無視され、`saveConfig` 経由で書き直されたタイミングで `github` フィールドが strip される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **`specrunner login` を統一 auth 入口として残す**（case Z）。`gh` CLI を spec-runner の実装詳細として隠蔽し、ユーザーは `specrunner login` だけで auth が完了する UX を維持する。case X（login 削除）は `gh auth login` を user に押し付ける負担を生み、`specrunner` を独立ツールとして成立させない。OSS 公開や新規 user 獲得を視野に入れた選択

- **secret は credentials file に分離**する。config から `github` フィールドを削除することで「config は git に commit 可能」という invariant が初めて成立する（PR #238 で Anthropic 側は env var に移動済、本 request で GitHub 側を credentials file に移動）。両 secret の分離パターンは異なるが（Anthropic = env var only、GitHub = credentials file + env var fallback）、いずれも config に secret を残さない原則は共通

- **credentials file の構造を provider-keyed JSON にする**。`{ "github": { "token": "..." } }` 形式で provider 名を key にする。将来 GitLab / Bitbucket 等の支援が必要になったとき（[[issue #246]]）、新規 provider key を追加するだけで既存 GitHub user の credentials を migration 不要。実装コストは ~5 行で、forward-compat insurance としては cheap

- **現 `GithubConfig` の `tokenObtainedAt` と `scopes` は credentials file に引き継がない**（drop する）。理由: (1) `tokenObtainedAt` は token rotation や有効期限管理に使える可能性があったが、現状の Device Flow OAuth では token に明示的な expiry がなく、`tokenObtainedAt` は実用されていない、(2) `scopes` は doctor で表示する用途がありうるが、必要なら `gh api user` や Anthropic SDK 経由で API から動的取得できる（config 経由の static 値より accurate）、(3) credentials file は secret に閉じた最小構造にしたい（PR #238 の env var only 設計と同じ「config に operational metadata と secret を混ぜない」原則）。将来 scope 表示が必要になったら doctor の API 疎通 check 内で動的取得する形に拡張する

- **provider abstraction は credentials file 構造に閉じる**。CLI surface（`specrunner login` は GitHub 固定）、Device Flow OAuth 実装、API client、`gh` 注入 wrapper、doctor check は全て GitHub 固定で実装する。multi-provider が現実の要求になったタイミングで [[issue #246]] として段階的に refactor する。「使われ方が分からないまま abstraction を切ると interface が後で破綻する」managed runtime の判断と同じ logic

- **token 注入は CLI entry 層に集約する（コンストラクタ注入パターン）**。PR #238 で Anthropic 側に採用したパターンを GitHub にも適用。adapter 内で `process.env` や config を直接参照しない。理由: (1) Anthropic 側 (PR #238) と symmetric、(2) adapter のテストで env mock 不要、(3) 将来 secret manager 導入時、CLI entry 層 resolver の 1 箇所書き換えで全 adapter に波及する

- **`gh` CLI 依存は維持する**（[[issue #247]] で別途脱却検討）。`gh` の retry / rate limit / 各種エラーハンドリングを自前実装する負担と、依存削減のメリットを比較すると、現時点では `gh` を維持する方が ROI が高い。本 request では env 注入 wrapper で auth 統一を達成し、`gh` 依存自体の評価は別 issue に切り出す

- **`checkRuntimePrereqs` を両 runtime 共通の env var チェックに拡張**する。PR #238 では managed 専用だったが、`GITHUB_TOKEN` は両 runtime で必須（PR 作成 / finish が両方で動く）。runtime-agnostic な「token resolver 出力の存在」チェックも同関数に含める

- **gh CLI subprocess への env 注入実装は既存 spawn primitive の拡張で対応**する。新規の thin wrapper（`spawnGh`）を作るか、既存の `ExecFileFunction` / `SpawnFn` パターンに env 引数を渡せるよう拡張するかは implementer 判断。テスタビリティ確保が満たされれば構造は問わない

- **0600 permission warning は credentials file に移動**する。config の secret が消えても credentials file には secret が残るため、permission 警告ロジック自体は必要。warning コード自体はほぼ流用可能で、対象ファイルパスを変えるだけ
