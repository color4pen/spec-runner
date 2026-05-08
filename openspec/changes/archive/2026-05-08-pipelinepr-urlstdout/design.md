## Context

`specrunner run` の pipeline が `awaiting-merge` に到達すると、`handleResult()` (runner.ts:172) が branch 名を含む完了メッセージを stdout に出力する。PR URL は `state.pullRequest.url` に既に保持されているが、このメッセージには含まれていない。

`PullRequestInfo` は `src/state/schema.ts` で定義済み:

```typescript
export interface PullRequestInfo {
  url: string;
  number: number;
  createdAt: string;
}
```

`JobState.pullRequest` は optional field であり、`pr-create` step が正常完了した場合にのみ設定される。

## Goals / Non-Goals

**Goals:**

- `handleResult()` で `finalState.pullRequest?.url` が存在する場合に PR URL を stdout に出力する
- `pullRequest` 未設定時は現行動作（branch 名のみ）を維持する
- `cli-commands` spec に pipeline 完了時の PR URL 出力を記載する

**Non-Goals:**

- `specrunner resume` 完了時の PR URL 表示（別 change）
- PR URL のクリップボードコピー等の UX 拡張
- `specrunner finish` 側の出力変更
- 構造化出力（JSON 等）の導入

## Decisions

### D1. `handleResult()` 内で `logInfo` 1 行追加する（vs. 出力フォーマット変更）

既存の `logInfo(`Pipeline completed; awaiting merge. Branch: ${finalState.branch}`)` の直前または直後に、`finalState.pullRequest?.url` が truthy の場合のみ `logInfo(`PR: ${finalState.pullRequest.url}`)` を追加する。

**Rationale:** 既存の branch 表示行を変更するとパース依存がある場合に破壊的。別行で追加することで後方互換を完全に維持する。型変更・新依存は不要。`logInfo` は既に import 済み。

**Alternative considered:** branch 表示行に PR URL を埋め込む（`Branch: <branch> | PR: <url>`）→ 行が長くなり可読性低下。構造化出力を入れるなら別 change で設計すべき。

### D2. `pullRequest` 未設定時は silent fallback（warn なし）

`pullRequest` が `undefined` の場合は PR URL の行自体を出力しない。warn や info メッセージも出さない。

**Rationale:** `pullRequest` 未設定は legacy state や pr-create step 未実行（中断後の手動 merge 等）で発生しうる正常経路。warn を出すとノイズになる。

## Risks / Trade-offs

- **リスクなし**: 既存の optional field を 1 箇所で読むだけの変更。型安全性は TypeScript の optional chaining で担保。

## Open Questions

- なし
