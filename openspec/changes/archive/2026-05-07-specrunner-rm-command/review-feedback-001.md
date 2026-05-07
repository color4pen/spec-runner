# Code Review: specrunner-rm-command — Iteration 1

## Summary

実装は design.md の決定事項（D1-D6）に忠実で、CLI 統合・runner 分離・status gate・best-effort session cleanup の構造は良好。主要な問題はテストファイルが Bun 非互換の `vi.mock(importActual)` を使用しており全テスト crash する点と、`removeAllTerminated` の per-job エラーハンドリング欠如。

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | testing | tests/rm.test.ts:16-18 | `vi.mock("node:fs/promises", async (importActual) => {...})` は Bun の Vitest 互換レイヤで未サポート。`importActual` は `undefined` になり全テストが crash する（`TypeError: importActual is not a function`）。`vi.mocked()` (line 113) も同様に Bun 未サポート。結果として rm.test.ts の 16 テスト全てが実行不能 | `vi.mock` の `importActual` パターンを削除する。`deleteJobState` の EACCES テストは、store.ts 内部で `fs.unlink` を直接呼ぶのではなく、テスト側で temp ディレクトリのパーミッションを変更するか、`deleteJobState` のテストを `getJobStatePath` が返すパスに対して read-only ディレクトリを作る方式に変更する。`vi.mocked()` → `(nodefs.unlink as ReturnType<typeof vi.fn>)` など Bun 互換の cast に置換 |
| 2 | MEDIUM | correctness | src/core/rm/runner.ts:150-157 | `removeAllTerminated` のループ内で `deleteJobState(state.jobId)` が throw した場合（例: パーミッションエラー）、残りの job が処理されずバッチが中断する。1 ファイルの障害で一括削除全体が失敗する | 各 iteration を try-catch で囲み、失敗した jobId を accumulate して最後に warning 出力 + exitCode 1 で返す。`removed` カウンタは成功分のみインクリメント |
| 3 | MEDIUM | maintainability | src/core/rm/runner.ts:101,123,127,142,159 | runner 内部で `process.stdout.write` / `process.stderr.write` を直接呼んでいる。エラー系は `RmResult.message` 経由で CLI 層に返すが、成功系は runner が直接書く。2 つのパターンが混在しテスタビリティが下がる（テスト側で `process.stdout.write` を spy する必要がある） | 全メッセージを `RmResult.message` 経由で返し、CLI 層（`src/cli/rm.ts`）が stdout/stderr への書き込みを一元管理する。runner は pure な結果のみ返す |
| 4 | LOW | consistency | src/adapter/managed-agent/sdk/sessions.ts:80-85 | task 2.1 で `deleteSession` SDK wrapper を追加したが、runner は D2 決定に従い独自の `SessionDeleteClient` 構造型を使用。この wrapper は本 feature では未使用。sessions.ts のコメント "the ONLY place that calls SDK session APIs" との整合性が曖昧（runner が構造型経由で同じ API を呼ぶ） | 現状維持でも可。将来 `deleteSession` wrapper を使うなら runner の `SessionDeleteClient` を削除して wrapper 経由に統一する。使わないなら wrapper を削除して D2 に完全準拠させる |
| 5 | LOW | correctness | src/core/rm/runner.ts:82-84 | 未知の status（将来追加される可能性）に対する fallback メッセージ `Cannot remove job with status '${state.status}'. Use --force to override.` は防御的で良いが、design.md の D1 テーブルには定義されていない status への言及がない。テストも未知 status のケースをカバーしていない | 未知 status のテストケースを 1 件追加する |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 7 | status gate・best-effort cleanup・冪等削除の実装は仕様準拠。batch error handling が欠落（#2） |
| security | 9 | 破壊操作に適切な gate + 確認プロンプト + 非 TTY 拒否。問題なし |
| architecture | 8 | D2 の判断（port に入れない）は適切。runner/CLI の責務分離は明確 |
| performance | 9 | 逐次削除で十分なスケール。問題なし |
| maintainability | 6 | stdout/stderr 直書きの混在パターン（#3）がテスタビリティを下げている |
| testing | 3 | 全テスト crash（#1）。テストケース自体の設計は網羅的だが実行不能 |

**Total**: 7 × 0.30 + 9 × 0.25 + 8 × 0.15 + 9 × 0.10 + 6 × 0.10 + 3 × 0.10 = 2.10 + 2.25 + 1.20 + 0.90 + 0.60 + 0.30 = **7.35**

Threshold: 7.0 → スコアは超過しているが、HIGH finding (#1) が存在するため verdict は **needs-fix**。

## Must-fix items

1. **#1 (HIGH)**: rm.test.ts の Bun 互換性修正 — 全テストが実行可能になること
2. **#2 (MEDIUM)**: `removeAllTerminated` の per-job error handling 追加
