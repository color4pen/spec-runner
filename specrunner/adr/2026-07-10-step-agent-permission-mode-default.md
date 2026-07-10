# ADR-20260710: step-agent の permissionMode を `default` に変更し canUseTool で workspace guard を実装する

## ステータス

承認済み

## コンテキスト

claude-code adapter の step-agent (`src/adapter/claude-code/agent-runner.ts`) は、これまで `permissionMode: "bypassPermissions"` で動作していた。この設定では全 tool が自動許可されるため、`canUseTool` コールバックは一度も呼ばれない。

#766（`file-tool-write-scope`）は `Edit` / `Write` の workspace 外書き込みを `canUseTool` で deny しようとしたが、次の二重欠陥のまま merge され #768 で revert された：

1. **`dontAsk` による report_result deny**: `permissionMode: "dontAsk"` は allowedTools に載っていない tool を `canUseTool` に委譲せず即座に deny する。`report_result` MCP tool が pre-approve されていなかったため、SDK 層で deny され全 run が escalation 停止した。
2. **guard の不発火**: `Edit` / `Write` が `allowedTools` に残っていたため pre-approve 扱いとなり、`canUseTool` が一度も呼ばれず guard は inert だった。

根本原因は「SDK の挙動を静的読解で推定し、それを実測として記録した」ことにある。spec-review も同じ静的読解でこれを通過させた。

本 ADR は revert 後の再実装（#766 redo）で採用した設計判断を記録する。再実装に先立ち、@anthropic-ai/claude-agent-sdk ^0.2.128 の permissionMode 挙動を実際の query probe で計測し、その実行ログを設計文書に記録した（`specrunner/changes/write-scope-guard-redo/design.md` §Probe Execution Log）。

### SDK 実測事実（2026-07-10 確定）

| permissionMode | canUseTool が呼ばれる条件 |
|---|---|
| `bypassPermissions` | **一度も呼ばれない**（全 tool 自動許可） |
| `dontAsk` | **呼ばれない**。allowedTools にない tool は canUseTool に委譲せず即 deny |
| `default` | allowedTools に**ない** tool に対して canUseTool が発火する |

さらに：
- allowedTools に載った tool は pre-approve され canUseTool を**素通りする**（guard をかけたい tool を allowedTools に載せてはならない）
- in-process MCP tool の許可名は `mcp__<serverName>__<toolName>` 形式
- `default` モードの headless 実行では canUseTool がプロンプト代替の permission handler として機能し、deny 時は `{behavior: "deny", message}` が agent に届いて実行を継続できる

## 決定

### D1: permissionMode を `"default"` に変更、allowedTools から Edit / Write を除外する

step-agent の `queryOptions` を以下に変更する：

- `permissionMode: "default"`（`"bypassPermissions"` から変更）
- `allowedTools` ベース: `["Read", "Bash", "Grep", "Glob"]`（`Edit` / `Write` を除外）
- `canUseTool: createWorkspaceToolGuard(cwd)` を設定

`Edit` / `Write` は `disallowedTools` に加えるのではなく、`allowedTools` から外すだけ（= tool は利用可能だが canUseTool 経由でパス検証される）。

**根拠**: SDK 実測事実より、canUseTool が発火するのは `default` モードかつ allowedTools に**ない**ときのみ。これが workspace guard を機能させる唯一の実測確認済み構成。

### D2: workspace guard `createWorkspaceToolGuard(cwd)` を実装する

純粋なファクトリ関数として実装：

- `Edit` / `Write` の `file_path` が `cwd` 外を指す場合 → `{ behavior: "deny", message }` で deny。message は worktree を名指し、workspace 内での作業を指示する。
- `file_path` が欠落または非 string → `{ behavior: "allow" }`（tool 自身の入力検証に委ねる）
- それ以外の全 tool → `{ behavior: "allow" }`

containment 判定: `path.resolve(cwd, file_path)` した絶対パスを `path.relative(cwd, resolved)` で評価し、`..` で始まるか絶対パスになるなら「外」。

### D3: report_result MCP tool を allowedTools で pre-approve する

`ctx.policy.reportTool` が設定されている場合、`mcp__specrunner_report__${toolSpec.name}` を `allowedTools` に追加する。未設定時は追加しない。

**根拠**: MCP tool は allowedTools に記載すれば `default` モードで即実行される（SDK 実測事実）。pipeline の完了シグナル（report_result）を guard 実装の変更から完全に隔離する。canUseTool の default-allow arm でも allow されるが、pre-approve の方が permission 判定の関与点が少なく、より安全。

### D4: `allowUnsandboxedCommands: false` で dangerouslyDisableSandbox escape hatch を閉じる

`buildWorkspaceSandbox(cwd)` に `allowUnsandboxedCommands: false` を追加する。

**根拠**: オープンなままでは、agent が失敗した Bash コマンドを `dangerouslyDisableSandbox` 付きで再実行でき、sandbox が形骸化する。step-agent の Bash 用途（git status / diff / add、ローカルビルド）に network 不要、workspace 外へのアクセス不要であることを確認済み。

### D5: probe スクリプトを repo に残し、実行ログを設計文書に記録する

`scripts/probes/write-scope-guard-probe.ts` を成果物として repo に置き、実装者が実行した raw stdout を `design.md §Probe Execution Log` に貼る。3 シナリオ（workspace 外 Write → deny、workspace 内 Write → allow、report_result → 即実行）すべてが PASS になることが acceptance 条件。

この probe は vitest / tsup / eslint の include 範囲外（`scripts/probes/`）に置き、オフライン CI 検証ゲートに入れない。

**根拠**: #766 の失敗は「SDK への静的主張が実行証拠なしにレビューを通過した」ことに起因する。「外部 SDK への主張は実行痕跡を伴う」を受け入れ条件として conformance が照合できる形（ファイル + design.md のログ）にすることで、同型の失敗を構造的に排除する。

## 却下した代替案

### Alternative 1: `bypassPermissions` のまま `canUseTool` を設定する

**Pros**: 現状から変更が最小。headless 動作は保証されており、all-tools-allowed の動作は継続する。

**Cons**: SDK 実測事実 1 より、`bypassPermissions` では `canUseTool` は一度も呼ばれない。設定した guard コールバックは完全に inert になる。

**Why not**: guard が発火しないため workspace 外書き込みを防げない。これは #766 が実際に持っていた欠陥と完全に同型であり、採用することで同じ失敗を繰り返す。

### Alternative 2: `dontAsk` + MCP tool を `allowedTools` に追加する

**Pros**: allowedTools に列挙した tool のみを許可する deny-by-default に近い挙動が得られ、アクセス制御をより厳格にできる。

**Cons**: SDK 実測事実 2 より、`dontAsk` は allowedTools にない tool を `canUseTool` に委譲せず即座に deny する。headless runner では将来追加される未知の tool がすべて deny される。更新漏れが即座に実行停止に繋がる。これは #766 の事故原因（report_result が deny されて全 run が escalation 停止）そのもの。

**Why not**: headless runner として本質的に不適。`canUseTool` に guard ロジックを委ねることができないため、guard と permissionMode を組み合わせる設計目的を果たせない。

### Alternative 3: `Edit` / `Write` を `allowedTools` に残したまま guard を期待する

**Pros**: `allowedTools` への変更が不要。既存の許可リストを維持できる。

**Cons**: SDK 実測事実 4 より、`allowedTools` に列挙された tool は pre-approve されて `canUseTool` を素通りする。`Edit` / `Write` を残した場合、guard コールバックはそれらに対して一度も呼ばれない。

**Why not**: guard が inert になる。これも #766 が持っていたもう一つの欠陥と同型であり、採用することで guard は設定されているように見えて実際には何も防がない。

### Alternative 4: workspace 外 write を deny でなく redirect（`file_path` 書き換え）する

**Pros**: agent が workspace 外に書こうとしたとき、`updatedInput` で `file_path` を書き換えることで実行を止めずにワークフローを継続できる。

**Cons**: agent が意図した場所とは異なる場所に成果物が書かれるため、provenance が不透明になる。デバッグ時に成果物がどこに書かれたか追えない。

**Why not**: #766 のスコープ外議論で既に却下済み。SpecRunner の基本原則として「成果物の所在は明示的であるべき」があり、redirect はこれに反する。deny + message で agent に再考を促す方が透明性が高い。

### Alternative 5: probe の実行ログを unit test 内に記録する

**Pros**: CI で自動実行されるため、SDK バージョンアップ時の挙動変化を自動検出できる。テストとして管理・追跡できる。

**Cons**: probe は実際の SDK クレデンシャルと live API 呼び出しが必要であり、オフライン CI ゲートには入れられない。無理に unit test に含めると CI を壊すか、モックに置き換えることで「実測」の意義を失う。

**Why not**: probe の目的は「外部 SDK の挙動を実際に動かして確認した証拠を残す」こと。モック化した unit test ではこれを果たせない。repo スクリプト + design.md への実行ログ貼付という形で証拠を永続化し、将来の開発者が再実行できるようにすることが目的に合致する。

### Alternative 6: `canUseTool` の default-allow arm に頼り、MCP tool を pre-approve しない

**Pros**: `allowedTools` への MCP tool 名の追加が不要。guard の default-allow arm が `report_result` も allow するため、機能的には同じ結果になる。

**Cons**: pipeline の完了シグナル（`report_result`）が guard 実装の変更に依存するようになる。guard の default-allow 動作が変わるたびに report_result への影響を検証する必要がある。

**Why not**: `report_result` は pipeline の生命線であり、guard のロジック変更から隔離すべき。pre-approve により permission 判定の関与点をゼロにすることで、guard の将来的な修正が report_result 経路に波及しないことを構造的に保証できる。

## 影響範囲

- `src/adapter/claude-code/agent-runner.ts` — step-agent のみ対象。one-shot (`query-one-shot.ts`) / `LocalRuntime.query()` / codex adapter は**不変**。
- 既存テスト TC-023 の 2 assertion（`allowedTools` / `permissionMode`）を更新。それ以外の既存テストは無変更で green。
- `specrunner/reviewers/cross-boundary-invariants.md` に `src/adapter/**` を追加。将来の adapter 変更が cross-boundary レビューの対象になる。

## 学習

- **SDK の permissionMode semantics は文書から直感的には読めない**。特に「`bypassPermissions` は canUseTool を無効化する」「`dontAsk` は canUseTool に委譲しない」は実測して初めて確認できる事実であり、adapter の permission 設定を変更する際は必ず probe で確認すること。
- **guard をかけたい tool を allowedTools に入れてはならない**。pre-approve は guard の手前で分岐するため、guard が一切機能しなくなる。
- **外部 SDK への主張は実行証拠を伴う**。`scripts/probes/` に probe を置き `design.md` に実行ログを貼ることを、SDK 挙動依存の変更の acceptance 条件とする。

## 追記（2026-07-11）: allow result の updatedInput 必須

マージ前の probe 独立再実行により追加の実測事実を確認: permission result の allow は
`{ behavior: "allow", updatedInput: <record> }` を Zod スキーマで要求し、bare allow は
ZodError で拒否され tool call が実行されない。`createWorkspaceToolGuard` は全 allow arm で
原 input を `updatedInput` としてパススルーする。詳細は change の design.md Addendum を参照。
