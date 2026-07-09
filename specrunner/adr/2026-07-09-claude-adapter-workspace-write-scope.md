# ADR-20260709: claude-code Adapter の Workspace 書き込みスコープ（SDK Native Sandbox）

## Status

Accepted (2026-07-09)

## Context

spec-runner の step agent は codex adapter と claude-code adapter の 2 系統で実行される。

codex adapter は `sandboxMode: "workspace-write"` で全 step を実行し、workspace 外への書き込みを
OS レベルで遮断している。一方 claude-code adapter は `permissionMode: "bypassPermissions"` のみで、
Edit / Write / Bash いずれでも絶対パスで workspace 外（main checkout を含む）に書き込める状態だった。

この非対称が実際のインシデントを引き起こした: fast pipeline の run 中に agent が main checkout 側の
`.specrunner/config.json` を直接編集した。worktree 側 branch には同変更が正当に commit 済みであり、
main 側への書き込みは「逃避書き込み」であった。

検出側 backstop（step 境界での main checkout 状態比較 → escalation）は `main-checkout-write-detection`
change で導入済み（ADR-20260709-worktree-main-checkout-write-detection）。本 ADR は予防側の決定を記録する。

## Decision

### D1: SDK native sandbox で filesystem 書き込みを cwd 配下にスコープする

claude-code step agent の query options に `sandbox` 設定を追加し、`filesystem.allowWrite` に
agent の `cwd`（job worktree、`--no-worktree` mode では repo root）を設定する。
読み取り制限（`denyRead` / `allowRead`）は設定しない。

**適用範囲（公式 docs で確認済みの制約）**: SDK の sandbox は **Bash コマンドとその子プロセス**を
OS filesystem 層で隔離する機構であり、built-in file tools（Read / Edit / Write）は sandbox を
通らず permission システム直轄で動作する。本 change が遮断するのは Bash 経由の workspace 外
書き込み（実際のインシデントと同経路のクラス）であり、Edit / Write ツールの絶対パス書き込みは
`bypassPermissions` 下では制約されない（Known Gaps 参照）。

**却下した代替案**:

- *`canUseTool` によるパス検査*: Edit / Write は `file_path` で判定できるが、Bash の任意コマンド文字列から
  アクセス先パスを静的に判定できないため、主要な逃避経路（Bash 経由の絶対パス書き込み）が残る。
- *`bypassPermissions` をやめて deny ルール運用*: permission ルールのパス意味論は sandbox より弱く、
  プロセスが直接 syscall を発行する経路を縛れない。挙動変化のリスクも大きい。

### D2: sandbox 利用不可時は fail-open（警告つき続行）

sandbox を `failIfUnavailable: false` で構成する。OS sandbox 機構が利用できない環境（sandbox 非対応
プラットフォーム等）では、SDK が unsandboxed run に降格し、adapter は `[specrunner] warn:` を 1 行
stderr に出力して run を継続する。

**採用理由**: sandbox は macOS seatbelt 等の OS 機構に依存するためプラットフォーム依存性がある。
fail-closed（`failIfUnavailable: true`）にすると sandbox 非対応環境で全 run が停止し、防止層が
機能の対価として可用性を損なう。逃避書き込みは検出側 backstop が既に受けるため、予防層の
degradation は許容できる。degradation は silent にせず `[specrunner] warn:` で可視化する。

**却下した代替案**:

- *fail-closed*: sandbox 非対応プラットフォームで全 run が停止する。検出 backstop が補完しているため
  fail-closed による安全性の向上はコストを正当化しない。
- *silent degradation（SDK デフォルト警告のみ）*: 他 adapter 警告と grep で横断観測できない。
  `[specrunner] warn:` での一貫した声が必要。

### D3: 読み取りは制限しない

`filesystem.denyRead` / `allowRead` は設定しない。step agent は repo 全域の読み取り（rules.md、
既存ソースコード、sibling change folders 等）を前提に動作しており、read 制限は既存挙動を破壊する。
書き込みスコープがリスクの所在であり、read 制限は本 request の解決対象ではない。

### D4: Bash ツールと `bypassPermissions` を維持する

`sandbox.autoAllowBashIfSandboxed: true` を設定し Bash が sandbox 下でも実行できるようにする。
`permissionMode: "bypassPermissions"` および `allowedTools` / `disallowedTools` の構成は変更しない。

**採用理由**: sandbox は「書き込み先パスの OS 制約」であり、permission mode は「ツールの実行許可」
である。両者は直交する。Bash は step の git / build / test 操作に必須であり、sandbox 有効時に
自動禁止されるデフォルト挙動を `autoAllowBashIfSandboxed: true` で上書きする。permission 構成を
変えないことで挙動変化を最小化し、sandbox だけが新たな制約層になる。

### D5: degradation 検出は `stderr` callback 経由、fail-open 保証とは独立させる

SDK は sandbox 降格を typed なシグナルで通知しない。降格は Claude Code プロセスの stderr に
警告文字列として現れる。adapter はこの `stderr` callback を観測し、sandbox 不可シグネチャを
認識した最初のチャンクで `[specrunner] warn:` を 1 回出力する（once-latch で重複排除）。

`failIfUnavailable: false` による fail-open 継続は `stderr` callback とは構造的に独立している。
callback 側の predicate が将来の SDK 文言変更でマッチしなくなっても、run は継続する（fail-open
保証は維持される）。見逃されるのは observability 警告だけであり、backstop が逃避書き込みを受ける。

**却下した代替案**:

- *adapter 側プラットフォームプローブで availability を事前判定する*: SDK の実行時判断と diverge
  する可能性がある。「不可」と判定した環境では sandbox options をそもそも設定しなくなり、
  codex との対称性（options に sandbox が常に含まれること）が崩れる。

### D6: 変更を step agent (`agent-runner.ts`) のみに限定する

`query-one-shot.ts`（read 系 step）と codex adapter は変更しない。それぞれの options は
regression test で凍結する。

**採用理由**: 書き込みスコープのリスクは成果物を生成する step agent 側にあり、読み取り専用の
one-shot step に同時に導入する根拠がない。変更範囲を step agent に絞ることで影響範囲を最小化
し、他 call site の挙動変化リスクを排除する。

## Alternatives Considered

### Alternative 1: `canUseTool` によるパス検査（D1 の代替）

- **Pros**: SDK が提供する callback で実装でき、OS sandbox 機構を必要としない。Edit / Write ツールは `file_path` 引数で書き込み先を静的に判定できる。
- **Cons**: Bash の任意コマンド文字列（`echo ... > /abs/path`、`cp`、リダイレクト等）からアクセス先パスを静的に解決できない。主要な逃避経路が残るため、書き込みスコープの実装手段として不完全。
- **Why not**: 実際の逃避書き込みは Bash 経由の絶対パス書き込みであり、その経路を縛れない機構を単独で採用しても根本解決にならない。ただし sandbox が Bash 専用である（file tools を縛らない）ことが確認されたため、`canUseTool` は sandbox の**補完**（Edit / Write のパス検査）としては有効であり、別 change での追加が妥当（Known Gaps 参照）。

### Alternative 2: `bypassPermissions` をやめて deny ルール運用（D1 の代替）

- **Pros**: SDK の permission ルールで deny パスを明示でき、sandbox 機構を必要としない。
- **Cons**: permission ルールのパス意味論は OS sandbox より弱く、プロセスが直接 syscall を発行する経路（Bash が exec するサブプロセス等）を縛れない。`bypassPermissions` から permission ルール運用への切り替えは既存挙動への影響範囲が大きく回帰リスクが高い。
- **Why not**: 主要な逃避経路（Bash 経由の syscall 直接発行）をカバーできず、解決の根拠が薄い。挙動変化リスクも不採用の理由となる。

### Alternative 3: fail-closed（`failIfUnavailable: true`）（D2 の代替）

- **Pros**: sandbox が起動できなければ run を停止するため、予防が効かない状態で run が進むことがない。
- **Cons**: sandbox は macOS seatbelt 等の OS 機構に依存するためプラットフォーム依存性がある。sandbox 非対応環境や CI 環境によっては全 run が停止し、可用性を大きく損なう。
- **Why not**: 検出 backstop（`main-checkout-write-detection`）が逃避書き込みを step 境界で捕捉するため、予防層の degradation は許容できる。fail-closed が安全性を高める余地に対してコストが見合わない。

### Alternative 4: silent degradation（SDK デフォルト警告のみ）（D2 の代替）

- **Pros**: adapter 側に追加実装が不要。
- **Cons**: SDK が出力する警告は `[specrunner] warn:` の形式に準拠せず、他 adapter 警告と grep で横断観測できない。sandbox が機能していない状態が運用者に見えにくくなる。
- **Why not**: degradation は silent にせず specrunner 一貫したフォーマットで可視化することで、運用時の観測性を保証する必要がある。

### Alternative 5: adapter 側プラットフォームプローブで事前判定（D5 の代替）

- **Pros**: `stderr` callback の文言解析に依存せず、availability を確定的に判定できる。
- **Cons**: SDK の実行時判断と diverge する可能性がある。「不可」と事前判定した環境では sandbox options をそもそも query に含めなくなり、codex adapter との対称性（options に sandbox が常に存在すること）が崩れる。SDK のプラットフォーム判定ロジックを adapter 側で重複実装することになる。
- **Why not**: SDK の実行時判断を信頼し、`stderr` callback で degradation を観測する方が SDK との分離を保てる。predicate がマッチしなくても fail-open 保証は維持されるため、観測失敗のリスクは許容できる。

### Alternative 6: one-shot 系（`query-one-shot.ts`）への同時導入（D6 の代替）

- **Pros**: adapter 全体で書き込みスコープを均一化できる。
- **Cons**: one-shot 系は読み取り専用 step（review 系、request-review 等）を対象とし、成果物の書き込みを行わない設計になっている。sandbox 導入のリスクを正当化する根拠がない。変更範囲が広がりテストへの影響も増える。
- **Why not**: 書き込みスコープのリスクが step agent 側に限定されており、one-shot 系への同時導入は blast radius を不必要に広げる。必要であれば別件として扱う。

## Consequences

### Positive

- Bash 経由の絶対パス書き込み（逃避書き込みの主要経路）について、claude-code adapter が codex adapter の `workspace-write` と対称になる。
- Bash とその子プロセスの workspace 外書き込みを OS filesystem 層で遮断できる。
- sandbox 非対応環境でも run が停止せず fail-open で継続し、警告が `[specrunner] warn:` で可視化される。
- 検出 backstop（`main-checkout-write-detection`）と合わせて、予防（Bash 経路）+ 検出（全経路）の二層になる。

### Negative / Known Debt

- sandbox は OS 機構依存（macOS seatbelt 等）のため、非対応プラットフォームでは予防層は機能しない。
  その場合の保護は検出 backstop 側に委ねる。
- `filesystem.allowWrite` の glob 意味論が `cwd` サブツリーを完全にカバーするかは、sandbox 対応
  プラットフォームでの実 run で初めて確認できる。OS sandbox profile が temp dir / git worktree
  internal dir を自動許可しない場合、`buildWorkspaceSandbox` に追加パスを足す follow-up が必要。
- `stderr` callback 登録が SDK デフォルトの stderr forwarding を抑制する場合、write-through が必要
  （実装時に確認・対処済みであること）。

### Known Gaps

- **Edit / Write ツールの書き込みスコープは未対応**。SDK sandbox は Bash 専用であり、file tools は
  permission システム直轄で `bypassPermissions` 下では無制約。Edit / Write は `file_path` 引数で
  書き込み先を静的に判定できるため、`canUseTool` によるパス検査が自然な補完（別 change で対応）。
- **`dangerouslyDisableSandbox` escape hatch が開いている**。sandbox 内で失敗したコマンドを model が
  `dangerouslyDisableSandbox` 付きで再試行でき、その再試行は permission flow に回るが
  `bypassPermissions` では自動許可される。`sandbox.allowUnsandboxedCommands: false` で塞げるが、
  sandbox で実行不能な正当コマンド（network 到達が必要な場合等）が hard-fail する副作用の評価が必要
  （Edit / Write スコープと同じ別 change で扱う）。
- `query-one-shot.ts`（read 系 step）への sandbox 導入はスコープ外。read 系 step は成果物を書かない
  設計だが、必要なら別件で対応する。
- ネットワーク制限（`sandbox.network`）は本変更の対象外。

## References

- Request: `specrunner/changes/claude-adapter-write-scope/request.md`
- Design: `specrunner/changes/claude-adapter-write-scope/design.md`
- Spec: `specrunner/changes/claude-adapter-write-scope/spec.md`
- Review: `specrunner/changes/claude-adapter-write-scope/review-feedback-001.md` (approved, 9.10/10)
- Related: ADR-20260709-worktree-main-checkout-write-detection（検出 backstop 層、本 ADR と対をなす）
- Related: ADR-20260505-agent-runner-port-and-local-runtime（claude-code adapter の起源）
