# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 1

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | test-coverage | src/cli/__tests__/command-registry-resume.test.ts | TC-03（must）「--quiet モードでも警告が表示される」が未カバー。実装は `stderrWrite` を `resolveLogLevel` より前に呼ぶため動作は正しいが、テストファイルに `--quiet` フラグを含むケースが存在しない。test-cases.md の must 基準を満たしていない | `flags: { prompt: "text", quiet: true }` で handler を呼び、`stderrWrite` が警告付きで呼ばれることを assert するテストケースを追加する | yes |
| 2 | HIGH | scope-creep | src/core/step/code-fixer.ts | `requiresCommit: true` の削除が本 request のスコープ外。build-fixer が混入させたと見られる。`requiresCommit: true` は code-fixer が変更なしで完了した場合にパイプラインがサイレント成功するのを防ぐガード。削除すると `needs-fix` パスで code-fixer が何もコミットしなくても pipeline が通過し、未修正のまま PR が作られる明確なバグ（回避策なし） | この行を元に戻す（`requiresCommit: true,` を再追加する）。別途意図的に変更するなら独立した request で行うこと | yes |

## Summary

コア実装（`command-registry.ts` の 4 行）は設計通り正確。`stderrWrite` を `resolveLogLevel` 呼び出しより前に配置しており、`--quiet` 抑制を受けない構造は正しい。TC-01（`--prompt`）・TC-02（`--prompt-file`）・TC-04（未指定時）の must テストは通過。

2 点の修正が必要: TC-03（`--quiet` + `--prompt` の組み合わせ）テスト追加と、スコープ外の `code-fixer.ts` 変更の差し戻し。
