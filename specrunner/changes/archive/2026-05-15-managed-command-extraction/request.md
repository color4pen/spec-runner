# managed runtime のセットアップを init から切り出し、managed 親コマンドを新設する

## Meta

- **type**: spec-change
- **slug**: managed-command-extraction
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

現在の `specrunner init` は 4 つの責務を 1 コマンドで担っている。

1. Anthropic API key の取得・検証
2. AgentRegistry の構築と AgentSyncer による全 agent の create/update/skip
3. Environment の create/retrieve
4. Config の保存

このうち 1〜3 は managed runtime（Anthropic Managed Agents API）固有の処理で、local runtime（Claude Code SDK / Codex SDK 経由）を使う場合は不要。`--runtime local` フラグで managed 処理をバイパスする現在の UX は、コマンドの主目的が flag によって大きく変わるため初見で読み取りにくい。

provider と sandbox の状況も整理されている。

- Anthropic Managed Agents は agent と Environment のプロビジョニングが必要（Environment は agent 間で共有される sandbox filesystem）
- Codex は PR #231 で認証を Codex CLI のチェーンに委譲。プロビジョニング自体が無く、local runtime に閉じる。**spec-runner は Codex の API key を config に保持しない**
- local runtime では step ごとに Codex / Claude を混ぜられる（同じユーザーの git worktree を共有するため filesystem 一貫性が保たれる）
- managed runtime では Anthropic の Environment sandbox に閉じるため、OpenAI モデルは config validator が拒否する（`src/config/schema.ts:337-342`）

一方、現状の spec-runner は **Anthropic Managed Agents の API key を `config.anthropic.apiKey` に保持しており、Codex (PR #231) と非対称**になっている。これが「config に secret が混ざる」「0600 permission warning」「`init` がプロンプトを必要とする」原因。

api key は **spec-runner 独自の generic な env var (`SPECRUNNER_API_KEY`) で受け取り、spec-runner が active な provider の SDK に explicit に渡す**設計に切り替える。`ANTHROPIC_API_KEY` のような provider 固有名は採用しない。managed runtime は構造上「1 config に 1 provider」なので、env var も「アクティブな provider に対する api key 1 本」で表現できる。将来 OpenAI managed が出ても env var 名は変えず、spec-runner が読み先を判断して該当 SDK に渡す。

config schema は既に `runtime?: "managed" | "local"` を持ち、`checkConfigComplete` が local 時に Anthropic 系チェックをスキップする実装が `src/config/schema.ts:357-380` にある。問題は構造ではなく、CLI の UX が flag 主導であり、`init` に重い責務が集中しており、かつ secret 管理が Codex と非対称であることにある。

## 目的

`init` の責務を「config 雛形生成」だけに絞り、managed runtime 固有のセットアップを独立した親コマンド `specrunner managed` に切り出す。`runtime` のデフォルトを `"local"` に反転し、managed を使うユーザーだけが明示的に setup を通すフローにする。さらに **managed runtime の api key を `SPECRUNNER_API_KEY` という provider に依存しない generic env var で受け取り、spec-runner config から secret を排除する**。

## 要件

### `specrunner managed` 親コマンドの新設

1. `specrunner managed setup` を追加する（**idempotent reconciliation**）
   - 初回も再実行も同じコマンドで動く。terraform / kubectl apply と同じ「宣言した状態に reconcile する」モデル
   - 動作:
     - `SPECRUNNER_API_KEY` env var を読み取る。未設定ならエラーで停止し env var 設定を案内する
     - active な provider（現状は Anthropic Managed Agents 固定。将来 config の `managedProvider` 等で拡張）の SDK を `apiKey: process.env.SPECRUNNER_API_KEY` で生成する
     - AgentRegistry の構築と AgentSyncer.syncAll の実行（既に idempotent。`definitionHash` 比較で create / update / skip を選ぶ）
     - Environment の create/retrieve（既に冪等。既存なら retrieve 相当を返す）
     - config の `runtime: "managed"`、`agents`、`environment` を既存のフラット構造に書き込む（**api key は config に書き込まない**）
   - 二回目以降の典型挙動: drift がある agent だけ update、Environment は retrieve、config の `lastSyncedAt` を更新
   - **API key 取得・プロンプト・config への書き込みは行わない**。`SPECRUNNER_API_KEY` 未設定なら early-fail。SDK 側の auth エラー（key が誤っている等）はそのまま stderr に流す
   - 失敗時は Environment の rollback と部分的に作成された agent の状態 cleanup を行う（既存の init のロジックをそのまま移管）
   - リソースが provider 側に無ければ作る（agent は AgentSyncer の既存挙動、environment は Environment.create/retrieve の既存挙動）。setup は「provider 側を config と整合した状態にする」ためのコマンドなので、不足リソースの create は本来の責務

2. `specrunner managed status` を追加する
   - config の `runtime` / `agents の step 別 agentId` / `environment.id` / `SPECRUNNER_API_KEY` env var の存在 を整形して表示する
   - API 通信は行わない（doctor との責務分離）

3. `specrunner managed reset` を追加する
   - `beta.environments.delete()`（SDK confirmed: `environments.d.ts:66`）で Anthropic 側の Environment を削除する
   - config を以下のように更新する（`anthropic` フィールドは本 request で削除済みのため対象外）:
     - `runtime` を削除（または `"local"` にリセット — どちらでも未指定扱いで local default になる）
     - `agents` は **`{}` 空オブジェクトにリセット**する（`SpecRunnerConfig.agents` は non-optional 型のため、field 削除は不可）
     - `environment` フィールドを削除する（optional 型）
   - **agent リソースは Anthropic 側に残る**（SDK の `beta.agents` に delete API が存在しない、confirmed by grep on node_modules）。この制約を `managed reset --help` と README で明示する
   - 確認プロンプトを出す（`--force` で skip 可能）

### `specrunner init` の責務縮小

5. `init` を runtime 非依存にする
   - config 雛形（version: 1 と最低限のフィールド）の生成のみを行う
   - 現在 init が行っている managed 関連の処理を整理する:
     - AgentSyncer / Environment 作成 / config への agents・environment の書き込み → `managed setup` へ移管
     - **API key 取得・検証・config への anthropic 書き込みは削除**（SDK の env var 読み取りに委譲するため、spec-runner からは消える）

6. `init --runtime managed` / `init --runtime local` フラグを廃止する
   - フラグを受け取った場合は exit code 非 0 のエラーで停止する
   - エラーメッセージは migration path を明示する。`--runtime managed` を受けたら「`init` のみで雛形作成、その後 `SPECRUNNER_API_KEY` を設定して `managed setup` を実行してください」と案内する。`--runtime local` を受けたら「`init` のみで local が default になります（フラグ不要）」と案内する
   - dogfooding 単独運用のため hard error 即時切り替えを許容する

### Config schema

7. **既存のフラット schema を維持しつつ、`anthropic` フィールドを削除する**
   - `runtime` フィールド一本を source of truth とする
   - `agents` / `environment` はトップレベルのまま
   - `anthropic` フィールド（`AnthropicConfig` 型）を schema から削除する。以下の参照箇所をすべて更新する:
     - `src/config/schema.ts`: `SpecRunnerConfig` / `RawConfig` / `validateConfig` / `checkConfigComplete`
     - `src/config/schema.ts:95` の comment（"D7 ... Default 'managed' for backward compat."）を runtime デフォルト反転に合わせて書き換える
     - `src/config/migrate.ts:112-113`: runtime のデフォルト正規化を `"managed"` → `"local"` に反転する（**最重要 — ここを変えないと `validateConfig` の修正だけでは default flip が機能せず silent bug になる**）
     - `src/config/migrate.ts:117-125`: anthropic フィールドの明示的構築を削除する
     - `src/cli/rm.ts:58`: `config.anthropic.apiKey` を `process.env.SPECRUNNER_API_KEY` に置き換える
     - `src/cli/run.ts:48`: 同上
     - `src/cli/bootstrap.ts:35`: 同上
     - その他 `grep -rn 'config\.anthropic' src/` でヒットする全箇所
     - `configIncompleteError()` のヒント文字列：managed runtime の incomplete 時には `"Run 'specrunner managed setup' first."` を返すように分岐させる（または現状の `"specrunner init"` ヒントを `"specrunner init && specrunner managed setup"` に置き換える）
   - 既存 config に `anthropic.apiKey` が残っていても無視する（migration では特に処理しない。validate もエラーにしない、ただ無視する）
   - **0600 permission warning は維持する**。`github.accessToken` が config に残る限り secret は完全には消えないため、warning 削除は `github.accessToken` を分離する別 request 完了まで defer する
   - **`checkConfigComplete` から managed 専用チェック（agents / environment）を取り除く**。両 runtime 共通の `github.accessToken` チェックだけに縮退させる。managed 専用の前提チェックは要件 9 で新設する `checkRuntimePrereqs` に移譲する（純粋関数性を保ち、`process.env` 結合を schema.ts から隔離するため）

8. `runtime` のデフォルトを `"managed"` → `"local"` に反転する
   - `validateConfig` で `runtime` が未指定の場合の解釈を「`"local"`」に変更する
   - `checkConfigComplete` の `isLocal` 判定を「`cfg.runtime !== "managed"`」と等価にする（未指定 → local 扱い）
   - 既存 config で `runtime` を未指定にしているユーザーは local runtime に自動切り替わる。managed のままにしたいユーザーは `runtime: "managed"` を明示する（dogfooding 単独運用のため特別な compat 機構は設けない）

### run 実行時の検証

9. `specrunner run` の起動時、`config.runtime === "managed"` のとき pipeline 開始前に **軽い検証** を通す
   - 新関数 `checkRuntimePrereqs(cfg, env)` を `src/core/preflight.ts` に新設する（`schema.ts` には置かない — schema.ts は純粋型 + 形状検証層で、`process.env` 結合はここで隔離する）
   - signature: `(cfg: SpecRunnerConfig, env: NodeJS.ProcessEnv) => { field: string; hint: string } | null`
   - 検証内容:
     - `cfg.runtime !== "managed"` のときは即 `null` を返す（local では何もしない）
     - `env.SPECRUNNER_API_KEY` の存在
     - 必須 step の `agents.<step>.agentId` の揃い
     - `environment.id` の存在
   - 失敗時は `managed setup` または `SPECRUNNER_API_KEY` 設定を案内する hint を返す
   - API 通信は行わない
   - 新規 `SpecRunnerError` code `RUNTIME_PREREQ_MISSING` を追加し、`CONFIG_INCOMPLETE` と区別する。「config file 自体の問題」と「env / managed setup の不足」を切り分け可能にする
   - `runPreflight` の Step 2（`checkConfigComplete`）直後に Step 2.5 として `checkRuntimePrereqs` を挟む
   - **pipeline 実行中に provider 側のリソース（agent / environment）が存在しないと判明した場合、spec-runner は自動的に再作成しない**。SDK から返るエラーをそのまま伝播させて停止する。recovery は明示的に `managed setup` を再実行することでのみ行う（observability 重視）

### `specrunner doctor` の拡張

10. `specrunner doctor` を managed 設定対応にする（**重い検証**）
    - **check registry を runtime 別に分離する**。`src/core/doctor/checks/index.ts` の `allChecks` を以下に再構成する:
      - `commonChecks: DoctorCheck[]` — 両 runtime 共通（`config/file-exists`、`github-token-present`、`github-token-valid`、`runtime/node`、`runtime/bun`、`runtime/git`、`storage/*`、`env/*` 等）
      - `managedChecks: DoctorCheck[]` — managed 専用（後述の API key / agents / environment 検証）
      - `localChecks: DoctorCheck[]` — local 専用（`runtime/codex-cli` など）
    - `runner.ts` が `config.runtime` に応じて配列を組み立てる:
      ```ts
      const checks = [...commonChecks, ...(runtime === "managed" ? managedChecks : localChecks)];
      ```
    - `managedChecks` の中身（active provider の API を叩く重い検証）:
      - `SPECRUNNER_API_KEY` env var の存在 + 疎通（active provider の SDK 経由で簡単な API 呼び出し）
      - `agents.<step>.agentId` の provider 側生存
      - `environment.id` の provider 側生存
    - 既存の `anthropic-key-present` / `anthropic-key-valid` は env var チェックに置き換わるため削除または rename する
    - 既存の `agents-registered` / `environment-registered` / `definition-drift` は `managedChecks` に再配置し、**hint 文字列を `"Run 'specrunner managed setup'."` に書き換える**（現状の `"Run 'specrunner init'."` は新フローと整合しない）
    - 既存の Codex / Claude Code チェック挙動は維持し、`localChecks` に振り分ける（または共通でもよい場合は `commonChecks`）
    - 実装パターン: 既存の `auth/anthropic-key-valid.ts` の fetch 先例に従い、beta endpoint header（`anthropic-beta: ...`）の管理は既存と同じ抽象化レベルで行う。`DoctorContext` を新規拡張するか raw fetch を使うかは既存 check の流儀に合わせる（無理に SDK injection を導入しない）

### help 表示の整理

11. `specrunner --help` を更新する
    - `init`: 「config 雛形を作る軽量コマンド」
    - `login`: 「**GitHub Device Flow OAuth による認証**」（Anthropic API key の取得ではない、と実態に合わせる）
    - `managed`: 「Anthropic Managed Agents 上のリソース管理（setup / status / reset）」
    - 標準フロー（local）: `init → login → run`（login は PR 作成用の GitHub 認証）
    - 標準フロー（managed）: `init → login → managed setup → run`
    - `managed reset --help` に「Anthropic 側の agent リソースは API 制約のため削除されない（orphan として残る）」旨を明記する

## スコープ外

- local runtime（Claude Code SDK / Codex SDK）の挙動変更
- per-step での runtime 混在（managed / local をステップ毎に切り替える機能）
  - 理由: local 内の Codex / Claude 混在はユーザーの git worktree を共有するため filesystem 一貫性が保たれるが、local と managed の混在、または managed provider 間の混在は別 sandbox を持つため filesystem 一貫性が壊れる。spec-runner の核心原理「state は CLI + filesystem + git が持つ」（[[project_cli_design]]）と衝突するため、本 request では取り扱わない
- managed 配下の provider 階層化（`managed claude setup` のような sub-namespace は導入しない）
- pipeline step の実行ロジック変更
- request 管理機構（#226）の変更
- job 階層化（cli-command-hierarchy で別途対応）
- README の全面改訂（help の更新に留める。README 改訂は cli-command-hierarchy 側に寄せる）

## 受け入れ基準

- [ ] `specrunner managed setup` が初回も再実行も同じコマンドで idempotent に動く（spec-runner が `SPECRUNNER_API_KEY` env var を読み active provider の SDK に `apiKey` を渡す、AgentSyncer.syncAll で drift だけ update、Environment は create/retrieve、config の `runtime: "managed"` / `agents` / `environment` を書き込む。**api key は config に書き込まない**）
- [ ] `specrunner managed setup` は provider 側に不足リソース（agent / environment）があれば create する（idempotent reconciliation）。AgentSyncer は本 request で変更しない
- [ ] `specrunner run` の pipeline 実行中に provider 側のリソース 404 が判明した場合、SDK エラーがそのまま伝播して停止する（spec-runner 側で自動 recovery / 再作成は行わない）
- [ ] `SPECRUNNER_API_KEY` env var 未設定で `managed setup` を実行した場合、env var 設定を案内するエラーで early-fail する
- [ ] `specrunner managed status` が config の managed 設定状態と env var 存在を表示する（API 通信なし）
- [ ] `specrunner managed reset` が environment を SDK の delete API で削除し、config の `runtime` / `agents` / `environment` を clear する
- [ ] `specrunner managed reset --help` と README が「agent は Anthropic 側に orphan として残る」制約を明示する
- [ ] `specrunner init` が config 雛形生成のみを行い、managed 関連処理と API key 取得を実行しない
- [ ] `specrunner init --runtime managed` / `--runtime local` が新フロー案内のエラーで停止する
- [ ] `runtime` のデフォルトが `"local"` に反転している（未指定 = local）
- [ ] config schema から `anthropic` フィールド（`AnthropicConfig`）が削除されている。既存 config に `anthropic.apiKey` があっても validate を通る（無視される）
- [ ] `config.anthropic.apiKey` を参照していた call site（`src/cli/rm.ts:58`、`src/cli/run.ts:48`、`src/cli/bootstrap.ts:35`、その他）が全て `process.env.SPECRUNNER_API_KEY` に置き換わっている
- [ ] `src/config/migrate.ts:112-113` の runtime デフォルト正規化が `"local"` に反転している（未指定 → local）
- [ ] `src/config/migrate.ts:117-125` の anthropic フィールド明示構築が削除されている
- [ ] `src/config/schema.ts:95` の D7 コメントが runtime デフォルト反転に合わせて更新されている
- [ ] `configIncompleteError()` が managed runtime の incomplete に対して `managed setup` 誘導のヒントを返す
- [ ] `managedChecks` の hint 文字列が `'specrunner managed setup'` への誘導に書き換わっている
- [ ] `specrunner managed reset` 後の `config.agents` が `{}` 空オブジェクトにリセットされている（non-optional 型のため削除不可）
- [ ] config の 0600 permission warning は維持されている（`github.accessToken` が残るため）
- [ ] `src/core/preflight.ts` に `checkRuntimePrereqs(cfg, env)` が新設されている
- [ ] `specrunner run` が `runtime === "managed"` のとき、pipeline 開始前に `checkRuntimePrereqs` を通す（env var + agents + environment）
- [ ] 軽い検証失敗時に `RUNTIME_PREREQ_MISSING` エラーで停止し、`managed setup` または `SPECRUNNER_API_KEY` 設定への誘導 hint を返す
- [ ] `checkConfigComplete` から managed 専用チェック（agents / environment）が削除され、`github.accessToken` チェックのみに縮退している
- [ ] `tests/unit/core/preflight.test.ts` で 6 ケース（managed + env var 欠如 / agents 欠如 / environment 欠如 / 全て揃い / local 早期 return / runtime 未指定で local 扱い）が `env` を plain object で渡して検証されている
- [ ] `src/core/doctor/checks/index.ts` の registry が `commonChecks` / `managedChecks` / `localChecks` の 3 配列に分離されている
- [ ] `doctor` の runner が `config.runtime` に応じて `commonChecks + managedChecks` または `commonChecks + localChecks` を実行する
- [ ] `specrunner doctor` が `runtime === "managed"` のとき、active provider の API 経由で agent ID / environment ID / API key 疎通を検証する
- [ ] `specrunner doctor` が `runtime === "local"`（または未指定）のとき、managed 専用 check が実行されない
- [ ] `specrunner --help` の `login` 説明が「GitHub Device Flow OAuth 認証」になっている
- [ ] 標準フロー（managed）の例示が `(SPECRUNNER_API_KEY 設定) → init → login → managed setup → run` になっている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **既存のフラット config schema を維持する**。当初案の「`managed` セクションを新設する」は、既に `runtime` フィールドが source of truth として実装されている `schema.ts:97` と衝突し、二重真偽源を生む。schema 変更を最小化し、`runtime` フィールド一本で判定する

- **`managed` を親コマンドとして runtime mode 名で名前空間を切る**。`provision` のような動詞ベースだと何をプロビジョニングしているかが見えない。`claude` のような vendor 名は「Anthropic の Claude を local runtime で使う」ケースと衝突する。runtime mode 名であれば config の `runtime: "managed"` と語彙が一致し、CLI と config の両方で同じ語彙で確認できる

- **`managed claude setup` のような provider 階層は今は立てない**。現状 managed runtime に乗っている provider は Anthropic Managed Agents だけで、Codex は CLI 認証チェーン委譲モデル（PR #231）。将来 OpenAI Assistants や Vertex AI agent が加わったときに `--provider` フラグまたは sub-namespace を導入する。CLI 階層は後から深くするのは容易だが、最初から深いと alias と help の負担が先に増える

- **per-step での runtime 混在はスコープ外**。filesystem 一貫性の観点で評価すると、local 内の Codex / Claude 混在は同じユーザー worktree を共有するため成立する。一方 managed と local の混在、または managed provider 間の混在は別 sandbox を持つため、step 間で sandbox ⇄ worktree の双方向 sync が必要になる。spec-runner の核心原理（state を filesystem + git に持たせる）と衝突するため、現フェーズでは取り扱わない

- **`managed reset` の agent orphan を許容する**。SDK の `beta.agents` に delete API が存在しない（grep on `node_modules/@anthropic-ai/sdk/resources/beta/agents/`）。reset の責務を「environment 削除と config クリア」に限定し、agent リソースが Anthropic 側に残る制約は help / README で明示する。将来 SDK が agent delete を提供したらスコープに含める

- **run 実行時の検証は軽量に留める**。config の必須フィールド存在チェックのみ（API 通信なし、既存 `checkConfigComplete` を活用）。重い検証（API 疎通、ID 生存確認）は `doctor` 専用とし、毎 run のオーバーヘッドを避ける

- **`login` = GitHub Device Flow OAuth**。Anthropic API key の取得・検証ではない。`login` の help 文と本 request 内の説明を実態に合わせる。managed runtime の api key 取得は spec-runner の関心事から外し、`SPECRUNNER_API_KEY` env var として外部から渡してもらう

- **cli-command-hierarchy（job 階層化）と本 request は同じ `specrunner --help` を編集する**。PR 順序を直列化する。cli-command-hierarchy 先行 → 本 request 後追いとする。README 全面改訂は cli-command-hierarchy 側に寄せ、本 request では `init` / `login` / `managed` の help 説明と新フロー例示の更新に留める

- **rollback / cleanup ロジックは既存の init の挙動を継承する**。`managed setup` 失敗時の Environment rollback と部分的に作成された agent の状態 cleanup は、現在 init が行っているロジックをそのまま移管する。新規実装ではなく移管に限定する

- **`managed setup` は idempotent reconciliation として 1 コマンドに統合する**（当初案の `managed sync` 分離を撤回）。理由は二つ。(1) AgentSyncer.syncAll と Environment.create は元から idempotent で、setup と sync の中核操作は同じ。差分は API key 取得を含むかどうかだけだったが、その API key 取得自体を env var 受け取りで削除したため両者の差分は完全に消えた。(2) terraform / kubectl apply と同じ「宣言した状態に reconcile する」モデルとして一貫させる方が、コマンド数を減らしつつ初回・再実行を同じ UX に揃えられる。setup は不足リソースの create が本来の責務なので、404 でも自動 create する。auto-recovery を禁じるのは `run` 側であり、setup 側ではない

- **`specrunner run` の実行中は自動 recovery を持たない**。pipeline 実行中に provider 側の agent / environment が無いと判明しても、spec-runner は黙って再作成しない。SDK エラーをそのまま停止理由として伝播させる。recovery は明示的に `managed setup` を再実行することでのみ行う。理由は observability — pipeline 実行中に裏でリソースが再生成されると、ユーザーは「いつ何が再作成されたか」を追跡できないまま新しい id に切り替わる

- **api key は spec-runner 独自の generic env var (`SPECRUNNER_API_KEY`) で受け取る**。`ANTHROPIC_API_KEY` のような upstream provider 固有名は採用しない。理由は forward-compat — managed runtime は構造上「1 config に 1 provider」で、必要な api key は常に「アクティブな provider 用の 1 本」。env var 名を provider 固有にすると、将来 OpenAI managed が来たときに `OPENAI_API_KEY` も別途必要になり「1 つ設定すれば動く」性質が壊れる。`SPECRUNNER_API_KEY` という generic 名にしておけば、provider が切り替わっても env var 名は不変で、spec-runner が読み先を判断して active な SDK の constructor に渡す。Codex (PR #231) は CLI 自身の auth chain に委譲する別 pattern だが、managed runtime は SDK 直叩きなので spec-runner が key を仲介する設計が必要

- **api key の保存場所は env var のみ**。spec-runner config には api key 関連のフィールドを持たない。これにより (1) `managed setup` がプロンプトを要さず非対話化される、(2) CI / scripting に乗りやすくなる、(3) 将来 `config get/set` を作る際に secret を分けて考えなくて済む。なお (a) `github.accessToken` は GitHub の auth chain（`gh` CLI / 自前 OAuth / env var）に複数候補があるため本 request では扱わず別 request に切る、(b) そのため 0600 permission warning は本 request では維持する（`github.accessToken` が残る限り secret は完全には消えない）、(c) config を git に commit しても安全になる効果も `github.accessToken` 削除完了後まで defer

- **`checkConfigComplete` と `checkRuntimePrereqs` で責務を分離する**（module-architect 評価済み）。`checkConfigComplete` は config field 存在チェック（github.accessToken のみ、両 runtime 共通）に縮退。managed 専用の前提検証は `checkRuntimePrereqs(cfg, env)` に分離し `src/core/preflight.ts` に配置。schema.ts は型 + 形状検証の純粋層に保ち、`process.env` への結合は preflight 層に隔離する。6 軸（testability / readability / cohesion / coupling / reusability / SRP）で他案（signature 拡張 / `process.env` 直接参照）より優位。新規 error code `RUNTIME_PREREQ_MISSING` で「config file 自体の問題」と「env / managed setup 不足」を切り分ける

- **doctor の check registry を runtime 別に分離する**。現状の `allChecks` 一本構造は managed 専用 check を local runtime で spurious に fail させる。`commonChecks` / `managedChecks` / `localChecks` の 3 配列に構造的に分離し、runner が `config.runtime` に応じて組み立てる。検討した代替案: 各 check に `appliesTo` メタを持たせて runner で filter（メタが全 check に必要、無関心 check にも追加）、各 check が `"skip"` 状態を返す（runtime 判定が複数 check に分散して DRY 違反、formatter に skip 表示の扱いが必要）。registry 分離案は check 側を「適用条件を意識しない純粋な検証ロジック」に保てる点が優位
