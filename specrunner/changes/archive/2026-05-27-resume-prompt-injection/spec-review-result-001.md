# Spec Review Result: resume-prompt-injection

- **verdict**: approved
- **reviewer**: spec-review agent
- **date**: 2026-05-26

## Summary

設計・タスク・delta spec はいずれも整合しており、既存コードベースのパターンと一致している。
後方互換性・one-shot 消費メカニズム・データフローの分離はいずれも適切。
セキュリティ観点でも CLI ローカルツールとして妥当な設計。

承認するが、以下の 2 件を実装時の注意事項として記録する。

---

## Findings

### F-001: T-06 が managed adapter の二経路を明示していない（Low）

**場所**: `tasks.md` T-06 / `src/adapter/managed-agent/agent-runner.ts`

`ManagedAgentRunner` はメッセージ構築経路が 2 つある:

| 経路 | メソッド | メッセージ構築 |
|------|----------|--------------|
| design-style (SSE) | `streamWithPollingFallback` | `effectiveRequestContent`（`requestContent + projectContext`）を `sessionClient.streamEvents()` に渡す |
| polling-style | `preparePollingMessage` | `step.buildMessage()` → `initialMessage` を構築 |

T-06 は「メッセージ構築位置を確認し、`<resume-context>` セクションを同様に挿入する」とあるが、どちらの経路にも追加すべきかが明示されていない。

`design` ステップ（SSE 経路）で halt → resume するケースは稀だが仕様上ゼロではない。実装者が polling-style のみ更新して design-style を見落とす可能性がある。

**判断**: 設計の D2 フォーマット仕様は両経路に適用可能であり、実装者への確認依頼（「位置を確認し」）で代替可能。ブロッカーではないが実装レビュー時に両経路を確認すること。

---

### F-002: `--prompt-file` にファイルサイズ上限が未定義（Informational）

**場所**: `design.md` D1 / `tasks.md` T-09

`--prompt-file` は `fs.readFileSync(path, "utf-8")` でファイル全体を読み込む。サイズ制限が定義されていないため、巨大ファイルをそのままエージェントのプロンプトに注入できる。

ローカル CLI ツールでありユーザー自身がファイルを指定するため、脅威モデル上は問題なし。注意事項として記録するのみ。

---

## Security Assessment

| 観点 | 評価 |
|------|------|
| Prompt injection | ユーザー自身が `--prompt` 値を指定するローカル CLI。攻撃者とオペレーターが同一主体のため受容可能 |
| XML tag boundary | `<resume-context>` タグで注入テキストの境界を明示。エージェントが境界を認識できる |
| Path traversal (`--prompt-file`) | `path.resolve(process.cwd(), promptFile)` は絶対パスも受け付けるが、ローカル CLI では標準的な挙動 |
| Persistence | 注入テキストは state に保存されない。one-shot 消費で後続ステップには伝播しない |
| Backward compat | 全フィールドが optional。未指定時は既存動作と完全同一 |

---

## Design Correctness

- **データフロー**: CLI flag → `ResumeOptions.prompt` → `PrepareResult.resumePrompt` → `PipelineDeps.resumePrompt` → `AgentRunContext.resumePrompt` → adapter prompt の流れは一貫している
- **One-shot 消費**: `deps.resumePrompt = undefined` を `runAgentStep()` 内で実行する設計は正しい。CLI ステップ（verification 等）が先行する場合も `runCliStep` は `resumePrompt` を消費しないため、次の agent ステップが確実に最初の消費者になる
- **排他チェック**: `process.exit(2)` で終了する handler 層での排他チェックは既存パターンと一致
- **型安全性**: 全フィールドが optional であり、`PipelineRunCommand` が `resumePrompt` を設定しない設計は後方互換
- **delta spec**: `specrunner/changes/resume-prompt-injection/specs/cli-resume-command/spec.md` の 4 要件はいずれも request.md の受け入れ基準に対応し、シナリオ形式・MUST キーワードも規律に適合
