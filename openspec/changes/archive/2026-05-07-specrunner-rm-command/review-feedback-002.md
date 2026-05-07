# Code Review: specrunner-rm-command — Iteration 2

## Summary

Iteration 1 の must-fix 2 件（テスト Bun 互換性・バッチ per-job error handling）は両方とも適切に修正されている。テストは vi.mock/vi.mocked を排除し real filesystem + temp dir 方式に書き直され、20 テスト全 pass。runner の I/O は `RmResult.warnings[]` / `info[]` 経由で CLI 層に委譲する構造に改善された。CRITICAL / HIGH の指摘なし。

- **verdict**: approved

## Iteration Comparison (vs Iteration 1)

### Improvements
- **#1 (HIGH → resolved)**: rm.test.ts を Bun 互換に全面書き直し。`vi.mock(importActual)` / `vi.mocked()` を完全除去。XDG_DATA_HOME + mkdtemp で real filesystem テストに変更。20/20 pass
- **#2 (MEDIUM → resolved)**: `removeAllTerminated` のループに per-job try-catch 追加。`hasErrors` フラグで失敗 job を accumulate し、`exitCode: hasErrors ? 1 : 0` で返す
- **#3 (MEDIUM → resolved)**: runner から `process.stdout.write` / `process.stderr.write` の直接呼び出しを除去。`RmResult` に `warnings[]` と `info[]` を追加し CLI 層の `writeResult()` が一元管理。唯一の例外は `promptConfirm` の prompt 出力（interactive I/O なので runner 内で許容）

### Regressions
なし

### Unchanged Issues
- **#4 (LOW)**: `sessions.ts` の `deleteSession` wrapper が本 feature で未使用のまま残存
- **#5 (LOW)**: 未知 status のテストケース未追加

### Convergence Trend: `improving`

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/rm.test.ts | `removeAllTerminated` の per-job error handling（runner.ts:173-177）のテストがない。Iteration 1 #2 の修正コードだが、`deleteJobState` が途中で throw → 残りの job が処理される → `exitCode: 1` + warning に failed jobId が含まれる、のパスが未検証 | 3 件の target のうち中間の 1 件で `deleteJobState` が EACCES を返すテストを追加し、`removed: 2` + `exitCode: 1` + `warnings` に失敗 jobId 含有を assert |
| 2 | LOW | maintainability | src/core/rm/runner.ts:195 | `promptConfirm` が `process.stdout.write(prompt)` を直接呼ぶ。runner の他の I/O は全て `RmResult` 経由に統一されたが、ここだけ直接書き込み。テストでは `vi.spyOn` で吸収しているため実害なし | 許容。将来 prompt 抽象化が必要になったら `RmResult` に prompt callback を渡すパターンに変更 |
| 3 | LOW | consistency | src/adapter/managed-agent/sdk/sessions.ts:80-85 | `deleteSession` wrapper が本 feature で未使用。runner は D2 に従い `SessionDeleteClient` 構造型を使用。sessions.ts 冒頭の "the ONLY place that calls SDK session APIs" コメントとの整合性が曖昧 | (a) wrapper を削除して D2 に完全準拠、または (b) 将来の再利用を見越して維持。どちらでも可 |
| 4 | LOW | testing | tests/rm.test.ts | 未知 status（将来追加される可能性）に対する fallback（runner.ts:90）のテストケースがない | `makeJob` で任意 status をセットし、force なしで拒否 + fallback メッセージを assert するテストを 1 件追加 |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 8 | status gate・best-effort cleanup・冪等削除・per-job error handling すべて仕様準拠。edge case の網羅も十分 |
| security | 9 | 破壊操作に status gate + 確認プロンプト + 非 TTY 拒否 + unknown flag 検出。問題なし |
| architecture | 8 | D2 準拠（port に入れない）。runner/CLI の責務分離が明確。`RmResult` による pure return 化は良い改善 |
| performance | 9 | 逐次削除で十分。job 数が数百を超えるユースケースは想定外 |
| maintainability | 8 | I/O の一元管理が実現。コード量も適切。`promptConfirm` の直接 I/O は minor |
| testing | 7 | 20 テスト全 pass。主要パス（status gate 全パターン・managed mode session cleanup・batch filter・non-TTY 拒否）をカバー。per-job error path が未テスト（#1） |

**Total**: 8 × 0.30 + 9 × 0.25 + 8 × 0.15 + 9 × 0.10 + 8 × 0.10 + 7 × 0.10 = 2.40 + 2.25 + 1.20 + 0.90 + 0.80 + 0.70 = **8.25**

Threshold: 7.0 → pass。CRITICAL: 0, HIGH: 0。
