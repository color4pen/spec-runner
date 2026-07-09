# claude-code adapter の書き込みを workspace に SDK native sandbox でスコープする

## Meta

- **type**: spec-change
- **slug**: claude-adapter-write-scope
- **base-branch**: main
- **adr**: true

## 背景

codex adapter は全 step を `sandboxMode: "workspace-write"` で実行し、workspace 外への書き込みを OS レベルで遮断している（design D2）。一方 claude-code adapter は `permissionMode: "bypassPermissions"` でパス制限を一切持たず、Edit / Write / Bash いずれでも絶対パスで workspace 外（main checkout を含む）に書き込める。この非対称が実際の逃避書き込みインシデント（fast run 中の agent による main checkout 側 `.specrunner/config.json` 直接編集）の直接原因になった。

検出側の backstop（step 境界での main checkout 状態比較 → escalation）は別 request（main-checkout-write-detection）で導入済み。本 request は予防側 — claude-code adapter に codex と対称の workspace 書き込みスコープを導入する。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:278-280` — step agent の query options は `allowedTools: ["Read","Edit","Write","Bash","Grep","Glob"]` + `disallowedTools: ["Agent","Task"]` + `permissionMode: "bypassPermissions"`。パス制限なし
- `src/adapter/codex/agent-runner.ts:468` — codex は `sandboxMode: "workspace-write"`（全 step、design D2）
- `src/adapter/claude-code/query-one-shot.ts:134-135` — one-shot 系（read 系 step）は `allowedTools: ["Read","Bash","Grep","Glob"]` + `bypassPermissions`
- `package.json` — `@anthropic-ai/claude-agent-sdk: ^0.2.128`

## 外部 SDK の制約（v0.2.128 の sdk.d.ts で確認済み）

- query `Options` に `sandbox?: SandboxSettings` が存在する。`SandboxSettings.filesystem` は `allowWrite` / `denyWrite` / `allowRead` / `denyRead`（glob path 配列）を持ち、OS レベルで filesystem アクセスを制限する
- `sandbox.enabled: boolean`、`sandbox.autoAllowBashIfSandboxed: boolean`（sandbox 有効時に Bash を自動許可）、`sandbox.allowUnsandboxedCommands` がある
- `sandbox.failIfUnavailable` は **デフォルト true**（sandbox 依存が環境に無い場合、graceful degradation ではなくエラー）。false で「サンドボックス不可なら非サンドボックスで続行」になる
- sandbox は OS 機構（macOS: seatbelt 等）に依存するため、プラットフォームにより利用可否が異なる。ネットワーク制限設定（`sandbox.network`）も同居するが本 request では扱わない
- `canUseTool`（tool 実行前の許可 callback）も存在するが、Bash の任意コマンド文字列からアクセス先パスを静的に判定できないため、書き込みスコープの実装手段としては不完全

## 要件

1. claude-code adapter の step agent 実行（`agent-runner.ts`）に SDK native sandbox を導入し、filesystem 書き込みを workspace（agent の cwd = job worktree、no-worktree mode では repo root）配下に制限する。読み取りは制限しない
2. sandbox 有効時も Bash が従来どおり実行できる（`autoAllowBashIfSandboxed` 等で担保する）
3. sandbox が環境で利用不可の場合、run を失敗させず非サンドボックスで続行し、その旨を stderr に警告として 1 回出力する（検出側 backstop が別 request で導入済みのため fail-open が許容される）
4. sandbox 設定が query options に含まれることをテストで固定する（既存 TC-AR-01 の disallowedTools 検証と同形式）
5. codex adapter・one-shot 系（`query-one-shot.ts`）の挙動は変更しない

## スコープ外

- `query-one-shot.ts`（read 系 step）への sandbox 導入 — 対象 step は成果物を書かない設計であり、書き込みスコープの主リスクは step agent 側。必要なら別件
- ネットワーク制限（`sandbox.network`）の導入
- `canUseTool` によるパス検査の実装
- 検出側 backstop（main-checkout-write-detection で導入済み）の変更
- codex adapter の変更

## 受け入れ基準

- [ ] step agent の query options に workspace スコープの sandbox 設定（`filesystem.allowWrite` に cwd を含む）が含まれることをテストで固定する
- [ ] sandbox 利用不可（degradation 発生）の場合に run が継続し、警告が stderr に出ることをテストで固定する（SDK 挙動は mock/fake で代替してよい）
- [ ] one-shot 系の query options が従来と不変であることをテストで固定する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: SDK native sandbox（OS レベル filesystem 制限）。Bash 経由の書き込みまで遮断でき、codex の `workspace-write` と対称になる
- **採用**: sandbox 利用不可時は fail-open（警告つき続行）。sandbox はプラットフォーム依存であり、fail-closed にすると sandbox 非対応環境で全 run が停止する。逃避書き込みは検出側 backstop（step 境界比較 → escalation）が既に受けるため、予防層の degradation は許容できる
- **採用**: 読み取りは制限しない。step agent は repo 全域の読み取り（rules.md、既存コード参照）を前提に動作しており、read 制限は既存挙動を壊す
- **却下**: `canUseTool` によるパス検査 — Edit / Write は input のパスで判定できるが、Bash の任意コマンド文字列は静的判定できず、主要な逃避経路が残る
- **却下**: `permissionMode` の変更（bypassPermissions をやめて deny ルール運用）— permission ルールのパス意味論が sandbox より弱く（プロセスが直接 syscall する経路を縛れない）、挙動変化のリスクも大きい
- **却下**: one-shot 系への同時導入 — 対象が書き込みを行わない read 系 step であり、変更範囲を step agent に絞る
