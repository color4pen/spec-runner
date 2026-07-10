# ADR-20260710: claude-code Adapter の Edit / Write ツール書き込みスコープ（`canUseTool` ガード）

## Status

Accepted (2026-07-10)

## Context

ADR-20260709-claude-adapter-workspace-write-scope では SDK native sandbox を step agent の
query options に追加し、Bash サブプロセス経由の workspace 外書き込みを OS filesystem 層で遮断した。
しかし同 ADR の調査で sandbox は **Bash コマンドとその子プロセス専用**であることが公式 docs で確定し、
built-in file tools（Read / Edit / Write）は sandbox を通らず permission システム直轄で動作すると
判明した。`permissionMode: "bypassPermissions"` 下では permission システムが全ツールを自動許可するため、
Edit / Write ツールによる workspace 外への絶対パス書き込みは引き続き可能な状態が残った。

同 ADR の Known Gaps として記録された 2 件のギャップが本 ADR の対象である:

1. **Edit / Write のパス検査未対応** — file tools は `file_path` 引数で書き込み先を静的に判定できるため、
   `canUseTool` callback によるパス検査が sandbox（Bash 側）の自然な補完になる。
2. **`dangerouslyDisableSandbox` escape hatch が開放** — sandbox 内で失敗した Bash コマンドを model が
   `dangerouslyDisableSandbox: true` で再試行できる。その再試行は permission flow 経由となり、
   `bypassPermissions` では自動許可されて非 sandbox 実行になるため、sandbox が advisory になっていた。

また、実装過程で SDK の重要な挙動が実証的に確認された:
**`permissionMode: "bypassPermissions"` 下では `canUseTool` が呼ばれない。**
SDK docs の「Bypass all permission checks」という記述が示す通り、`canUseTool` は permission check の
一種であり、`bypassPermissions` モードでは Claude Code CLI プロセスが permission request メッセージを
SDK に送出しないため、callback が呼ばれない（`sdk.d.ts` および `assistant.mjs` のソース観察で確認）。

## Decision

### D1: `canUseTool` ワークスペースガードで Edit / Write をスコープする

`createWorkspaceToolGuard(cwd: string): CanUseTool` ピュアファクトリを `agent-runner.ts` に追加し、
返される callback を step agent の query options の `canUseTool` に設定する。

callback の動作:

- `toolName` が `"Edit"` または `"Write"` の場合: `input.file_path` を `path.resolve(cwd, file_path)` で
  解決し、`path.relative(cwd, resolved)` が `..` で始まらない（かつ絶対パスでない）かを検査する。
  workspace 内なら `{ behavior: "allow" }`、workspace 外なら `{ behavior: "deny", message }` を返す。
  `message` にはワークツリー（`cwd`）を名指しし、workspace 内での作業を促す旨を含める。
- その他の `toolName`（`Read` / `Grep` / `Glob` / `Bash` / `report_result` 等）: 無条件で
  `{ behavior: "allow" }` を返す。

**採用理由**: sandbox は Bash 専用であることが確定し、Edit / Write（`file_path` で静的判定可能）だけが
残る書き込み経路となった。`canUseTool`（Edit / Write）と sandbox（Bash）の相補構成が、依存ゼロで全
書き込み経路をカバーする唯一の設計になる。前 ADR で「Bash を縛れないため不完全」と却下された機構だが、
sandbox が Bash を受け持つ今、両者は競合ではなく補完関係にある。

**却下した代替案**:

- *workspace 外書き込みを worktree 内パスに redirect する（`updatedInput` 経由 allow）* — SDK は
  `updatedInput` で入力書き換えを支援するが、agent が意図しない場所へ書き込みを黙って成立させ、
  成果物の所在が不透明になる。明示 deny の方が誠実であり、agent が意図的に修正する機会を保てる。
- *run を abort する* — abort は run の可用性を損なう。`deny`（message 付き）なら agent が worktree
  内パスに切り替えて続行でき、sandbox の fail-and-continue 姿勢と整合する。
- *`PreToolUse` hook を使う* — `bypassPermissions` 下での発火有無が同様に不確定であり、callback 一本で
  足りる処理に第二の permission 表面を追加する必要がない。

### D2: `permissionMode` を `"bypassPermissions"` から `"dontAsk"` に変更する（Branch B）

実証確認の結果: `canUseTool` は `permissionMode: "bypassPermissions"` 下では発火しない（D2 背景参照）。
そのため `permissionMode` を `"dontAsk"` に変更する（Branch B 採用）。

`"dontAsk"` は「許可済みでないものを deny し、interactive prompt はしない」モードであり、SDK は
permission request メッセージを `--permission-prompt-tool` 経由で callback に委ねる。guard の
default-allow アーム（D1 の非対象ツール全許可）により、従来 `bypassPermissions` で自動許可されていた
全ツール（Read / Bash / Grep / Glob / MCP ツール等）が引き続き自動許可される。挙動不変の保証は
`bypassPermissions` の「全自動許可」を guard の「全許可 arm」が代替することで担保される。

**却下した代替案**:

- *`bypassPermissions` のまま guard を追加する* — guard が発火しないため、guard が存在しても Write
  スコープの gap が閉じない。機能していない外見上の保護を追加することは許容できない。
- *`"default"` モードに変更する* — 危険な操作（許可リスト外のツール等）に対して interactive prompt を
  発行するため、非 interactive runner ではハングする可能性がある。
- *`"acceptEdits"` モードに変更する* — ファイル編集を自動承認してしまい、`canUseTool` ガードを
  迂回する可能性がある。

### D3: `allowUnsandboxedCommands: false` で escape hatch を閉じる

`buildWorkspaceSandbox(cwd)` が返すオブジェクトに `allowUnsandboxedCommands: false` を追加する。

**採用前の評価（Req 4 要件）**: step agent の Bash ワークロードは全てローカル操作（`git status` /
`git diff` / `git add` / build / typecheck / test / lint）であり、全て依存関係インストール済みの環境で
実行される。唯一のネットワーク操作（`git push`）は `StepExecutor.commitAndPush()` が agent query の
**外側**で実行する。step agent の Bash turn にネットワーク到達や非 sandbox 実行が必要な正当コマンドは
存在しないと評価した。

**採用理由**: escape hatch が開いていると、model が任意の失敗 Bash コマンドを `dangerouslyDisableSandbox`
で unsandboxed 再試行でき、sandbox が advisory になる。評価したワークロードへの影響がゼロであるため、
閉じるコストが実質ない。sandbox を hard boundary として機能させる。

**却下した代替案**:

- *SDK デフォルト（`allowUnsandboxedCommands` 未設定 = `true`）のまま* — sandbox の保証が advisory に
  なり、model による自己解除を防げない。

### D4: 変更を step agent（`agent-runner.ts`）のみに限定する

`canUseTool` ガードおよび `allowUnsandboxedCommands` 設定は step agent の query options にのみ追加する。
`query-one-shot.ts`（read 系 step）と codex adapter は変更しない。

**採用理由**: 書き込みスコープのリスクは成果物を生成する step agent 側にある。one-shot 系は設計上書き込み
を行わないため、ガード導入の根拠がない。変更を step agent に絞ることで blast radius を最小化する。
one-shot 系の不変性は regression test（`permissionMode: "bypassPermissions"` / sandbox なし / `canUseTool`
なしのアサーション）で凍結されている。

## Alternatives Considered

### Alternative 1: `canUseTool` が発火する前提で `bypassPermissions` を維持する

- **Pros**: `permissionMode` を変更せずにガードを追加できる。既存テストへの影響がない。
- **Cons**: 実証的に `canUseTool` が `bypassPermissions` 下で発火しないことが確認された。ガードを追加
  しても Write スコープの gap は閉じない。見かけ上のセキュリティ強化になる。
- **Why not**: 機能しないガードを追加することは不誠実であり、将来の調査者を誤解させる。

### Alternative 2: `allowUnsandboxedCommands` 閉鎖を別 change に分ける

- **Pros**: 変更のスコープが小さくなる。
- **Cons**: 同じ `buildWorkspaceSandbox` / query options の 1 箇所を触る数行の変更であり、分割 overhead
  が本体を上回る。escape hatch が開いた状態の期間が延びる。
- **Why not**: 前 ADR の Known Gaps 2 件は同一 change で閉じることが前 ADR 起票時点で計画されていた。

### Alternative 3: one-shot 系にも同時に `canUseTool` ガードを導入する

- **Pros**: adapter 全体で書き込みスコープが均一になる。
- **Cons**: one-shot 系は read 専用 step を対象とし成果物を書かない設計。sandbox も導入していない。
  blast radius が広がり、regression リスクが増える。
- **Why not**: リスクが step agent 側に限定されており、別件として必要なら扱う。

### Alternative 4: workspace 外書き込みを worktree 内パスに redirect する（`updatedInput` 経由 allow）

SDK の `CanUseTool` は `{ behavior: "allow", updatedInput: { file_path: <rewritten> } }` で入力を
書き換えて許可することができる。これを使い、workspace 外の `file_path` を `cwd` 配下の同名パスに
書き換えて allow する設計。

- **Pros**: agent が deny エラーを受け取らずそのまま続行できる。run の可用性が最大化される。
- **Cons**: agent が意図しない場所（worktree 内の変換後パス）への書き込みが黙って成立する。
  agent は「意図したパスに書き込めた」と認識するが実際は別場所に書かれており、成果物の所在が
  不透明になる。変換ルールが複雑なパス（シンボリックリンク経由など）で直感に反する結果になる
  可能性がある。
- **Why not**: 誠実さが欠ける。agent に明示的に誤りを通知して自ら修正させる方が意図が明確になり、
  不透明な副作用を生まない。`deny`（message 付き）なら agent は正しいパスで再試行でき、
  run の可用性も実質的に保たれる。

## Consequences

### Positive

- Edit / Write ツール（`canUseTool` ガード）と Bash（sandbox）の相補構成により、全書き込み経路が
  依存ゼロでカバーされる。前 ADR の Known Gaps 2 件が完全に閉じられる。
- `dangerouslyDisableSandbox` による sandbox の自己解除が不可能になり、sandbox が hard boundary になる。
- `deny`（message 付き）により agent が workspace 外書き込みを worktree 内に修正して続行でき、
  run の可用性が保たれる。
- step agent の `permissionMode` 変更と guard の default-allow アームにより、従来 `bypassPermissions`
  で得ていた「全ツール自動許可」と等価の挙動が維持される。
- `canUseTool` ガードは `...queryOptions` spread により follow-up / retry / postWork / outputVerification
  の全 turn に自動伝播する。

### Negative / Known Debt

- `permissionMode: "bypassPermissions"` → `"dontAsk"` の変更により、その値を凍結していた既存テスト
  アサーション（`agent-runner.test.ts` TC-023 の 1 行）が Branch B の意図的な変更として更新されている。
  レビュー時に意図的な変更である旨を確認する必要がある。
- `canUseTool` の default-allow アームが全非 file-tool を許可するため、guard が `Agent` / `Task`
  ブロック機構の代替として誤解されるリスクがある。`disallowedTools` と agent-redirect counter が
  独立したゲートとして維持されていることを把握する必要がある。
- static `file_path` 判定のため、symlink 経由での workspace 外書き込みは防げない（残留リスク）。
  Bash 側 sandbox と detection backstop（`main-checkout-write-detection`）が外側で補完している。

### Known Gaps

- `query-one-shot.ts` への `canUseTool` ガード / sandbox 導入はスコープ外。read 系 step は書き込みを
  行わない設計だが、必要なら別件で扱う。
- ネットワーク制限（`sandbox.network`）は本変更の対象外。
- Read ツールのパス制限（`denyRead`）は対象外。

## References

- Request: `specrunner/changes/file-tool-write-scope/request.md`
- Design: `specrunner/changes/file-tool-write-scope/design.md`
- Spec: `specrunner/changes/file-tool-write-scope/spec.md`
- Review: `specrunner/changes/file-tool-write-scope/review-feedback-001.md` (approved, 9.0/10)
- Predecessor ADR: ADR-20260709-claude-adapter-workspace-write-scope（sandbox 導入・本 ADR の Known Gaps 起点）
- Related: ADR-20260709-worktree-main-checkout-write-detection（検出 backstop 層）
