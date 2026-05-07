## REMOVED Requirements

### Requirement: `register_branch` Custom Tool は固定スキーマで定義される
**Reason**: branch 作成が CLI の責務に統一され、agent → CLI の branch 名通知が不要になったため tool 自体を廃止する。CLI が `setupWorkspace()` で branch を事前に作成し `jobState.branch` に記録するため、agent が branch 名を報告する必要がない。
**Migration**: CLI が `setupWorkspace()` で branch を作成し `jobState.branch` に記録する。propose agent は既存 branch 上で change folder を commit + push するだけになる。

#### Scenario: tool 定義の削除確認
- **WHEN** `src/adapter/managed-agent/tools/` ディレクトリを確認する
- **THEN** `register-branch.ts` が存在しない

### Requirement: ハンドラは last-write-wins で冪等に動作する
**Reason**: register_branch tool 自体が廃止されるためハンドラも不要。branch 名は CLI が一意に決定し state に記録する。
**Migration**: `jobState.branch` は `setupWorkspace()` で 1 回だけ設定される。last-write-wins の概念自体が不要。

#### Scenario: ハンドラの削除確認
- **WHEN** codebase を `registerBranchTool` で grep する
- **THEN** 0 件マッチ

### Requirement: definition と handler は同一モジュールに colocate される
**Reason**: register_branch tool 自体が廃止されるため colocate 規約も不要。
**Migration**: tool registry からの register_branch 参照を全て削除する。

#### Scenario: 参照の削除確認
- **WHEN** codebase を `register_branch` で grep する
- **THEN** tool 定義・ハンドラ・dispatch の参照が 0 件（テスト・spec・docs 内の履歴的言及を除く）

### Requirement: 不正な入力は明確なエラーで拒否する
**Reason**: register_branch tool 自体が廃止されるため入力バリデーションも不要。
**Migration**: なし。

#### Scenario: バリデーションの削除確認
- **WHEN** `src/adapter/managed-agent/tools/register-branch.ts` の存在を確認する
- **THEN** ファイルが存在しない

### Requirement: ハンドラ応答は user.custom_tool_result イベントで送信される
**Reason**: register_branch tool 自体が廃止されるため SSE dispatch も不要。
**Migration**: SSE dispatch table から register_branch のエントリを削除する。managed agent の session 作成時の custom_tools 配列から register_branch を除外する。

#### Scenario: SSE dispatch の削除確認
- **WHEN** managed agent の tool dispatch ロジックを確認する
- **THEN** register_branch の dispatch エントリが存在しない
