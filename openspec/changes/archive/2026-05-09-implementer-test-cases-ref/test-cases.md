# Test Cases: implementer-test-cases-ref

## TC-001: test-cases.md 読み込み指示の存在確認
**Priority**: must

**GIVEN** `src/prompts/implementer-system.ts` を読み込んだとき  
**WHEN** prompt 文字列の内容を検査する  
**THEN** `test-cases.md` への言及（読み込み指示）が含まれている

---

## TC-002: test-cases.md が存在する場合の読み込み条件
**Priority**: must

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** test-cases.md に関する指示の条件節を確認する  
**THEN** 「存在する場合」または同等の条件付きで読み込むよう指示されている

---

## TC-003: must シナリオの全実装義務が明示されている
**Priority**: must

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** TDD / テスト実装に関する指示を確認する  
**THEN** must シナリオを全実装することが義務として明示されている

---

## TC-004: GIVEN/WHEN/THEN からテストコードへの変換方針が含まれている
**Priority**: must

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** テスト実装の手順を確認する  
**THEN** GIVEN/WHEN/THEN 形式をテストコードに変換する旨が記載されている

---

## TC-005: test_cases_skipped 報告フォーマットが定義されている
**Priority**: must

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** 未実装ケースの報告に関する指示を確認する  
**THEN** `test_cases_skipped` キーワードと `[TC-ID — 理由]` 形式が含まれている

---

## TC-006: test-cases.md 非存在時のフォールバックが記載されている
**Priority**: must

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** test-cases.md が存在しない場合の指示を確認する  
**THEN** 「test-cases.md が存在しない場合は tasks.md ベースで TDD を行う」旨が明記されている

---

## TC-007: test-cases.md 読み込み指示の配置がステップ 1 のコンテキスト読み込みに統合されている
**Priority**: should

**GIVEN** implementer の system prompt の「実装手順」セクションを読み込んだとき  
**WHEN** ステップ 1 の内容を確認する  
**THEN** test-cases.md の読み込みがステップ 1（コンテキスト読み込みフェーズ）に含まれている

---

## TC-008: typecheck が green
**Priority**: must

**GIVEN** `src/prompts/implementer-system.ts` を変更した後  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件でコマンドが正常終了する

---

## TC-009: テストスイートが green
**Priority**: must

**GIVEN** `src/prompts/implementer-system.ts` を変更した後  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS し、新たな失敗が発生しない

---

## TC-010: commit message への test_cases_skipped 記載指示
**Priority**: should

**GIVEN** implementer の system prompt を読み込んだとき  
**WHEN** 未実装ケースの報告方法を確認する  
**THEN** `test_cases_skipped` を commit message に含めるよう指示されている
