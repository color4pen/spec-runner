# claude-code adapter の Edit / Write ツールに workspace 書き込みスコープを追加する

## Meta

- **type**: spec-change
- **slug**: file-tool-write-scope
- **base-branch**: main
- **adr**: true

## 背景

claude-adapter-write-scope（ADR-20260709-claude-adapter-workspace-write-scope）で SDK native sandbox による書き込みスコープを導入したが、公式 docs の確認により sandbox は **Bash サブプロセス専用**であることが確定した。built-in file tools（Read / Edit / Write）は sandbox を通らず permission システム直轄で動作し、`permissionMode: "bypassPermissions"` 下では無制約 — つまり Edit / Write ツールによる workspace 外への絶対パス書き込みは現在も可能である。同 ADR の Known Gaps に記録済みの残ギャップ 2 件を本 request で塞ぐ:

1. **Edit / Write のパス検査**: file tools は `file_path` 引数で書き込み先を静的に判定できるため、`canUseTool` callback によるパス検査が sandbox（Bash 側）の自然な補完になる
2. **`dangerouslyDisableSandbox` escape hatch**: sandbox 内で失敗したコマンドを model が `dangerouslyDisableSandbox` 付きで再試行でき、その再試行は permission flow 経由 — `bypassPermissions` では自動許可され、非 sandbox 実行になる。`sandbox.allowUnsandboxedCommands: false` で無効化できる

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:340-359` 付近 — step agent の query options は `allowedTools` + `disallowedTools` + `permissionMode: "bypassPermissions"` + `sandbox: buildWorkspaceSandbox(cwd)` + `stderr` callback（claude-adapter-write-scope で導入）
- `buildWorkspaceSandbox`（同ファイル）— `{enabled, failIfUnavailable: false, autoAllowBashIfSandboxed: true, filesystem.allowWrite: [cwd, cwd/**]}` を返す。`allowUnsandboxedCommands` は未設定（デフォルト true = escape hatch 有効）
- `src/adapter/claude-code/query-one-shot.ts:134-135` — one-shot 系は sandbox なし・`bypassPermissions`（前 change の regression test で凍結済み）

## 外部 SDK の制約（@anthropic-ai/claude-agent-sdk ^0.2.128）

- `canUseTool?: CanUseTool` が query options に存在する。「Called before each tool execution to determine if it should be allowed, denied, or prompt the user」。deny 時は `{behavior: "deny", message}` を返し、message は agent に見える（agent は worktree 内パスに修正して再試行できる）
- **未確定事項（実装前に実測で確定すること）**: `permissionMode: "bypassPermissions"` 下で `canUseTool` が呼ばれるかは docs / 型定義から確定できない。呼ばれない場合、`permissionMode` を `"dontAsk"` 等に変更して `canUseTool` で許可判定を代替する設計になるため、既存挙動（全 tool 自動許可）を canUseTool 側で完全再現する必要がある。この検証は実装の最初のタスクとして行い、結果を design に記録する
- 公式 docs（sandboxing）: 「Built-in file tools: Read, Edit, and Write use the permission system directly rather than running through the sandbox」「the sandbox restricts … It applies only to Bash commands and their child processes」
- `sandbox.allowUnsandboxedCommands: false` は「`dangerouslyDisableSandbox` parameter is completely ignored」となる。副作用: sandbox 内で実行不能な正当コマンド（許可外 host への network 到達が必要な場合等）が fallback できず失敗する。step agent の Bash 用途（build / test / lint / git のローカル操作）に network 必須コマンドが含まれるかの評価が必要

## 要件

1. step agent の Edit / Write ツール実行に対し、書き込み先パスが workspace（cwd 配下）外である場合に deny する検査を `canUseTool` で追加する。deny message には worktree 内で作業すべき旨を含める
2. Read / Grep / Glob / Bash および workspace 内への Edit / Write は従来どおり許可される（挙動不変）
3. `bypassPermissions` 下で `canUseTool` が発火しない場合は、`permissionMode` の変更を含めて設計し、変更後も要件 2 の挙動不変を維持する
4. `buildWorkspaceSandbox` に `allowUnsandboxedCommands: false` を追加し、`dangerouslyDisableSandbox` による自己解除を無効化する。ただし step agent の正当な Bash 用途が sandbox 内で完結しない実態が確認された場合はこの要件を見送り、理由を design に記録する
5. one-shot 系（`query-one-shot.ts`）と codex adapter の挙動は変更しない

## スコープ外

- 検出側 backstop（main-checkout-write-detection）の変更
- ネットワーク制限（`sandbox.network`）の導入
- one-shot 系への同種検査の導入
- Read 系ツールのパス制限

## 受け入れ基準

- [ ] workspace 外パスへの Edit / Write が deny され、deny message が返ることをテストで固定する（canUseTool 単体の入出力テストで可）
- [ ] workspace 内パスへの Edit / Write と、Read / Bash 等の他 tool が許可されることをテストで固定する
- [ ] `canUseTool` × `permissionMode` の実測結果（発火有無と採用した構成）が design.md に記録されている
- [ ] `allowUnsandboxedCommands` の採否と根拠が design.md に記録されている（採用時は query options に含まれることをテストで固定する）
- [ ] one-shot 系の query options が従来と不変であることをテストで固定する（既存 regression test が green のままであること）
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: `canUseTool` によるパス検査を sandbox の補完として追加する。前 change で「Bash を縛れないため不完全」と却下された機構だが、sandbox が Bash 専用と確定した今、Edit / Write（file_path で静的判定可能）を canUseTool、Bash を sandbox が受け持つ相補構成が全経路をカバーする唯一の依存ゼロ構成
- **採用**: deny（message つき）で agent に修正機会を与える。abort ではなく deny なら agent は worktree 内パスに切り替えて続行でき、run の可用性を保つ
- **却下**: Edit / Write の deny を redirect（パスを worktree 内に書き換えて allow）にする案 — `updatedInput` で可能だが、agent が意図しない場所への書き込みを黙って成立させ、成果物の所在が不透明になる。明示 deny が誠実
- **却下**: escape hatch 対応を別 request に分ける案 — 同じ `buildWorkspaceSandbox` / query options の 1 箇所を触る数行の変更であり、分割 overhead が本体を上回る
