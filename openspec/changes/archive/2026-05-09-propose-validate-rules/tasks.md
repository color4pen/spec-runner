## 1. System Prompt にルールを追記

- [x] 1.1 `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` 内、「### ルール」セクション（L104-127）のルール 4 の後に以下 2 項目を追加する:
  - `5. **Requirement 本文（header 直後〜最初の Scenario の間）に英語の \`SHALL\` または \`MUST\` を少なくとも 1 つ含めること**（normative keyword なしは validation error）`
  - `6. **\`### Requirement:\` header と最初の \`#### Scenario:\` の間にコードブロック（\`\`\`）を挟まないこと**（コードブロックが入るとシナリオ紐付けが失敗する）`

## 2. Self-review checklist に対応項目を追加

- [x] 2.1 同ファイル内の「### Self-review checklist」セクション（L135-141）の末尾に以下 2 項目を追加する:
  - `- [ ] 各 Requirement 本文に英語の \`SHALL\` または \`MUST\` が含まれている`
  - `- [ ] \`### Requirement:\` header と最初の \`#### Scenario:\` の間にコードブロックがない`

## 3. 検証

- [x] 3.1 `bun run typecheck` が green であることを確認する
- [x] 3.2 `bun run test` が green であることを確認する
