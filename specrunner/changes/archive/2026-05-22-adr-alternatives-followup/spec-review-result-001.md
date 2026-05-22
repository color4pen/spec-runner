# Spec Review Result

- **verdict**: approved
- **change**: adr-alternatives-followup
- **type**: spec-change

---

## Summary

`getFollowUpPrompt` optional method を `AgentStep` に追加し、`AdrGenStep` が `adr: true` のときのみ Alternatives Considered の self-fix prompt を発火する設計。スコープが明確で、既存の `getMaxTurns` パターンと対称な実装になっている。

---

## Findings

### 1. delta spec format — OK

- `delta-spec-validation-result.md` が `approved` ✓
- 両 delta spec とも `## Requirements` + `### Requirement:` + `#### Scenario:` の正規構造 ✓
- 各 Requirement に SHALL を含む ✓
- コードブロックは `### Requirement:` と `#### Scenario:` の間に挟まれていない ✓

### 2. MODIFIED requirement の扱い — OK

`specs/step-execution-architecture/spec.md` の第2 Requirement `StepExecutor は followUpPrompt を AgentRunContext に転記する` は baseline に同名 Requirement が存在する (baseline L733)。delta は `getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` の解決ロジックを追記した MODIFIED として正しく機能する。

### 3. `??` operator のセマンティクス — OK

`getFollowUpPrompt` が `undefined` を返す場合 `?? step.followUpPrompt` にフォールバックする。`AdrGenStep` は静的 `followUpPrompt` を持たないため、`adr: false` のとき `undefined ?? undefined = undefined` → follow 不発火。設計の意図と実装の一致を確認。

### 4. `adr: false` 誤生成防止 — OK

- `getFollowUpPrompt` が `undefined` を返す → `shouldRunFollowUp` が false → follow turn 不発火
- 既存の no-op message パス (adr-gen.ts:34,49) は改修なし
- adr-generation delta spec Scenario「adr: false のとき followUpPrompt は undefined」で検証される ✓

### 5. follow-prompt 文面の「確認」語 — 許容範囲

D3 テキストに「存在するか」という語が含まれる。ただし、これは「read → check → fix」フローの diagnostic step であり、gate 的な終端判断 ("判定せよ") ではない。step 3 の「既に十分であれば変更せず end_turn」と組み合わせると、全体は action-oriented に保たれる。adr-generation spec のシナリオ「「判定せよ」「存在するか判定」等の検出ゲート的表現は含まれない」が実装時の negative test として機能する。

### 6. 受け入れ基準の網羅 — OK

| 基準 | 対応 spec |
|------|-----------|
| AdrGenStep に followUpPrompt が設定される | adr-generation: Req 1 |
| follow-prompt は修正を指示し判定を指示しない | adr-generation: Req 1, Scenario 2 |
| follow-prompt は `adr: true` のみ発火 | adr-generation: Req 2 |
| `adr: false` で ADR 生成されない | adr-generation: Req 2, Scenario 2 |
| 機械 validator / 新ステップなし | スコープ外に明記 |
| typecheck & test green | tasks Task 5 |

### 7. セキュリティ — 問題なし

- follow-prompt は定数文字列 (ADR_FOLLOWUP_PROMPT)、ユーザー入力を含まない → prompt injection リスクなし
- `adr` flag は request.md パーサー経由 — 新規コードに追加の入力検証経路なし
- 認証・DB・OWASP Top 10 に関連する変更なし

### 8. tasks との整合 — OK

- Task 1: types.ts への optional method 追加 → step-execution-architecture delta spec Req 1
- Task 2: executor 1行変更 → step-execution-architecture delta spec Req 2
- Task 3: AdrGenStep 実装 → adr-generation delta spec Req 1, 2
- Task 4: unit test → adr-generation spec の全シナリオをカバー
- Task 5: typecheck & test — 受け入れ基準と直結

---

## Observations (non-blocking)

- **Task 4**: adr-generation delta spec の Scenario「adr: false の request で ADR が生成されない」は integration-level の振る舞いを含む。unit test で `getFollowUpPrompt` が `undefined` を返すことを確認すれば十分だが、既存の adr-gen integration test がある場合はそちらでも確認できると望ましい。
- **D3 prompt text**: `### Alternative N: {Name}` という具体的なフォーマット指示が含まれる。baseline adr-gen-system.ts の ADR template と整合しているか、implementer が確認すること。

---

## Verdict Rationale

設計判断は明快で、スコープは最小限に抑えられている。delta spec は format 規律を満たし、acceptance criteria との traceability が確認できる。blocking な問題はない。
