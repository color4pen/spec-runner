# Test Cases: restore-design-md-instructions

## Summary

`src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` に含まれる `### design.md` セクションが、旧 openspec CLI 相当の構造指示（6 セクション構成・Alternatives considered・When to include 条件）を持つことを検証するシナリオ群。

---

## TC-01: 6 セクション構成の存在確認

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md T-01

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` 定数が定義されている  
**WHEN** `### design.md` セクションの内容を参照する  
**THEN**
- `Context` セクション名が存在する
- `Goals / Non-Goals` セクション名が存在する
- `Decisions` セクション名が存在する
- `Risks / Trade-offs` セクション名が存在する
- `Migration Plan` セクション名が存在する
- `Open Questions` セクション名が存在する
- 合計 6 セクションがすべて列挙されている

---

## TC-02: Alternatives considered 指示の存在確認

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 / architect findings HIGH-2

**GIVEN** `PROPOSE_SYSTEM_PROMPT` の `### design.md` セクションが更新されている  
**WHEN** Decisions セクションの記述ガイドラインを参照する  
**THEN**
- 「Alternatives considered」という文言が含まれている
- 各 Decision に対して「なぜ X であり Y でないか」という判断根拠の記述を求めていることが読み取れる

---

## TC-03: When to include 条件の存在確認

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 / architect findings HIGH-1

**GIVEN** `PROPOSE_SYSTEM_PROMPT` の `### design.md` セクションが更新されている  
**WHEN** design.md の作成条件（When to include）部分を参照する  
**THEN**
- 「複数モジュールにまたがる変更」または同等の条件が含まれている
- 「新しい外部依存」または同等の条件が含まれている
- セキュリティ・パフォーマンス・マイグレーションに関する複雑性条件が含まれている
- 「コーディング前に技術判断を明確化する価値がある」という主旨の条件が含まれている

---

## TC-04: 旧 4 行箇条書きの除去確認

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md T-01（lines 60-65 の置換）

**GIVEN** `src/prompts/propose-system.ts` の `### design.md` セクションが更新されている  
**WHEN** `PROPOSE_SYSTEM_PROMPT` の文字列内容を参照する  
**THEN**
- 旧来の「技術設計の核心（なぜこのアプローチか）を明記する」という行が存在しない
- 旧来の「実装判断（Design D1, D2, ...）を番号付きで記録する」という行が存在しない
- 旧来の「外部依存・制約・リスクを明示する」という行が存在しない
- 旧来の「実装コードを含めない（設計のみ）」という行が 4 行箇条書きの一部として残存しない

---

## TC-05: 実装コード禁止ガイドラインの保持

- **Category**: correctness
- **Priority**: should
- **Source**: request.md 要件（新テキストに「実装コードは含めない」が含まれる）

**GIVEN** `PROPOSE_SYSTEM_PROMPT` の `### design.md` セクションが更新されている  
**WHEN** セクション全体の文言を確認する  
**THEN**
- 「実装コードは含めない」あるいは同等の禁止ガイドラインが含まれている
- 「アーキテクチャとアプローチに集中する」という方向性が示されている

---

## TC-06: TypeScript 型チェックの通過

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 `bun run typecheck && bun run test` が green

**GIVEN** `src/prompts/propose-system.ts` の変更が保存されている  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- 型エラーが 0 件で終了する
- exit code が 0 である

---

## TC-07: 既存テストスイートの継続通過

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 `bun run typecheck && bun run test` が green

**GIVEN** `src/prompts/propose-system.ts` の変更が保存されている  
**WHEN** `bun run test` を実行する  
**THEN**
- 全テストケースが PASS する
- 回帰失敗が 0 件である

---

## TC-08: design.md ガイドライン以外の propose prompt が変更されていない

- **Category**: correctness
- **Priority**: should
- **Source**: request.md スコープ外（design.md 以外の artifact ガイドライン変更は行わない）

**GIVEN** `src/prompts/propose-system.ts` の差分を確認する  
**WHEN** `### design.md` セクション以外の変更箇所を検索する  
**THEN**
- `### tasks.md` セクションの内容は変更されていない
- Delta Spec Format Rules セクションの内容は変更されていない
- ワークフロー全体での位置づけ・役割・Artifact Checklist セクションは変更されていない

---

## TC-09: Decisions セクションの番号付け規約の保持

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md T-01（Decisions のガイドライン記述）

**GIVEN** `PROPOSE_SYSTEM_PROMPT` の `### design.md` の Decisions 記述が更新されている  
**WHEN** Decisions セクションの記述を参照する  
**THEN**
- `D1, D2, ...` という番号付け形式の指示が含まれている
- 各 Decision が個別の判断エントリとして記録されることが示されている
