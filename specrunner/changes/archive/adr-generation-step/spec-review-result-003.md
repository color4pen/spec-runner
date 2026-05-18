# Spec Review Result: adr-generation-step (003)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-18

## Summary

Review 001/002 の全 6 件の指摘が解消されていることを確認した。delta spec 4 本は request.md・design.md・baseline specs と整合しており、実装パスに曖昧性はない。Low 2 件を観察事項として記録する。

---

## Previous Findings Resolution

### 001-F-01 [Critical → Resolved] cli-commands delta spec のアンカー不在

`## ADDED Requirements` ヘッダ + 導入文「以下を新規 Requirement として定義する」で統一済み。baseline に存在しない Requirement を ADDED として定義しており、spec-merge で問題なし。

### 001-F-02 / 002-F-02 [Medium → Resolved] ParsedRequest 型拡張の Requirement 配置

`specs/request-md-parser/spec.md` に 2 つの MODIFIED Requirements が分離されている。型拡張 (`adr: boolean`) は「request.md は YAML/Markdown ハイブリッド構造でパースされる」側に配置され、Scenario 付き。validation は「必須フィールドの欠落はエラーとなる」側。責務分離が正しい。

### 001-F-03 [Medium → Resolved] design.md D10 の自己矛盾

見出し `### D10: requiresCommit は false` で結論明確。検討経緯として整理済み。

### 001-F-04 [Low → Accepted] request.md「LLM コスト 0」記述

delta spec (adr-generation/spec.md) は「no-op 指示の短い message を送り」と正確に記述しており、仕様上の正確性は確保済み。request.md の表記 imprecision は実装に影響しない。

### 001-F-05 [Low → Resolved] AgentStepName scenario の full list

pipeline-orchestrator delta spec の Scenario に `"adr-gen"` を含む完全リスト (assignable 10 項目 + NOT assignable 3 項目) が記載済み。

### 002-F-06 [Medium → Resolved] request-generate-system.ts の delta spec 不在

tasks.md Task 7 に選択肢 B の根拠が明記されている。prompt の内部品質向上は delta spec 対象外、`adr` フィールドの構造・型・validation は `request-md-parser` spec で、scaffold 出力は `cli-commands` spec でカバー済み。判断として妥当。

---

## New Findings

### F-07 [Low] StepName union requirement に "adr-gen" の明示的追記がない

pipeline-orchestrator delta spec は AgentStepName requirement を MODIFIED して `"adr-gen"` を追加しているが、StepName union requirement (= 「StepName union includes implementation-layer steps」等) は MODIFIED していない。

コード上は `STEP_NAMES` object に `ADR_GEN` を追加する (tasks.md 2.2) ため StepName 型は自動拡張される。AgentStepName ⊂ StepName の包含関係から論理的整合性も維持される。spec-merge 後の baseline で StepName の列挙が 11 項目のまま残るが、authoritative source は `STEP_NAMES` object (コード) であり、spec 上の列挙は補助的記述。

**影響**: なし。実装もテストも問題ない。将来の spec 読者が混乱する可能性はあるが、adr-gen が AgentStepName に含まれることは明記されている。

### F-08 [Low] tasks.md と delta spec で requiresCommit の表記差異

tasks.md 3.2 は `requiresCommit: undefined (= false)` と記述。delta spec (adr-generation/spec.md) は `requiresCommit: false` と記述。実行時の挙動は同一 (falsy)。実装者は tasks.md の `undefined` に従えばよく、spec の「false」は振る舞い仕様として正確。

**影響**: なし。

---

## Cross-Validation

### Transition table 検証

baseline の全 27 行に対し、delta spec は以下の変更を適用:
- 置換: `code-review --approved→ pr-create` → `code-review --approved→ adr-gen` (1 行)
- 追加: `adr-gen --success→ pr-create`, `adr-gen --error→ escalate` (2 行)
- 合計 29 行。delta spec 記載の full table と一致。

### Baseline spec との整合

| Delta spec | Baseline Requirement | Operation | Status |
|---|---|---|---|
| adr-generation/spec.md | (新規) | ADDED | OK |
| pipeline-orchestrator/spec.md — transition table | Pipeline is Driven by a Declarative Transition Table | MODIFIED | OK |
| pipeline-orchestrator/spec.md — AgentStepName | AgentStepName accepts only agent-resident steps | MODIFIED | OK |
| request-md-parser/spec.md — validation | 必須フィールドの欠落はエラーとなる | MODIFIED | OK |
| request-md-parser/spec.md — type | YAML/Markdown ハイブリッド構造でパースされる | MODIFIED | OK |
| cli-commands/spec.md — scaffold | (新規) | ADDED | OK |

### Request.md 要件カバレッジ

| 要件 | Delta spec | Status |
|---|---|---|
| 1. parser adr 必須化 | request-md-parser | Covered |
| 2. generate prompt | tasks.md 注記 (delta spec 不要) | Justified |
| 3. template scaffold | cli-commands | Covered |
| 4. adr-gen step | adr-generation | Covered |
| 5. pipeline 構成 | pipeline-orchestrator | Covered |
| 6. AGENT_STEP_NAMES / STEP_NAMES | pipeline-orchestrator | Covered |
| 7. authority spec guard | 影響なし (prefix check) | N/A |
| 8. 判断材料収集 | adr-generation | Covered |
| 9. 番号採番 | adr-generation | Covered |
| 10. docs/architecture.md 削除 | tasks.md 9.1 | Covered |
| 11. spec authority | delta spec 自体 | Self-referential |
| 12. test | tasks.md 10.x | Covered |

---

## Security Review

前回 (001/002) の評価を維持する。本変更にセキュリティ上の懸念は検出されなかった。

- **入力検証**: `adr` フィールドは `true`/`false` の 2 値のみ受理。regex `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/` は短い固定パターンで ReDoS リスクなし
- **ファイル書き込み**: ADR 生成先は `specrunner/adr/` 固定 prefix。agent toolset sandboxing と同レベル。path traversal の新規 surface なし
- **認証/OWASP**: 外部 API / ネットワーク / ユーザー入力の新規 attack surface なし
- **情報漏洩**: ADR 内容は git commit されるため、リポジトリのアクセス制御に依存。新規リスクなし

---

## Known Design Debt

- `adr: false` 時の no-op agent session 起動 (= 将来 pipeline 層 skip mechanism で解消可能)
- cli-commands baseline spec に既存 scaffold 仕様全体の Requirement が存在しない (= 本変更の ADDED で `adr` 部分のみ解消)

---

## Verdict Rationale

review 001/002 の全指摘が解消済み。delta spec 4 本は baseline specs と正しく対応し、request.md の全要件をカバーしている。F-07/F-08 は Low で実装に影響しない。approved とする。
