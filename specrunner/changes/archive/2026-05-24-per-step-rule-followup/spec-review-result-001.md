# Spec Review Result

- **verdict**: needs-fix
- **slug**: per-step-rule-followup
- **reviewer**: spec-reviewer
- **date**: 2026-05-24

---

## Summary

request ↔ design ↔ tasks の整合性、spec files の delta 記法、セキュリティ観点を確認した。設計判断・受け入れ基準のカバレッジは良好だが、以下 2 件の修正が必要。

---

## Findings

### F-01 [needs-fix]: `claude-code-runtime/spec.md` に `## Removed` セクションがない

**対象ファイル**: `specrunner/changes/per-step-rule-followup/specs/claude-code-runtime/spec.md`

**問題**: baseline `specrunner/specs/claude-code-runtime/spec.md` には `followUpPrompt` (単数) を前提とした以下 3 つの requirement が存在する:

1. `ClaudeCodeRunner は followUpPrompt 指定時に 2 段実行する`
2. `ClaudeCodeRunner は作業 turn と follow turn の modelUsage を加算して session 総量とする`
3. `ClaudeCodeRunner は follow turn を既存 AbortController で timeout する`

delta spec が追加している `ClaudeCodeRunner は N 段 follow-up を実行する` はヘッダー名が一致しないため、spec merge ツールに ADDED として扱われる。その結果、旧 3 件が baseline に残存し、「2 段実行」と「N 段 follow-up」が並立する矛盾仕様になる。

**修正**: delta spec に `## Removed` セクションを追加し、上記 3 件を列挙する。

```markdown
## Removed

- "ClaudeCodeRunner は followUpPrompt 指定時に 2 段実行する"
- "ClaudeCodeRunner は作業 turn と follow turn の modelUsage を加算して session 総量とする"
- "ClaudeCodeRunner は follow turn を既存 AbortController で timeout する"
```

---

### F-02 [needs-fix]: `design.md` / `tasks.md` に ADR の具体 path が記載されている

**対象箇所**:
- `design.md` D10: `specrunner/adr/2026-05-24-per-step-rule-followup-n-stage.md`
- `tasks.md` T-10: `**File**: specrunner/adr/2026-05-24-per-step-rule-followup-n-stage.md (新規)`

**問題**: `rules.md` で明示的に禁止されている。

> ADR の具体的な path / ファイル名は adr-gen 以外の step で記載しない（design.md / tasks.md に ADR path を書かない）

さらに T-10 は implementer が ADR を直接生成するタスクとして記述されているが、ADR 生成は `adr-gen` step の責務であり、`request.md` に `adr: true` が設定されていれば pipeline が自動で adr-gen step を実行する。

**修正**:
- `design.md` D10 の具体 path (`specrunner/adr/2026-05-24-per-step-rule-followup-n-stage.md`) を削除し、ADR に盛り込む内容の記述のみに留める
- `tasks.md` T-10 を削除する (ADR 生成は adr-gen step が担う。T-10 の内容は adr-gen step への入力として design.md D10 に書かれていれば十分)

---

## Pass Checks

- **request ↔ design 整合**: 要件 R1–R11 すべてに design の対応 D が存在する ✅
- **design ↔ tasks 整合**: T-01〜T-09, T-11 が design の各モジュールをカバーしている ✅
- **受け入れ基準カバレッジ**: 9 件すべてに対応タスクがある ✅
- **agent-runner-port delta**: `## Removed` に "AgentRunContext は followUpPrompt を伝搬する" が正しく記載されている ✅
- **step-execution-architecture delta**: `## Removed` に "StepExecutor は followUpPrompt を AgentRunContext に転記する" が正しく記載されている ✅
- **managed-agent-runtime delta**: `## Removed` に旧 3 件が正しく記載されている ✅
- **delta 記法準拠**: 全 spec ファイルが `### Requirement:` / `#### Scenario:` / SHALL・MUST を持つ ✅
- **CLI step の rules 無視**: `runCliStep` が `runAgentStep` を経由しない構造で自然にフィルタされる設計 ✅
- **セキュリティ**: `stepName` は step 定義由来 (ユーザー入力でない) であり path traversal リスクなし。rule ファイルはプロジェクトオーナーが置くため prompt injection は信頼境界内 ✅
- **Codex delta spec なし**: `CodexThread.id` 型修正は型バグ修正であり、behavioral spec 変更に該当しないため delta spec 不要と判断 ✅
