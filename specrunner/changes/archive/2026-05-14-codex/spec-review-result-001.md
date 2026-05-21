# Spec Review Result — codex

- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-14
- **verdict**: needs-fix

---

## Summary

request.md は明確で背景・要件・スコープ外が十分定義されている。design.md と tasks.md は request の要件を高い網羅性でカバーしている。delta-spec.md のテスト可能な MUST 要件も概ね適切。以下に挙げる指摘を修正すれば approved にできる。

---

## Findings

### F1 [critical] — DoctorContext.config.get() API とタスクコードの不一致

**場所**: tasks.md T7 `codexCliCheck`

T7 のコードでは `ctx.config.get("steps")` および `ctx.config.get("models")` を呼んでいるが、`DoctorConfig.get()` はドットパス（`"anthropic.apiKey"` 等）で単一の値を返すインターフェースであり、トップレベルキーを渡してオブジェクト全体を取得する使い方が実際にサポートされているか不明確。

既存の doctor check 実装を確認し、`get("steps")` でオブジェクトが返る前提が正しいことを確認するか、API に合わせてコードを修正すること。

### F2 [high] — validateConfig() 内でのレジストリ重複

**場所**: tasks.md T3

T3 は `builtinKeys` / `openaiBuiltin` をリテラル Set として `validateConfig()` 内に複製し、T2 の `BUILTIN_MODEL_REGISTRY` とは独立に管理する設計。design.md の Note でも「どちらでも acceptable」と書いているが、将来モデル追加時に2箇所の同期が必要になる保守リスクがある。

`model-registry.ts` から `schema.ts` への import は **型のみ** (`SpecRunnerConfig`) なので、`schema.ts` から `model-registry.ts` の定数を import しても循環参照は発生しない（TypeScript の型 import は emit されない）。`BUILTIN_MODEL_REGISTRY` を import して使うことを推奨する。

design.md の D6 Note を「`model-registry.ts` を import する」方針に確定し、T3 のリテラル Set を削除すること。

### F3 [medium] — DispatchingAgentRunner が getStepExecutionConfig を二重呼び出し

**場所**: tasks.md T5 → T4

`DispatchingAgentRunner.run()` で `getStepExecutionConfig()` を呼んでモデル名を解決し provider を判定した後、`CodexAgentRunner.run()` 内で再び同じ `getStepExecutionConfig()` を呼ぶ。呼び出し自体は冪等で機能的にはバグではないが、不要な重複計算であり可読性も低い。

対策案: `DispatchingAgentRunner` で解決した model を `AgentRunContext` 経由で downstream に渡すか、または `DispatchingAgentRunner` は provider routing のみに徹して model 解決は adapter 側の責務として受け入れる。後者が現状の設計意図と思われるが、design.md に「二重呼び出しは意図的」と一言明記しておくこと。

### F4 [medium] — CodexAgentRunner の StepContext 構築にハードコード値

**場所**: tasks.md T4

`ClaudeCodeRunner.run()` と `CodexAgentRunner.run()` の両方で `StepContext` をほぼ同一のロジックで構築している（`request.type: "feature"`, `title: ""`, `baseBranch: "main"` 等のハードコード値を含む）。T1 で prompt builder を共有化したように、StepContext 構築も共有ヘルパーに抽出すべき。少なくとも design.md で「将来の共通化候補」として言及すること。

### F5 [low] — codex-cli check の `required: true` の妥当性

**場所**: design.md D7, tasks.md T7, delta-spec.md

`codexCliCheck` を `required: true` にしているが、OpenAI モデルを使わないユーザーにとっては関係ないチェック。現状は `hasOpenAiSteps()` で早期 pass するので実害はないが、`required: true` かつ OpenAI steps ありで codex CLI がない場合、`specrunner doctor` 全体の exit code が 1 になる。この挙動は意図的か？ OpenAI 対応が optional feature であることを考えると `required: false`（warn レベル）の方が適切な可能性がある。design.md で判断を明記すること。

### F6 [low] — delta-spec に OPENAI_API_KEY チェックの要件が欠落

**場所**: delta-spec.md `dispatching-agent-runner` spec

request.md 要件13 に「`OPENAI_API_KEY` 環境変数が必要」とあり、DispatchingAgentRunner spec #6 にも throw 条件が書かれているが、delta-spec の `cli-config-store` Updated Spec に `OPENAI_API_KEY` の存在チェック要件（doctor or validateConfig）が含まれていない。doctor に OPENAI_API_KEY チェックを追加するか、DispatchingAgentRunner の lazy init で十分と判断するか明記すること。

---

## Checklist

| request.md 要件 | design.md | tasks.md | delta-spec.md | 状態 |
|---|---|---|---|---|
| 1. CodexAgentRunner 実装 | D1 | T4 | codex-runtime #1 | ✅ |
| 2. Codex SDK thread.run() | D1 | T4 | codex-runtime #1 | ✅ |
| 3. プロンプト構築 | D3 | T1, T4 | codex-runtime #2 | ✅ |
| 4. sandboxMode workspace-write | D2 | T4 | codex-runtime #3 | ✅ |
| 5. resultFilePath / finalResponse | D1 | T4 | codex-runtime #5 | ✅ |
| 6. FileChangeItem ロギング | D1 | T4 | codex-runtime #8 | ✅ |
| 7. Usage マッピング | D1 | T4 | codex-runtime #6 | ✅ |
| 8. AbortSignal タイムアウト | D1 | T4 | codex-runtime #7 | ✅ |
| 9. skipGitRepoCheck | D1 | T4 | codex-runtime #4 | ✅ |
| 10. config.models レジストリ | D5 | T2, T3 | cli-config-store | ✅ |
| 11. model → provider 解決 | D5 | T2, T5 | dispatching #2 | ✅ |
| 12. 未知モデル名エラー | D6 | T2, T3 | cli-config-store | ✅ |
| 13. managed + OpenAI reject | D6 | T3 | cli-config-store | ✅ |
| 14. DispatchingAgentRunner | D4 | T5 | dispatching #1-7 | ✅ |
| 15. LocalRuntime 変更 | D4 | T6 | dispatching #8 | ✅ |
| 16. doctor codex-cli check | D7 | T7, T8 | cli-commands | ✅ |

全要件がトレース可能。delta-spec は F6 を除き網羅的。

---

## Verdict Rationale

- F1 (critical): DoctorContext API との不一致は実装時に runtime error になる可能性がある
- F2 (high): レジストリの重複管理は保守リスクが高く、循環参照が実際には起きないため import に統一すべき
- F3-F6 は medium/low だが、F1+F2 だけで needs-fix に該当する
