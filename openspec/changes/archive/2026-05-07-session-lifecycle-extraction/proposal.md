# Proposal: Session Lifecycle Extraction

## Summary

run.ts（363行）と resume.ts（341行）に散在する runtime 分岐（`config.runtime` の if/else が 4 箇所）、worktree ライフサイクル管理、signal handler、PipelineDeps 組み立てなどの重複コードを、ポリモーフィズムで統合する。

## Problem

1. **runtime 分岐の散在**: `config.runtime` による if/else が `run.ts`（L181-185）、`resume.ts`（L177-181）、`pipeline/run.ts`（L34-46, L117-129）の 4 箇所に存在
2. **worktree ライフサイクルの重複**: create → state 記録 → request.md コピー → git add → cleanup → signal handler が run/resume で個別実装（run: ~100行, resume: ~93行）
3. **PipelineDeps 組み立ての重複**: client, config, repo, request, slug, githubClient, cwd をほぼ同一構造で構築
4. **同名関数の別実装**: `outputPipelineThrowError` が 2 ファイルで別実装
5. **拡張性の欠如**: `request-create` コマンド追加時に runtime 分岐が 5 箇所目に散らばる

## Solution

2 つの抽象化を導入して分岐と重複を解消する：

1. **RuntimeStrategy** — local/managed の runtime 差異をインターフェースで吸収。`config.runtime` 分岐をファクトリ 1 箇所に集約
2. **CommandRunner** — pipeline 実行コマンド（run/resume）の共通骨格を Template Method で定義。override ポイントは `prepare()` のみ

## Impact

- **ファイル変更**: 主に `src/cli/run.ts`, `src/cli/resume.ts`, `src/core/pipeline/run.ts`
- **新規ファイル**: `src/core/runtime/` (4ファイル), `src/core/command/` (3ファイル)
- **振る舞い変更**: なし（純粋リファクタリング）
- **リスク**: 低。既存テストで振る舞い保証

## Acceptance Criteria

- `config.runtime` の if/else が `createRuntime` ファクトリの 1 箇所のみ
- `run.ts` と `resume.ts` がそれぞれ 50 行以下
- `LocalRuntime` が worktree の setup/cleanup/signal handler を一元管理
- `ManagedRuntime` が worktree 関連処理を含まない
- `pipeline/run.ts` の runtime 分岐が解消
- `bun run typecheck && bun run test` が green
