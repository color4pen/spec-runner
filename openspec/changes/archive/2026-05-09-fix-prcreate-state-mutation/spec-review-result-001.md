# Spec Review Result — fix-prcreate-state-mutation

- **iteration**: 1
- **verdict**: approved
- **reviewed-artifacts**: proposal.md, design.md, tasks.md
- **review-scope**: Full review including security considerations

## Summary

仕様は request の 4 要件すべてを網羅し、実装対象コードとの対応が正確。`ParsedStepResult` 経由の伝搬は `scores` や `branch` と同じ確立されたパターンに従っており設計判断は妥当。タスク分解は依存関係を含め漏れなく、テスト計画も positive / negative / defensive の 3 軸をカバーしている。

## Completeness

- Req 1（mutation 除去）→ T2.1 で `state.pullRequest = ...` を除去。T5.1/T5.2 で `run()` 後に `state.pullRequest` が undefined であることを検証
- Req 2（result file 記録）→ T2.2 で `createdAt` 行を追加。url / number は既存。確認済み
- Req 3（`ParsedStepResult` 拡張）→ T1 で型追加、T3 で `parseResult()` が `pullRequest` を返す
- Req 4（`finalizeStep()` 反映）→ T4 で `state = { ...state, pullRequest }` を `store.persist()` の直前に配置

`resolve-target.ts:240` の `state.pullRequest?.url` 参照と `runner.ts:172` の PR URL 表示は、`finalizeStep()` 経由で `state.pullRequest` が設定されるため変更不要 — 仕様の「コード変更不要」判断は正しい。

## Correctness

- **`pushStepResult` との干渉なし**: `helpers.ts:96-103` を確認。`pushStepResult` は `steps` と `updatedAt` のみ上書きする spread 構造。T4 の `{ ...state, pullRequest }` は `pushStepResult` の後に実行されるため、フィールドの競合は発生しない
- **regex パターン**: `\*\*URL\*\*: (.+)$` / `\*\*Number\*\*: (\d+)$` / `\*\*CreatedAt\*\*: (.+)$` は result file テンプレート（`- **Key**: value` 形式）に対して正しくマッチする。`m` フラグで行末を認識し、`.trim()` で末尾空白を除去
- **defensive parsing**: URL / number / createdAt のいずれかが欠落した場合に `pullRequest` を undefined にする設計は、壊れた result file に対する安全策として適切
- **verdict マッピング**: success → `"success"`, failed → `"error"` は既存の `parseResult` と同一。変更なし

## Architecture

inline 型定義（`pullRequest?: { url: string; number: number; createdAt: string }`）は state 層の `PullRequestInfo` 型を import しない判断。ステップ層 → state 層への依存を増やさず、構造的型付けで互換性を維持。妥当。

## Security

- PR URL は `runPrCreate()` が返す値を result file に記録し、`parseResult()` が regex で再抽出する。入力源はすべて内部（GitHub API → CLI → result file）であり、外部入力は介在しない
- 認証・入力検証・OWASP Top 10 に該当する変更なし

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | tasks.md T4.1 | `let parsed: import("./types.js").ParsedStepResult` の動的 import 型を使用しているが、executor.ts L2 で既に `import type { Step, AgentStep, CliStep } from "./types.js"` が存在する。`ParsedStepResult` をこの既存 import に追加する方が簡潔 | `import type { Step, AgentStep, CliStep, ParsedStepResult } from "./types.js"` に変更 |
| 2 | LOW | consistency | design.md D5 | `L253 付近` と記載しているが、実際の `store.persist(state)` は L267。意味的に正しい（setsBranch の後、persist の前）が行番号が不正確 | 行番号を修正するか、「setsBranch 処理の後、store.persist の前」のみの記述に変更 |
