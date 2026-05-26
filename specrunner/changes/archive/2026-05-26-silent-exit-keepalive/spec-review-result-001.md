# Spec Review Result: silent-exit-keepalive

- **verdict**: approved
- **date**: 2026-05-26
- **reviewer**: spec-reviewer

---

## Summary

request.md → design.md → tasks.md → delta specs の一貫性は高く、silent exit の root cause 分析は実証的根拠（PR #387 workaround、実機検証）に基づいている。3 つの delta spec はいずれも規定フォーマット（Requirement/Scenario 構造、MUST/SHALL normative keyword）に準拠。セキュリティ上の懸念は無い。

---

## Requirement Coverage

| Request 要件 | Design 決定 | Tasks | Delta Spec |
|---|---|---|---|
| lifecycle binding (#386 + 同型経路) | D1 (setInterval sentinel) + D2 (orchestration boundary) + D3 (beforeExit) | Task 1-6, 10 | process-lifecycle/spec.md |
| Agent tool redirect (#399) | D4 (disallowedTools + no-op fallback chain) | Task 8-9, 11 | claude-code-runtime/spec.md |
| opt-in diagnostic log | D5 (SPECRUNNER_DEBUG=pipeline) | Task 3, 7 | cli-commands/spec.md |

全要件が設計・実装・仕様に対応付けられている。

---

## Design Quality

**D1 (setInterval sentinel)**: `setInterval(() => {}, 0x7FFFFFFF)` による keep-alive は Bun の「pending work なし → exit」を確実に防ぐ。no-op callback なので CPU overhead ゼロ。`clearInterval` による解放が確定的。PR #387 の I/O pending 実証と整合。

**D2 (orchestration boundary)**: `CommandRunner.execute()` と `runFinishOrchestrator()` の `try/finally` で acquire/release を囲む設計は正しい。pipeline 内の step 遷移境界・managed-agent polling・finish git fetch retry 等の全 sub-operation が transitivity で保護される。

**D3 (beforeExit safety net)**: `fired` boolean guard で async I/O 後の再発火を防ぐ点、`awaiting-resume` への遷移で resume 可能性を保つ点、共に適切。

**D4 (Agent redirect)**: `disallowedTools` → no-op agent handler → stream 監視の fallback chain は、pre-1.0 SDK の不確実性を考慮した現実的な設計。redirect counter 3 回上限 + `abortController.abort()` → step error 経路 → pipeline escalation の連鎖が spec に明記されている。`canUseTool` を主軸から外す根拠（実機検証）も記載済み。

**D6 (process.exit)**: 既存 CLI entry points (`run.ts:106`、`resume.ts`、`finish.ts`) が明示的に `process.exit()` を呼んでいることを確認。追加実装不要と判断。

---

## Format Compliance

3 つの delta spec すべてで確認:
- `### Requirement:` ヘッダーが存在する ✓
- 各 Requirement に `#### Scenario:` が 1 つ以上ある ✓
- normative keyword (MUST / SHALL) が本文に含まれる ✓
- `## ADDED/MODIFIED` 旧形式は使用されていない ✓
- delta-spec-validation-result: approved 済み ✓

---

## Security Review

- **KeepAlive**: 純粋な timer 管理。ユーザー入力を扱わない。
- **ExitGuard**: `.specrunner/jobs/*.json` を固定 glob でスキャン。path traversal リスク無し。既存 `JobStateStore` を再利用。
- **Diagnostic log**: point 名はコード内定数。`SPECRUNNER_DEBUG` env var の値は `includes("pipeline")` チェックのみで出力に反映されない。inject リスク無し。
- **Agent redirect message**: ハードコードされた定数文字列。ユーザー入力を反映しない。
- 新規 web endpoint / SQL クエリ / auth フローなし。OWASP Top 10 に対する新規リスク無し。

---

## Findings (non-blocking)

### F1: AC の redirect 上限数が未更新 (minor)

request.md の AC に「**上限値は design step で決定し確定後に AC を更新**」とあるが、request.md の AC テキスト自体は更新されていない。一方 claude-code-runtime/spec.md の Scenario には「3 回発火 → 4 回目で abort」と正確に記載されており、仕様レベルの情報は完結している。実装に支障なし。

### F2: ExitGuard のモジュールレベル idempotency (minor)

`registerExitGuard()` は `fired` bool を closure 内に持つ設計のため、複数回呼ばれると複数の `beforeExit` handler が登録される（各 handler は独立した `fired` を持つ）。Task 6 はこれを「1 command = 1 process なので問題なし」と正しく認識している。実運用上の問題はないが、将来 process 共有テスト等で問題になる可能性がある。モジュールレベルの `let registered = false;` guard で完全に idempotent にできるが、本 request のスコープ内での対応は任意。

### F3: 同型経路の明示テストなし (minor)

AC 「同型経路の解消: managed polling 直後 / finish git fetch retry 経路でも silent exit しない (= e2e or unit test で keep-alive が effective なことを verify)」に対し、Tasks にこれらのパスを明示的にターゲットにしたテストが存在しない。Task 10 の統合テストは pipeline step 遷移を対象としており、managed-agent polling / finish git fetch retry への keep-alive 効果は CommandRunner の `try/finally` による transitivity で保証される。設計的に正しいが、明示的なテスト coverage は薄い。実装時に Task 10 で coverage を追加することが望ましい。

---

## Conclusion

設計の核心（sentinel timer + orchestration boundary wrap + beforeExit safety net + Agent redirect chain）は技術的に健全であり、実証的根拠に基づいている。delta spec フォーマットは準拠。セキュリティリスクは無い。Findings はいずれも実装を妨げない minor な指摘。

実装を進めてよい。
