# Test Cases: propose-validate-rules

## TC-01: SHALL/MUST ルールがシステムプロンプトに存在する [must]

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を参照する  
**WHEN** 「Delta Spec Format Rules」ルールセクションの内容を確認する  
**THEN** `SHALL` または `MUST` を含める旨のルール項目（ルール 5）が存在する

---

## TC-02: コードブロック禁止ルールがシステムプロンプトに存在する [must]

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を参照する  
**WHEN** 「Delta Spec Format Rules」ルールセクションの内容を確認する  
**THEN** `### Requirement:` header と最初の `#### Scenario:` の間にコードブロックを挟まない旨のルール項目（ルール 6）が存在する

---

## TC-03: SHALL/MUST チェック項目が Self-review checklist に存在する [must]

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を参照する  
**WHEN** 「Self-review checklist」セクションの内容を確認する  
**THEN** 「各 Requirement 本文に英語の `SHALL` または `MUST` が含まれている」チェック項目が存在する

---

## TC-04: コードブロック禁止チェック項目が Self-review checklist に存在する [must]

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を参照する  
**WHEN** 「Self-review checklist」セクションの内容を確認する  
**THEN** 「`### Requirement:` header と最初の `#### Scenario:` の間にコードブロックがない」チェック項目が存在する

---

## TC-05: 既存の Delta Spec Format Rules が損なわれていない [must]

**GIVEN** 変更前の `PROPOSE_SYSTEM_PROMPT` に存在していたルール 1〜4 を確認する  
**WHEN** 変更後のファイルの同セクションを確認する  
**THEN** ルール 1〜4 の内容が変更されていない（追記のみ）

---

## TC-06: 既存の Self-review checklist 項目が損なわれていない [must]

**GIVEN** 変更前の Self-review checklist に存在していた項目を確認する  
**WHEN** 変更後のファイルの同セクションを確認する  
**THEN** 既存のチェック項目がすべて残っている（追記のみ）

---

## TC-07: TypeScript 型チェックが通過する [must]

**GIVEN** `src/prompts/propose-system.ts` が変更されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく完了する（exit code 0）

---

## TC-08: テストスイートが通過する [must]

**GIVEN** `src/prompts/propose-system.ts` が変更されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS する（exit code 0）

---

## TC-09: ルール番号が連続している [should]

**GIVEN** 「Delta Spec Format Rules」セクションの番号付きリストを確認する  
**WHEN** ルール番号を順に確認する  
**THEN** 既存ルール（1〜4）に続いて 5, 6 と連番で追加されている（番号が飛んでいない）

---

## TC-10: 追加ルールが normative keyword の具体例を含む [should]

**GIVEN** ルール 5（SHALL/MUST）のテキストを確認する  
**WHEN** 説明文を読む  
**THEN** validation error になる理由（normative keyword なしは validation error になる旨）が説明されている
