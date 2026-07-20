# ADR-20260720: local runtime の provider readiness gate を副作用より前に配置する

## ステータス

accepted

## コンテキスト

local runtime では provider（agent 実行基盤）の利用可能性が確立する前に、job record・worktree・branch・journal などの永続的な副作用が発生し得た。Anthropic 側 auth の欠如・不良は最初の agent step まで発覚せず、その時点では既に repo 状態と job 記録が変更されている。

実測（認証情報を持たない pristine 環境）: GitHub token 検査を通過した `run` は Job ID を発行し、workspace 準備（git fetch）へ進んでから失敗した。有効な GitHub token を持ち Anthropic 側 auth を欠く利用者は worktree / branch / journal 作成後の agent step で初めて失敗する。

既存コードの問題点:

- `src/core/runtime/prereqs.ts` — local の Anthropic 側検査は best-effort のみ（`resolveClaudeCodeOAuthToken(..., { optional: true })`）。コードコメントの通り、agent が実際にこの機械で動くかは preflight で一切検証されない
- 実行順（run）— `setup Workspace()` が git fetch・worktree / branch 作成・slug store・liveness sidecar・request.md コミットを行う。これらが**最初の永続的副作用**であり、最初の agent step（`request-review`）はその後に実行される
- 実行順（resume）— `ResumeCommand.prepare()` が `running` 遷移を永続化してから `setupWorkspace()` が worktree を再作成する。resume は `runPreflight()` を呼ばない

この非対称性（run は CLI preflight あり、resume はなし）により、CLI 層だけで readiness を担保することはできない。

## 決定

### D1 — 配置: `CommandRunner.execute()` の冒頭、`prepare()` より前

`run`（`PipelineRunCommand`）と `resume`（`ResumeCommand`）はともに `CommandRunner` を継承し `execute()` を経由する。gate を `execute()` の最初の処理として配置することで、両経路の全副作用より前に単一チョークポイントで readiness を担保できる。

- run: `bootstrapJob` より前、`setupWorkspace` が slug store / worktree / branch / journal を作成するより前
- resume: `ResumeCommand.prepare()` が `running` 遷移を永続化するより前、`setupWorkspace` が worktree を再作成するより前

**採用理由**: CLI 層は経路が非対称（run は `runPreflight()` あり、resume は `bootstrap()` のみ）で gate を二重配置しなければカバーできない。`execute()` 冒頭は両経路が共有する唯一の、かつ全副作用より前の地点。exit-guard 登録・ログ初期化・`KeepAlive` 取得（いずれも `prepare()` 以降）よりも前であるため、readiness 失敗時に付随 artifact も生まれない。

**却下案**:

- *`setupWorkspace` 内または最初の agent step 直前への配置*: 副作用の**後**になり本変更の本質を満たさない
- *各 `prepare()` の内部で gate を重複配置*: call site が 2 箇所になり、resume の `prepare()` はすでに `running` 遷移を永続化するため gate をその上に置かなければならない。`execute()` 冒頭が早い・単一・均一な位置

### D2 — 機構: 軽量 live probe（最初の agent 接続の前倒しではなく）

副作用より前に失敗できることを実現する機構として、**軽量 live probe** を選択した。bounded かつ副作用のない provider 接続試行を実行し、結果を readiness 種別に分類する。

**probe を選んだ理由（credential 検査ではなく）**: local provider の auth は credential の存在から検証できない。SDK は Claude 自身のインタラクティブストアで認証できるため、既存の best-effort 検査で十分でなかった。実際の接続試行だけが「この機械で agent が動くか」を明らかにできる。

**probe を選んだ理由（接続前倒しではなく）**: 最初の agent step（`request-review`）は worktree 内の request.md をインプットとして読む。つまり worktree / branch / change folder の存在に構造的に依存しており、workspace 作成より前に移動するにはそのインプット契約を壊してパイプライン全体を再構成しなければならない。専用 probe はworktree を必要としないため、**副作用より前に失敗できる唯一の機構**である。フルパイプラインステップを再配置するより厳密に単純かつ安価。

**コスト / レイテンシ（要件 7）**: probe は 1 run / resume あたり 1 呼び出し、wall-clock timeout あり、最軽量モデル、認証済みターンが確認できた時点で即中断。成功パスではフルパイプライン実行に対して無視できるコスト。失敗パスでは worktree / branch / journal 作成 + agent ターン浪費より正味安価。

**誤分類リスク**: 瞬断・ネットワーク障害は `unreachable` に分類され、auth 失敗とは報告されない。ネットワークのブリップが「認証情報が悪い」と誤報告されることはない。

### D3 — 注入可能 seam と runtime 所有権

新しい runtime capability として gate を表現する:

- **Port**: `assertProviderReadiness(env)` — `RuntimeStrategy` には **optional**（型フェイクは省略可能）、`RealRuntimeStrategy` には **required**（コンパイル強制）。`assertNoDuplicateLiveJob` の先例を正確に踏襲する
- **LocalRuntime**: 注入された probe を呼び出して実装する。probe は新しいコンストラクタオプション（`providerReadinessProbe`）として注入可能で、実際の adapter バックドプローブをデフォルトとする。既存の `queryFn` / `_resolveClaudeCodeOAuthTokenFn` 注入と同じスタイル。デフォルトは composition root（`createRuntime`）でワイヤリング
- **ManagedRuntime**: no-op として実装し、managed の preflight と実行経路を変更しない。B-8 不変条件（`config.runtime` 分岐は `core/runtime/` に留まる）を保持したまま、`execute()` はメソッドをポリモーフィックに呼ぶ

probe は discriminated result（ready / auth-missing / auth-invalid / unreachable / provider-failure）を返し、CI はフェイクを注入することで実 token なしに各種別を決定論的に再現できる（要件 6、T5）。probe 型は port 層に置き、adapter（実 probe）と domain（分類器）の両方から back-edge なしで参照できる。

### D4 — 分類とメッセージ形状（`describeGitFetchFailure` に倣う）

純粋な domain classifier が non-ready probe 結果を分類済み `SpecRunnerError` にマップする:

- message = 処方的な第一文 + 改行 + bounded かつ credential-free な詳細サマリ（生 provider エラーオブジェクトそのまま・token 値は絶対に含めない）
- hint = 実在するコマンドだけを名指しした種別別復旧処方

復旧処方（実在コマンドのみ）:

- auth-missing → `claude setup-token` でトークンを生成し `specrunner login --provider claude` で格納する（または `CLAUDE_CODE_OAUTH_TOKEN` を設定）
- auth-invalid → トークンが拒否された。`claude setup-token` で再生成し `specrunner login --provider claude` で再格納する
- unreachable → ネットワーク接続を確認してリトライする
- provider-failure → しばらく待ってリトライする。解消しない場合は provider のステータスを確認する

処方は `PROVIDER_READINESS_HINTS` マップとして公開し、既存の hint-command-existence 歯（`tests/hint-command-existence.test.ts`）が参照する全 `specrunner <verb>` を登録済みコマンドとしてアサートできる。

probe の `buildDetail` は SDK エラーメッセージに token 値が含まれる場合でも `[REDACTED]` に置換してから truncation を行い、detail に token が漏れないことを保証する（T4）。

### D5 — エラー表面化と exit code

gate は分類済み `SpecRunnerError` をキャッチし、message を `logError` で、hint を stderr へ出力した後 **exit code 1 を返す**（re-throw しない）。返す（throw しない）ことで `run` / `resume` の外側 `catch` ブロックの非対称性に関わらず hint 印字が均一になる。既存の preflight 失敗（`RUNTIME_PREREQ_MISSING`、exit 1）と一貫する。

readiness 失敗は job が存在しない前の失敗であるため `RunResultContract` JSON は emit しない（既存の preflight 失敗と同じ挙動）。

専用エラーコード `PROVIDER_NOT_READY` を追加しテストと識別を容易にする。

## 検討した代替案

### A1: gate を doctor の local provider-alive check と同時に実装する

- **Pros**: seam の再利用で工数を節約できる可能性がある
- **Cons**: `run` の副作用境界と診断 UX は別種の契約。混ぜるとレビュー面積が跳ねる。doctor 側は readiness seam の再利用として後続判断で十分
- **Why not**: スコープを絞ることでレビュー可能性を保つ。doctor 拡充は別 request で決定する

### A2: preflight 層（CLI 側）だけで readiness を担保する

- **Pros**: 変更箇所が小さい
- **Cons**: `run` は `runPreflight()` あり・`resume` は `bootstrap()` のみという非対称性があり、CLI 層だけでカバーするには gate を 2 箇所に重複配置しなければならない。resume の `prepare()` はすでに `running` 遷移を永続化するため gate がその上に来なければならず、結局 `execute()` 冒頭と等価な位置になる
- **Why not**: 単一チョークポイント（`execute()` 冒頭）の方が均一で保守コストが低い

### A3: 最初の実 agent 接続を副作用より前に移動する（接続前倒し）

- **Pros**: 追加の API 呼び出しがない
- **Cons**: 最初の agent step（`request-review`）は worktree 内の request.md をインプットとして読む。これを workspace 作成より前に移動するにはそのインプット契約を壊してパイプライン全体を再構成しなければならない
- **Why not**: 専用 probe がワークツリー不要で副作用より前に失敗できる唯一の機構。接続前倒しは構造的制約から機能しない

### A4: adapter 内に readiness ロジックを直書きし、seam を持たない

- **Pros**: 追加ファイルが少ない
- **Cons**: CI が実 token を要するか、検証不能になる。種別別テストが書けない
- **Why not**: 注入可能な seam は T5（実 token 不要）と T1〜T4 のすべてのテストにとって必須

## リスク / トレードオフ

- **[probe コスト / レイテンシ]** → bounded: 1 run/resume あたり 1 呼び出し、wall-clock timeout、最軽量モデル、即中断。local 限定。副作用後失敗より正味安価
- **[瞬断がジョブをブロックする]** → `unreachable` に分類して retry 処方。auth 責任に誤分類されない。利用者は即リトライ可能
- **[実 probe のエラー文字列分類の曖昧さ]** → 実 probe は保守的なシグナルパターン（既存の `AUTH_PATTERNS` の精神）を使用。CI は実エラー文字列に依存せず注入 fake で各種別を再現する
- **[managed regression]** → ManagedRuntime は no-op を実装。gate はポリモーフィックな no-op であり既存 managed テストは無変更

## 影響

### Positive

- local runtime で auth を持たない利用者が worktree / branch / journal を汚さずに即座に失敗できる
- `run` / `resume` の両経路を単一チョークポイントでカバー
- 注入可能な seam により CI が実 token なしに各失敗種別を再現できる
- doctor への local provider-alive check 追加の際に seam を再利用可能

### Negative

- 成功パスで live probe の追加レイテンシが発生する（bounded かつ negligible と評価済み）
- probe に使用するモデル（現在 `claude-haiku-4-5`）が将来廃止された場合は定数の更新が必要（seam とテストカバレッジには影響しない）

### Known Debt

- doctor への local 版 `agent-provider-alive` check の追加は本 change のスコープ外として保留。readiness seam の再利用として後続判断する

## 参照

- Request: `specrunner/changes/local-provider-readiness-before-side-effects/request.md`
- Design: `specrunner/changes/local-provider-readiness-before-side-effects/design.md`
- Spec: `specrunner/changes/local-provider-readiness-before-side-effects/spec.md`
- Implementation: `src/core/port/provider-readiness.ts`, `src/core/runtime/provider-readiness.ts`, `src/adapter/claude-code/provider-readiness-probe.ts`, `src/core/command/runner.ts`
- Related: ADR-20260505-agent-runner-port-and-local-runtime.md（LocalRuntime 導入の先例）
- Related: ADR-20260611-git-transport-auth.md（`describeGitFetchFailure` パターンの先例）
