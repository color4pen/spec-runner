# Spec Review Result: codex-auth-fix (Round 2)

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-14
- **verdict**: approved

---

## Previous Findings Resolution

| Finding | Status | Notes |
|---------|--------|-------|
| F1 [medium] — dispatching テスト漏れ | **resolved** | design.md 影響ファイル表に `tests/adapter/dispatching/agent-runner.test.ts` 追加済み。tasks.md に T4.5 追加済み |
| F2 [low] — delta-spec 不要の根拠不足 | **resolved** | design.md 末尾に「archive 内の過去 delta-spec であり live spec ではない」旨を明記済み |
| F3 [low] — `OPENAI_API_KEY` 移行パス | **resolved** | design.md D5 に移行パスの説明と doctor hint への `CODEX_API_KEY` 言及を記載済み |

---

## Round 2 Verification

### Traceability Matrix

| request.md 要件 | design.md | tasks.md | 対象ファイル | 判定 |
|----------------|-----------|----------|------------|------|
| 1. `apiKey` 必須を外す | D1, D2 | T1 | `adapter/codex/agent-runner.ts` | OK |
| 2. `Codex()` オプションなし生成 | D2 | T1 | `adapter/codex/agent-runner.ts` | OK |
| 3. `OPENAI_API_KEY` チェック削除 | D4 | T3 | `adapter/dispatching/agent-runner.ts` | OK |
| 4. テスト更新 | D6 | T4, T4.5 | `tests/adapter/codex/`, `tests/adapter/dispatching/` | OK |
| 5. doctor `codex auth whoami` | D5 | T5 | `core/doctor/checks/runtime/codex-cli.ts` | OK |
| 6. エラーメッセージ非加工 | D3 | T2 | `adapter/codex/agent-runner.ts` | OK |

### Spec Consistency

- **request.md ↔ design.md**: 全6要件が D1-D5, D3 に対応。過不足なし
- **design.md ↔ tasks.md**: 全 design section が T1-T6 に対応。T4.5 追加により dispatching テストもカバー
- **design.md ↔ 実コード**: before/after コードスニペットが現行コードと一致。変更箇所の特定が正確
- **delta-spec**: live specs (`specrunner/specs/`) に `dispatching-agent-runner` / `codex-runtime` / `OPENAI_API_KEY` の記載なし。archive 内の delta-spec のみ。「delta spec 不要」は妥当

### Security Notes

- 認証を CLI に委ねることで spec-runner が credential をメモリに保持しなくなる — セキュリティ向上
- `process.env` 継承は安全な既存パターン（新たな env 変数の読み取り・加工はなし）
- CLI stderr をそのまま出力: credential fragment のリスクは CLI 側の責任。加工しない判断は正しい
- OWASP Top 10 該当なし

### Remaining Notes (informational, non-blocking)

- `codex auth whoami` のタイムアウト 5000ms は doctor チェックとして妥当。ネットワーク依存コマンドだが doctor は対話コンテキストで使われるため問題なし
- T6「typecheck && test を通す」は実装フェーズの検証タスクであり spec 網羅性とは独立。受け入れ基準の最終ゲートとして適切
