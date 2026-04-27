# Module Analysis — 2026-04-27-cli-core-pipeline

> Step 2.5 / module-architect の出力。In-Scope は機械的軸（testability / readability / cohesion / coupling / reusability / SRP）のみ。
> Greenfield のため「既存コード」は archive/git history のみ。本分析は design.md / tasks.md で確定した planned architecture を一次対象とする。
> 推奨は implementer の参考情報であり判断を拘束しない。

## Out-of-Scope に関する Notes

以下は本エージェントの判断対象外（pipeline-context.md の `out-of-scope` に従う）:

- **extensibility**: 将来の `fixup` / `merge` / `cancel` / `logs -f` / `stop` / `resume` / `dashboard` 追加に対する設計余白の評価は行わない。design.md Non-Goals に明記された通り後続 request の責務。
- **deployment independence**: CLI 単一バイナリ前提、リリース戦略は対象外。
- **security boundary**: API key / GitHub token の保護方式（0600 / keychain 等）は security-reviewer 専属領域。本分析では「機微情報を扱うモジュールが他モジュールから過剰に依存されていないか」という coupling 観点のみ言及する。
- **business domain boundary**: propose / spec-review / implement のセッション境界、`register_branch` の semantics 設計は architect の domain 判断。本分析は「定義/呼出の構造的一致」のみを評価する。

## 1. 既存コードパターン一覧

Greenfield のため "既存" と呼べるソースは存在しない。以下は design.md / tasks.md で確定した **planned architecture** 上の繰り返しパターン・命名規則の観察である。

| # | パターン | 出現箇所（planned） | 観察 |
|---|---------|----------|------|
| P1 | 1 ファイル = 1 ドメイン責務（`cli/init.ts` / `cli/login.ts` / `cli/run.ts` / `cli/ps.ts`） | design.md:42-45 | 4 サブコマンド × 1 ファイルで対称。CLI 層は薄いアダプタに統一されている |
| P2 | `store.ts` + `schema.ts` 二分割（`config/`, `state/`） | design.md:58-63 | I/O とスキーマ定義を分離する繰り返しパターン。両モジュールで型と validator が完全対称 |
| P3 | `sdk/{client, agents, environments, sessions}.ts` で SDK namespace を 1:1 ラップ | design.md:53-57, tasks.md:4.1-4.5 | SDK の `client.beta.{agents, environments, sessions}` 構造をミラーリング。passthrough 方針 |
| P4 | atomic write（`<path>.tmp.<random>` → `fs.rename`） | design.md:222-224, specs/cli-config-store, specs/job-state-store | config と state の両方で同一パターン。実装 2 箇所が予定されている |
| P5 | 名前付き error code + hint（`SpecRunnerError`） | design.md:344-359, tasks.md:1.3 | `CONFIG_MISSING` / `GITHUB_TOKEN_EXPIRED` 等を中央集約 |
| P6 | XDG 対応パス解決（`XDG_CONFIG_HOME` / `XDG_DATA_HOME`） | specs/cli-config-store, specs/job-state-store | config と state で同一の解決ロジックが必要 |
| P7 | 「定義 + handler colocate」factory パターン | design.md:185-205, specs/register-branch-tool | `defineCustomTool({ definition, handler })` を唯一の入口に強制 |
| P8 | history append + truncate（最大 100） | design.md:226, specs/job-state-store | `state.store.appendHistory()` の単一責務 |

## 2. 共通化すべき箇所と理由

各推奨には軸ラベルを 1 つだけ付す（In-Scope 6 軸: testability / readability / cohesion / coupling / reusability / SRP）。

### R1. atomic write ヘルパーを `src/util/atomic-write.ts` に抽出する [reusability]

**観測根拠**: design.md:222-224（state）、specs/cli-config-store の Requirement「設定の更新は atomic に行う」、specs/job-state-store の Requirement「状態ファイル書き込みは atomic に行う」。同一パターンが `src/config/store.ts`（tasks.md 2.2）と `src/state/store.ts`（tasks.md 2.4）で 2 度実装される計画。

**理由**: temp + rename + fsync + permission 強制は config（0600 必須）と state（permission 制約なし）で僅かに差分がある。共通関数 `atomicWriteJson(path, data, { mode })` を 1 箇所に抽出すると、SIGINT 耐性・部分書き込み耐性のテストを 1 度書くだけで両ストアをカバーできる。

**非推奨側**: store ごとに inline で書く案。差分検証のために両方をテストする必要があり、片方だけ修正された場合の整合性ドリフトが発生しやすい（constraints.md「決定的導出のソースは単一にする」と整合）。

### R2. XDG path 解決を `src/util/xdg.ts` に抽出する [reusability]

**観測根拠**: specs/cli-config-store と specs/job-state-store の双方で `XDG_CONFIG_HOME` / `XDG_DATA_HOME` のフォールバック解決が必須。tasks.md には専用タスクが無く、各 store 内で個別実装される懸念。

**理由**: `resolveXdgConfigDir()` / `resolveXdgDataDir()` の 2 関数で十分。`HOME` 未設定時の挙動・空文字許容・末尾スラッシュ正規化の単体テストを 1 箇所に集約できる。

### R3. `state.history` の append + truncate を 1 関数に閉じる [SRP]

**観測根拠**: design.md:226「最大 100 件で先頭から truncate」、specs/job-state-store「履歴は append-only で最大 100 entry まで保持する」。tasks.md 2.4 で `appendHistory()` が単独関数として定義予定。

**理由**: `updateJobState()` が status 変更と history append を同時にやろうとすると SRP 違反になる。`appendHistory(state, entry)` を pure function（state を受け取り新 state を返す）として分離し、`store.ts` の I/O 層からは値だけ受け取って rename するよう責務分離を維持する。tasks.md 2.4 の関数列挙は既にこの分離を意図しており、推奨は「内部実装でも分離を維持せよ」という補足。

### R4. `child_process.execFile` 呼び出しを `src/util/exec.ts` に集約する [testability]

**観測根拠**: specs/repository-identification「`child_process.execFile("git", ...)` を使う（shell injection を避ける）」。`src/git/remote.ts`（tasks.md 3.3）で利用予定。design.md には他の git 呼び出し計画は無いが、Phase 2 以降で `git remote add` / `git push` 等が想定される（R3, R6 in design.md）。

**理由**: 現時点では git 呼び出しは 1 箇所のみのため抽出は **任意**。ただし `execFileAsync(cmd, args, opts)` をラップしておくとモック差し替えが 1 箇所で済む（testability）。**Phase 1 では `git/remote.ts` 内で完結させ、Phase 2 で git 呼び出しが増えたら抽出**で十分。implementer 判断に委ねる。

### R5. SDK ラッパの discriminated union narrowing を `sdk/sessions.ts` に集約 [coupling]

**観測根拠**: design.md:154-165「SDK バージョン差分はラッパ内で吸収する。実装者は narrowing ヘルパーのみ参照する」。tasks.md 4.5 で `isCustomToolUseEvent` / `isStatusIdleEvent` を追加予定。

**理由**: 既に design レベルで coupling 制御の意図が明示されているため、追加推奨は不要。**ただし implementer 注意点として**: `core/session.ts`（tasks.md 7.4）が直接 `event.type === "agent.custom_tool_use"` のような文字列比較を書くと SDK バージョン差分への耐性が崩れる。SSE ループ内で narrowing ヘルパー以外の event 型判定を書かないことを `core/session.ts` の grep ガードで担保する案を提示する（tasks.md 5.5 と同様の static check）。

## 3. 既存ヘルパー / ユーティリティの活用候補

Greenfield のため既存ヘルパーは存在しない。Node 標準 API の活用候補のみ列挙する。

| # | 候補 API | 用途 | 軸 |
|---|---------|------|----|
| H1 | `node:crypto.randomUUID()` | jobId 生成（design.md D7） | reusability — 外部依存ゼロ |
| H2 | `node:fs/promises.rename` | atomic write（design.md D4） | reusability |
| H3 | `node:url` の `URL` クラス | git remote URL の HTTPS パース（specs/repository-identification） | reusability — 正規表現で書き直さない |
| H4 | `node:child_process.execFile` | git 呼び出し | testability — `exec` ではなく `execFile` でテスト時のモック境界が明確 |
| H5 | global `fetch` （Node 20+） | GitHub Device Flow / GitHub API（design.md D6） | reusability — `node-fetch` 依存を回避 |
| H6 | `AbortController` / `AbortSignal` | SSE break-after-completion / timeout（design.md D1, specs/session-completion-detection） | testability — テスト時にキャンセル経路を検証可能 |

**注記**: `proposal.md` Impact 「Node.js 標準 API のみ」「`bun:*` / `Bun.*` は import しない」と整合する。

## 4. 分割単位の推奨

design.md:38-75 の構成案を **そのまま採用すべき** であるが、Bug 1 再発防止と SRP 維持の観点で以下の補足推奨を行う。

### S1. Custom Tool registry の単一参照を強制する [coupling / SRP]

**観測根拠**: pipeline-context.md emphasis「Custom Tool registry / Agent tools 配列 / SSE dispatch table の 3 箇所からの参照が単一 source-of-truth になっているか」、design.md D2、specs/register-branch-tool「definition と handler は同一モジュールに colocate される」、specs/agent-environment-bootstrap「Custom Tools は registry 経由で Agent に登録される」、constraints.md「定義済み関数の未呼び出し、Custom Tool の Agent tools 配列への未登録は致命的なサイレント障害」。

**推奨構成**:
```
src/core/tools/
├── types.ts         # CustomTool 型 + defineCustomTool ファクトリ（tasks.md 5.1）
├── registry.ts      # tools[] の唯一の保持者 + getDefinitions / getHandler（tasks.md 5.2）
├── register-branch.ts # definition + handler colocate（tasks.md 5.3）
└── index.ts         # registerCustomTool(registerBranchTool) を呼ぶブートストラップ（tasks.md 5.4）
```

**3 つの参照点と単一 source 結線**:

| 参照点 | 期待される参照 | 該当タスク |
|--------|---------------|----------|
| Agent 作成時の `custom_tools` 配列 | `getDefinitions()` の戻り値をそのまま渡す | tasks.md 8.1（init）, 9.1（agent-definition） |
| SSE dispatch table（custom_tool_use 受信） | `getHandler(event.name)` の戻り値を呼ぶ | tasks.md 7.4（session.ts）|
| definitionHash 計算 | `getDefinitions()` を canonical JSON 化 | tasks.md 9.1-9.2 |

**観点ラベル**: coupling — 3 参照点が `registry.ts` のみに依存することで、tool 追加時の片側登録漏れが構造的に不可能になる。
**観点ラベル**: SRP — `registry.ts` は「tools[] の保持と問い合わせ」のみ、`register-branch.ts` は「単一ツールの定義と振る舞い」のみ、各責務が単一。

**implementer への補足**: tasks.md 5.5 の grep ガード（`name: "register_branch"` が `register-branch.ts` 以外に存在しない）は **構造的不変条件のテスト** として有効。これを CI に組み込む推奨は維持する。

### S2. 状態ファイル I/O とビジネスロジックの分離 [SRP / testability]

**観測根拠**: pipeline-context.md emphasis「状態ファイル I/O とビジネスロジックの分離（atomic write、破損ファイル耐性）が単一モジュールで責務を抱えていないか」、design.md:60-63、tasks.md 2.3-2.5。

**推奨構成**:
```
src/state/
├── schema.ts   # 型 + validator のみ（pure）
└── store.ts    # I/O のみ（atomic write / mkdir -p / 破損 skip）
```

**ビジネスロジック側**（pipeline.ts や session.ts）からは:
- `createJobState(input)` で初期 state オブジェクトを構築（pure）
- `updateJobState(state, patch)` で新 state を構築（pure / pure-ish）
- `persistJobState(state)` で disk に書く（impure）
- `appendHistory(state, entry)` で history を追加した新 state を返す（pure）

を分離する案を推奨する。tasks.md 2.4 は関数名のみ列挙しているため、**「pure な変換」と「impure な I/O」を関数単位で分離する** ことを実装方針として明示する価値がある。

**観点ラベル**: testability — pure な変換（appendHistory の 100 truncate 境界等）はファイルシステムなしで単体テスト可能。
**観点ラベル**: SRP — store.ts が「変換 + 永続化 + 列挙 + 破損耐性」の 4 責務を抱えるのを避ける。

**懸念点**: design.md の現構成では `store.ts` が atomic write と enumeration（listJobStates, tasks.md 2.4-2.5）と history truncate（design.md:226）を全て担当する設計になっている。enumeration は **列挙責務** として `store.ts` 内に残してよいが、history truncate は pure transform として schema.ts 側か新規 `src/state/transforms.ts` に出す案を implementer に提示する。

### S3. ポーリング loop と SSE handler の責務分離 [SRP / cohesion]

**観測根拠**: pipeline-context.md emphasis「ポーリング loop と SSE handler が異なる責務として分離されているか（completion detection vs custom-tool dispatch）」、design.md:46-50, tasks.md 7.1-7.5。

**現 design 構成**:
- `src/core/completion.ts` — `pollUntilComplete()`（completion detection 専属）
- `src/core/session.ts` — `startProposeSession()`（SSE 接続 + dispatch + send）
- `src/core/pipeline.ts` — 状態マシン進行（`runProposePipeline`）

**観察**: 責務分離は概ね妥当だが、以下 2 点が重なるリスク:

1. **idle+end_turn 検出の二箇所実装** — completion.ts のポーリング loop と session.ts の SSE loop の両方で `status === "idle" && stop_reason === "end_turn"` を判定する必要がある（specs/session-completion-detection の 2 つの Scenario）。**判定述語を `completion.ts` に 1 関数として置き、両 loop が同じ関数を呼ぶ** ことを推奨する。

   ```ts
   // completion.ts
   export function isProposeComplete(s: SessionState): boolean {
     return s.status === "idle" && s.stop_reason === "end_turn";
   }
   ```

   **観点ラベル**: reusability — 述語の重複定義による drift 防止。
   **観点ラベル**: testability — 境界条件（`stop_reason: "requires_action"` で false、`status: "terminated"` で false 等）を 1 箇所でテスト。

2. **SSE 切断 → ポーリング fallback の境界** — design.md:338「SSE 切断 → 再接続せずポーリングに fallback」、tasks.md 7.5。session.ts が SSE 終了を検知し pipeline.ts に通知する設計が望ましい。session.ts が pipeline.ts の状態を直接書き換えるのではなく、**session.ts は yield する（events または callback）** / **pipeline.ts が消費する** orchestration 構造を推奨する。

   **観点ラベル**: cohesion — session.ts は「Anthropic との通信」のみ、pipeline.ts は「状態マシン進行とエラー判定」のみ。
   **観点ラベル**: coupling — session.ts が state.store に直接依存しない（store への書き込みは pipeline.ts に集約）構造で結合度を下げる。

### S4. SDK 型ラッパの境界明示 [coupling]

**観測根拠**: pipeline-context.md emphasis「SDK 型ラッパー（sdk/sessions.ts の discriminated union narrowing）が SDK バージョンアップ時の影響を局所化できているか」、design.md:154-165, design.md:434（R7）。

**推奨**:
- `src/sdk/*` の 4 ファイルは passthrough wrapper として SDK 型を re-export する（design.md:81 の方針通り）
- SDK の生イベント型を扱うのは `sdk/sessions.ts` の narrowing ヘルパー **のみ**
- `core/*` は narrowing ヘルパー経由でしか SDK 型に触れない
- **静的検査の推奨**: `src/core/` 配下で `BetaCustomToolUseEvent` 等の SDK 型名を直接 import していないことを grep で確認する CI チェックを implementer 任意で追加可

**観点ラベル**: coupling — `core/*` から SDK 型への直接依存を 0 にすることで、SDK バージョンアップの影響範囲が `src/sdk/` に局所化される。

### S5. CLI 層の薄さ維持 [SRP]

**観測根拠**: design.md:42-45, 79「`cli/*` は引数パース → core 呼び出し → exit code 翻訳のみ」、tasks.md 8.1-8.6。

**推奨**: `cli/run.ts` の fail-fast バリデーション（tasks.md 8.3、design.md D8）はビジネスロジック寄りなので、`core/preflight.ts` のような新規モジュールに `runPreflight(deps): Result` として切り出す案を提示する。

```
src/core/preflight.ts  (新規候補)
  - checkConfig()
  - checkGitRepo()
  - checkOriginIsGitHub()
  - checkRequestMd(path)
  - これらを 1 つの runPreflight() に集約
```

**理由**: D8 の 5 チェックを `cli/run.ts` のトップに直書きすると、cli 層が「単なるアダプタ」を超えて検証ロジックを抱える。CLI 層は preflight 結果を受け取り stderr / exit code に翻訳するだけにする。

**観点ラベル**: SRP — cli/run.ts の責務を「引数パース + core 呼び出し + exit 翻訳」に純化。
**観点ラベル**: testability — preflight の 5 チェックがファイルシステム / git に依存するため、cli 層の smoke test とは別に core 層で deps 注入してテストできる。

**implementer 判断余地**: 簡素さを優先するなら cli/run.ts に直書きでも 200 行以内に収まる見込みなので、必ず分離する必要はない。Phase 2 で run / fixup / merge / cancel が増えた段階で共通 preflight を抽出する選択肢もある。

## 5. リスクのある単一責任違反候補（参考）

implementer が実装中に注意すべき「責務肥大化」の早期警告ポイント:

| # | モジュール | 肥大化シグナル | 推奨アクション |
|---|----------|--------------|--------------|
| W1 | `src/state/store.ts` | atomic write + enumeration + truncate + 破損 skip + permission の 5 機能 | 200 行超えたら R3 / S2 の通り pure transform を schema.ts または transforms.ts に分離 |
| W2 | `src/core/session.ts` | SSE 接続 + 初回送信 + dispatch + tool result send + idle 検知 + 切断 fallback の 6 機能 | 250 行超えたら SSE loop と dispatch を別関数に分離 |
| W3 | `src/cli/run.ts` | fail-fast バリデーション 5 種 + jobState 作成 + pipeline 起動 + exit 翻訳 + flag パース | 150 行超えたら S5 の通り `core/preflight.ts` に抽出検討 |
| W4 | `src/cli/init.ts` | API key 取得 + Agent 作成/同期 + Env 作成/再利用 + rollback + config 保存 + hash 計算 | 200 行超えたら Agent 操作と Env 操作を `core/bootstrap.ts` に出す検討 |

## 6. 評価サマリ（軸別）

| 軸 | design.md の評価 | 主要懸念 | 補足推奨 |
|----|------------------|---------|---------|
| **testability** | 良好 — `core/*` が SDK / fs / fetch を抽象に依存させる方針が明記（design.md:80） | session.ts が状態ファイル書き込みを直接担うとモック範囲が増える | S3-2: session.ts は yield / callback、pipeline.ts が永続化を担当 |
| **readability** | 良好 — 1 ファイル 1 責務の命名規則が一貫 | tasks.md の関数列挙が intent を伝えるが、cli/run.ts の preflight が肥大化リスク | S5: preflight を core 側へ |
| **cohesion** | 良好 — config / state / sdk / core / cli の層分割が明確 | session.ts と completion.ts の境界が「SSE vs poll」なのか「dispatch vs detect」なのか曖昧 | S3: 述語 isProposeComplete を completion.ts に集約 |
| **coupling** | 良好 — SDK 型を wrapper に閉じる方針あり | core から SDK 型への直接 import が許容されると吸収効果が薄れる | S4: core 層での SDK 型 import を grep ガード |
| **reusability** | 中 — atomic write と XDG 解決が 2 箇所で実装されかねない | store ごとの inline 実装は drift しやすい | R1, R2: util/ に抽出 |
| **SRP** | 良好 — Bug 1 再発防止のため tool registry を colocate factory + registry に分離 | state/store.ts の責務が 4-5 機能に膨らむ予兆 | R3, S2, S5: pure transform / preflight 分離 |

## 7. Bug 1 再発防止の構造的観察（参考所見）

emphasis 1 つ目「Custom Tool registry / Agent tools 配列 / SSE dispatch table の 3 箇所からの参照が単一 source-of-truth になっているか」への評価:

- **design.md D2 / specs/register-branch-tool / specs/agent-environment-bootstrap** は単一 source 設計を仕様レベルで強制している。
- **tasks.md 5.5** の grep テスト（`name: "register_branch"` が `register-branch.ts` 以外に存在しないこと）は **構造的不変条件のテスト** として機能する。
- **tasks.md 9.1** の Agent definition 統合（PROPOSE_SYSTEM_PROMPT + custom_tools registry definitions + toolset + model）は registry を definitionHash 計算にも引き込み、4 番目の参照点を構造的に同 source に紐付けている。

**観察**: この 3+1 参照点が `tool-registry.getDefinitions()` 1 関数からのみ流れるよう実装される限り、Bug 1 の構造的予防は成立する。implementer が注意すべきは:
1. Agent definition 構築の独自経路を作らない（必ず `getDefinitions()` を経由）
2. SSE dispatch で `if (event.name === "register_branch") { ... }` のような直書きをしない（必ず `getHandler(event.name)` 経由）
3. 新規 Custom Tool 追加時は `core/tools/index.ts` の bootstrap に `registerCustomTool()` を追加する（colocate factory が型レベルで強制）

**観点ラベル**: coupling — 3 参照点を 1 hub に集約する設計が完成している。
