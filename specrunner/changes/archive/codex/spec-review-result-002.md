# Spec Review Result — codex (round 2)

- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-14
- **verdict**: approved

---

## Summary

Round 1 の 6 件の指摘（F1 critical〜F6 low）はすべて design.md / tasks.md / delta-spec.md に反映済み。request.md の全 16 要件が design → tasks → delta-spec で完全にトレース可能。新たな blocking issue なし。

---

## Round 1 Findings — Resolution Status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| F1 | critical | DoctorContext.config.get("steps") API 不一致 | **resolved** — T7 コードにコメント追記。`buildDoctorConfig()` の dot-path traversal は single-segment key でオブジェクト全体を返すことを実コード（`src/cli/doctor.ts:40-55`）で確認済み |
| F2 | high | validateConfig() 内レジストリ重複 | **resolved** — D6 Note を「`schema.ts` MUST import `BUILTIN_MODEL_REGISTRY`」に確定。T3 コードが `BUILTIN_MODEL_REGISTRY` を import し、リテラル Set を排除 |
| F3 | medium | getStepExecutionConfig 二重呼び出し | **resolved** — D4 に「Double-call is intentional」の rationale を追記。adapter 間の関心分離を明示 |
| F4 | medium | StepContext ハードコード値の重複 | **resolved** — D3 に「StepContext construction is a future common helper candidate」を追記。3rd adapter 追加時の抽出トリガーを定義 |
| F5 | low | codex-cli check の required: true | **resolved** — D7 に rationale 追記。OpenAI steps 未構成時は unconditional pass なので non-OpenAI ユーザーへの影響なし |
| F6 | low | OPENAI_API_KEY チェック要件欠落 | **resolved** — delta-spec `cli-config-store` に lazy check 要件を明記。D4 に「OPENAI_API_KEY check strategy」追記 |

---

## New Observations (round 2)

### O1 [low] — maxTurns が Codex で silently ignored

`getStepExecutionConfig()` で `resolvedConfig.maxTurns` を解決するが、Codex SDK の `thread.run()` options は `{ signal?: AbortSignal }` のみで maxTurns パラメータがない。T4 のコード上 `resolvedConfig.maxTurns` は使用されず、ユーザーが `steps.implementer.maxTurns: 10` を設定しても Codex ステップでは効果がない。

タイムアウト（AbortSignal）は正しく機能するため実用上の問題は小さいが、design.md に「maxTurns は Codex SDK に相当パラメータがなく、Codex ステップでは適用されない。ターン制御は timeoutMs で代替する」旨を known limitation として記載すると良い。

**判定**: blocking ではない。実装者への注記として残す。

### O2 [low] — T6 で queryFn threading を追加

T6 が `createClaudeCodeRunner({ cwd, _queryFn: this.queryFn })` に変更する提案は、Codex 対応ではなく既存の LocalRuntime → ClaudeCodeRunner 間の mock 伝搬ギャップの修正。現行コードは `_queryFn` を渡していないため、LocalRuntime に queryFn を inject するテストでは ClaudeCodeRunner が SDK デフォルトを使う。修正自体は妥当だが、scope は Codex 変更からやや逸脱。

**判定**: blocking ではない。変更は有益。

---

## Traceability Matrix

| request.md 要件 | design.md | tasks.md | delta-spec.md | 状態 |
|---|---|---|---|---|
| 1. CodexAgentRunner 実装 | D1 | T4 | codex-runtime #1 | OK |
| 2. Codex SDK thread.run() | D1 | T4 | codex-runtime #1 | OK |
| 3. プロンプト構築 | D3 | T1, T4 | codex-runtime #2 | OK |
| 4. sandboxMode workspace-write | D2 | T4 | codex-runtime #3 | OK |
| 5. resultFilePath / finalResponse | D1 | T4 | codex-runtime #5 | OK |
| 6. FileChangeItem ロギング | D1 | T4 | codex-runtime #8 | OK |
| 7. Usage マッピング | D1 | T4 | codex-runtime #6 | OK |
| 8. AbortSignal タイムアウト | D1 | T4 | codex-runtime #7 | OK |
| 9. skipGitRepoCheck | D1 | T4 | codex-runtime #4 | OK |
| 10. config.models レジストリ | D5 | T2, T3 | cli-config-store | OK |
| 11. model → provider 解決 | D5 | T2, T5 | dispatching #2 | OK |
| 12. 未知モデル名エラー | D6 | T2, T3 | cli-config-store | OK |
| 13. managed + OpenAI reject / OPENAI_API_KEY | D6, D4 | T3, T5 | cli-config-store, dispatching #6 | OK |
| 14. DispatchingAgentRunner | D4 | T5 | dispatching #1-7 | OK |
| 15. LocalRuntime 変更 | D4 | T6 | dispatching #8 | OK |
| 16. doctor codex-cli check | D7 | T7, T8 | cli-commands | OK |

全 16 要件がトレース可能。delta-spec の MUST 要件はすべて testable。

---

## Security Review

- **API key handling**: `OPENAI_API_KEY` は `process.env` から読み取り、SDK に直接渡す。既存の `ANTHROPIC_API_KEY` と同じパターン。config.json に API key を書く経路は存在しない
- **sandboxMode**: `"workspace-write"` は worktree 内のファイル書き込み + Bash 実行を許可。worktree は git isolation 済み。review ステップのソースコード非変更はプロンプト制御（既存パターン踏襲）
- **Input validation**: `validateConfig()` が `models[].provider` を `"anthropic" | "openai"` に制限。未知モデル名はエラー。managed + OpenAI の組み合わせは reject
- **新たな攻撃面**: なし。Codex SDK は既存の Claude Agent SDK と同等のローカル実行モデル

---

## Verdict Rationale

- Round 1 の全指摘が修正済み
- 全 16 要件が design → tasks → delta-spec で完全にトレース可能
- 新規 observations（O1, O2）はいずれも low severity で blocking ではない
- セキュリティ上の懸念なし
- 既存パイプラインの後方互換性が明確に定義されている
