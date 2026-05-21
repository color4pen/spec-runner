# Spec Review Result: codex-auth-fix

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-14
- **verdict**: needs-fix

---

## Findings

### F1 [medium] — DispatchingAgentRunner テストの更新が design/tasks に記載されていない

`tests/adapter/dispatching/agent-runner.test.ts` に以下2テストが存在する:

- L87-109: `"routes openai model to CodexAgentRunner"` — `OPENAI_API_KEY` 環境変数を設定してから実行している。変更後は不要
- L111-125: `"throws MISSING_OPENAI_API_KEY when OPENAI_API_KEY is not set"` — この行動自体が削除されるため、テスト全体を削除する必要がある

design.md D6 と tasks.md T4 は `tests/adapter/codex/agent-runner.test.ts` のみ言及している。`tests/adapter/dispatching/agent-runner.test.ts` の更新が漏れている。

受け入れ基準「`bun run typecheck && bun run test` が green」を満たすには、このテストファイルの更新が必須。

**修正案**: design.md の影響ファイル表に `tests/adapter/dispatching/agent-runner.test.ts` を追加。tasks.md に T4.5 または T3 に付帯タスクとして:
- `OPENAI_API_KEY` 環境変数操作の除去（L91-92, L103-106）
- `"throws MISSING_OPENAI_API_KEY"` テスト（L111-125）の削除

### F2 [low] — delta-spec「不要」の判断に根拠が不足

`specrunner/changes/archive/codex/delta-spec.md` の `dispatching-agent-runner` spec に:

- #5: `DispatchingAgentRunner` MUST create `CodexAgentRunner` lazily on the first OpenAI step, **reading `OPENAI_API_KEY` from the environment** at that time.
- #6: `DispatchingAgentRunner` MUST throw `{ code: "MISSING_OPENAI_API_KEY" }` when `OPENAI_API_KEY` is absent

この2要件は変更後に無効になる。`specrunner/specs/` に dispatching-agent-runner の独立 spec が存在しないため、live spec への影響は限定的だが、design.md の「delta spec は不要」にはこの判断根拠（archive の delta-spec は live spec ではない等）を一文明記すべき。

### F3 [low] — `OPENAI_API_KEY` のみ設定している既存ユーザーの移行パス

旧: spec-runner が `OPENAI_API_KEY` を読み取り → SDK の `apiKey` に渡す → SDK が `env.CODEX_API_KEY` にセット → CLI が使用
新: SDK に `apiKey` を渡さない → CLI が `process.env` を継承 → CLI が `CODEX_API_KEY` / `~/.codex/auth.json` / `CODEX_ACCESS_TOKEN` を検索

`OPENAI_API_KEY` のみ設定し `CODEX_API_KEY` 未設定のユーザーは、Codex CLI が `OPENAI_API_KEY` をフォールバックで読むかどうかに依存する。request.md の認証チェーン列挙に `OPENAI_API_KEY` が含まれていない。

Codex CLI が実際に `OPENAI_API_KEY` も読む場合は問題ないが、読まない場合は breaking change になる。受け入れ基準で明示的に確認するか、doctor check の hint に `CODEX_API_KEY` への移行を案内すべき。

---

## Traceability Matrix

| request.md 要件 | design.md | tasks.md | 対象ファイル | 判定 |
|----------------|-----------|----------|------------|------|
| 1. `apiKey` 必須を外す | D1, D2 | T1 | `agent-runner.ts` | OK |
| 2. `Codex()` オプションなし生成 | D2 | T1 | `agent-runner.ts` | OK |
| 3. `OPENAI_API_KEY` チェック削除 | D4 | T3 | `dispatching/agent-runner.ts` | OK (but test gap: F1) |
| 4. テスト更新 | D6 | T4 | `tests/adapter/codex/agent-runner.test.ts` | **partial** — dispatching test 漏れ |
| 5. doctor `codex auth whoami` | D5 | T5 | `codex-cli.ts` | OK |
| 6. エラーメッセージ非加工 | D3 | T2 | `agent-runner.ts` | OK |

## Security Notes

- 認証を CLI に委ねることで spec-runner が credential をメモリに保持しなくなる — セキュリティ向上
- `process.env` 継承は安全な既存パターン
- CLI stderr をそのまま出力する設計: credential fragment のリスクは CLI 側の責任。spec-runner が加工しないのは正しい判断
- OWASP 関連の問題なし
