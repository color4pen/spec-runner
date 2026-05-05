# RCA: fix-claude-code-runner-use-sdk

## 技術的原因

### 直接原因

`src/adapter/claude-code/agent-runner.ts` が `@anthropic-ai/claude-code` SDK の `query()` ではなく `spawn("claude", ["--print", ...])` で CLI を子プロセス起動している。streaming なし、ツール制御なし、turn 制御なし。

### 根本原因

PR #80 の implementer が「SDK が環境にない」と誤判断し subprocess にフォールバックした。実際には `bun add @anthropic-ai/claude-agent-sdk` で利用可能だった。request.md が `@anthropic-ai/claude-code` を SDK パッケージとして指定していたが、これは CLI バイナリ配布パッケージであり、`query()` を export しない。正しい SDK パッケージ名は `@anthropic-ai/claude-agent-sdk`。

### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| src/adapter/claude-code/agent-runner.ts | はい（本件） | SDK query() に置換 |
| tests/unit/adapter/claude-code/agent-runner.test.ts | テストも subprocess mock に依存 | query mock に書き換え |

## プロセス的原因

### 検出すべきだったフェーズ

- [ ] spec-review（設計段階で検出可能だった）
- [x] code-review（実装段階で検出可能だった）
- [ ] verification（テストで検出可能だった）

### レビュー観点の分析

| 対象 | ファイル | 該当観点の有無 | 詳細 |
|------|---------|-------------|------|
| code-review checklist | `code-review/references/checklist.md` | なし → ギャップ | 「設計文書で指定された外部 SDK の import を実際に使用しているか」の観点が不在 |
| spec-review criteria | `spec-review/references/review-criteria.md` | なし → ギャップ | request.md のパッケージ名が実在する export と一致するかの検証が不在 |
| rules | `.claude/rules/` | なし → ギャップ | SDK パッケージ名の正確性を検証するルールなし |

### 改善アクション

| アクション | 対象ファイル | 追加内容 | ステータス |
|-----------|------------|---------|----------|
| 外部 SDK 実装一致チェック追加 | code-review checklist | 設計で指定された SDK import が実装で使用されているか | proposed |
| パッケージ名検証 | spec-review criteria | request.md に記載の npm パッケージ名が実在し、指定 API を export するか | proposed |
