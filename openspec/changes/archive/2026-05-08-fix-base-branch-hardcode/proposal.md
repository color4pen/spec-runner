# Proposal: Fix base branch hardcode across codebase

## 問題の本質

コードベース全体で base branch が `"main"` / `"origin/main"` にリテラルハードコードされている（10 箇所）。`master` ベースのリポジトリでは:

1. `collectDynamicContext()` の git log/diff が空を返す（`main..HEAD` が無効な ref）
2. PR の base branch が `main` に固定され、`master` リポジトリでは PR 作成に失敗する
3. finish orchestrator が base branch への復帰をスキップする（`currentBranch === "main"` が常に false）
4. worktree が `origin/main` から作成され、`master` ベースでは ref エラーになる

## 根本原因

base branch の値が設計上どこにも宣言されていない。各コンポーネントが独立に `"main"` を仮定しており、設定を外部から注入する経路が存在しない。

`collectDynamicContext()` は `_branch` パラメータを受け取るが、内部で使用しておらず、呼び出し側も `jobState.branch ?? "main"` という無関係な値を渡している（`branch` は feature branch 名であり base branch ではない）。

## 提案する修正

### 設計方針: request.md に base-branch を必須フィールドとして追加

**理由**:
- request.md はパイプライン全体の single source of truth（slug, type と同様）
- config.json は repo-global な設定だが、request 単位で base branch が異なるケースを想定する必要はない（同一リポジトリでは一定）。しかし request.md に含めることで validate 時に検出でき、パイプライン入口で確定する
- `ParsedRequest` に `baseBranch: string` を追加し、パイプライン内の全消費者がここから取得する

### 変更の構造

```
request.md (Meta section)
  ↓ parseRequestMdContent()
ParsedRequest.baseBranch
  ↓
├── collectDynamicContext(cwd, baseBranch)   ← runner.ts 経由
├── setupWorkspace(slug, jobId, { baseBranch })  ← WorkspaceOptions 経由
│   └── worktree.create(repo, slug, jobId, `origin/${baseBranch}`)
├── PrCreateStep.run() → baseBranch           ← deps.request 経由
└── FinishInput.baseBranch                     ← cli/finish.ts で parse
    └── orchestrator: checkout, isOnMain, escalation message
```

### 後方互換性

- 既存の request.md に `base-branch` フィールドがない場合 → `REQUEST_MD_INVALID` エラー
- `specrunner request template` は `- **base-branch**: main` をデフォルト値として出力
- 既存パイプラインの request.md にフィールドを追加する必要がある（breaking change だが、request.md は人間が書くものであり自動生成ではないため許容範囲）

## 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/parser/request-md.ts` | `ParsedRequest.baseBranch` 追加、抽出・バリデーション |
| `src/core/command/request.ts` | テンプレートに `base-branch` 追加 |
| `src/git/dynamic-context.ts` | `_branch` → `baseBranch` リネーム、git コマンドで使用 |
| `src/core/command/runner.ts` | `request.baseBranch` を `collectDynamicContext` に渡す |
| `src/core/runtime/strategy.ts` | `WorkspaceOptions.baseBranch` 追加 |
| `src/core/runtime/local.ts` | 5 箇所の `"origin/main"` を動的参照に |
| `src/core/step/pr-create.ts` | `deps.request.baseBranch` を使用 |
| `src/core/finish/orchestrator.ts` | `FinishInput.baseBranch` 追加、3 箇所の `"main"` を置換 |
| `src/cli/finish.ts` | request.md をパースして `baseBranch` を取得 |
| テスト各種 | `baseBranch` フィールド追加、既存テストの request fixture 更新 |

## リスク分析

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存テストの request fixture に baseBranch がない | 高 | テスト内の fixture を全て更新 |
| finish の request.md パスが不明な場合がある | 中 | slug から `openspec/changes/{slug}/request.md` を推定 |
| worktree manager の baseRef 引数は既に動的 | 低 | 呼び出し側を修正するだけで manager 自体は変更不要 |
