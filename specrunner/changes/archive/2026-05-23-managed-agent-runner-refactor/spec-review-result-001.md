# Spec Review Result: managed-agent-runner-refactor

- **verdict**: approved
- **date**: 2026-05-22
- **reviewer**: spec-reviewer

---

## Architecture

**垂直分割戦略 (D1)** — design/polling を横断統合せず各 style 内で縦に割る判断は正しい。完了判定・resume fallback・guard の有無が根本的に異なる以上、横断統合すると条件分岐の海になりメンテナビリティが下がる。orchestrator を薄くして stage に委譲する構成も明確。

**共通 private 化スコープ (D2)** — timeout 解決 / follow-up block / usage read の 3 つに絞った判断は妥当。これらは実際に完全重複しており、helper 化のメリットが明確。一方、domain-specific な 1 回のみパターン（terminated / branchNotSet / resultFileNotFound）をインライン維持とするのも正解。過剰 helper 化しない方針が Cohesion を保つ。

**error-helpers 置き場所 (D3)** — `adapter/managed-agent/` 内の新設ファイルとし、throw 本体を `executor-helpers.throwWrappedError` に委譲する設計は coupling 方向（adapter → core）を正しく維持している。`executor-helpers.ts` に寄せると `JobStateStore` 依存（executor 責務）と混在して Cohesion が崩れるため、独立ファイルが適切。

**依存グラフ (tasks.md)** — T-01/T-02 並列可能 → T-03/T-04 依存 → T-05 の順序は自然で安全。

## Correctness

**regression リスクの文書化** — 下記 5 点が design.md と tasks.md の両方で明示されており、実装者への引き継ぎが十分:

1. timeout fallback の二段ロジック (`timeoutMs > 0 ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS`)
2. resume fallback の二重 catch（createSession 失敗と sendUserMessage 失敗でメッセージ/hint が異なる）
3. `sseEndTurn = !needsPollingFallback` による follow-up 実行条件（design 専用の条件を `executeFollowUpTurn` に埋め込まない）
4. design 側 verify の選択的 catch（verifyBranch は warn 非 fatal、verifyChangeFolder は CHANGE_FOLDER_NOT_FOUND/GITHUB_TOKEN_EXPIRED のみ rethrow）
5. `void completedAt` の error path 参照保持

**`streamWithPollingFallback` の union return** — `{ sseEndTurn: boolean } | AgentRunResult` を `"completionReason" in streamResult` で判別する設計は型安全であり、orchestrator の early return も明確。poll は orchestrator に残して戻り値型を分裂させない判断（tasks.md T-03 設計判断）は合理的。

## 注意点（実装時に確認を要する箇所 1 点）

### `throwSessionCreateError` の設計メッセージとの乖離

T-01 で定義する helper のシグネチャ:
```
message: `Failed to create ${stepName} session${contextSuffix}: ${errMsg}`
```

既存の design 側エラーは `"Failed to create session: ${errMsg}"` でステップ名を含まない（polling 側は含む）。tasks.md T-03-A は「この差異を保つ」と明示しているが、helper に空文字列を渡すと `"Failed to create  session: ..."` になり元のメッセージと一致しない。

実装者は design style の SESSION_CREATE_FAILED に限り helper を迂回して直接 `throwWrappedError` を呼ぶか、元のメッセージをそのまま保持するかを選ぶ必要がある。tasks.md は問題を認識しているが解決策を明記していない点で曖昧。ただしエラーコードは同一 (`SESSION_CREATE_FAILED`) であり、テストが message の文字列一致を要求していない場合は機能上の regression にならない可能性が高い。`bun run test` で検証が確認できれば問題なし。

## Task Decomposition Coverage

| 要件 | カバリングタスク |
|------|----------------|
| runDesignStyle の stage 縦抽出 | T-02, T-03 |
| runPollingStyle の stage 縦抽出 | T-02, T-04 |
| error-wrap の adapter 内 helper 集約 | T-01 |
| 振る舞い保持 / regression 注意点の文書化 | design.md + tasks.md 各 acceptance criteria |
| typecheck + test 検証 | T-05 |

要件の全項目がタスクに分解されており、抜け漏れなし。
