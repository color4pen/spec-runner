## 1. Delta Spec Format Rules の MODIFIED 補足指示追加

- [x] 1.1 `src/prompts/propose-system.ts` の Rule 2（107行目付近、「各 Requirement は少なくとも 1 つの `#### Scenario:` を含むこと」）の直後に、MODIFIED Requirements 専用の補足ルールを追加する。内容: 「MODIFIED Requirements にも最低 1 つの Scenario が必須である。Scenario は変更後の振る舞いを Given/When/Then 形式で具体的に記述すること。差分の説明文や変更概要ではなく、変更後のシステムの振る舞いを示すこと」
- [x] 1.2 119行目付近の MODIFIED の例示 `<変更後の本文 + Scenario>` を、`#### Scenario:` を含む具体的な Given/When/Then 形式の例に差し替える。例: `#### Scenario: <シナリオ名>` + `- **WHEN** <条件>` + `- **THEN** <期待結果>` の形式

## 2. Self-review checklist の強化

- [x] 2.1 `src/prompts/propose-system.ts` の Self-review checklist（129行目付近）に、MODIFIED を明示的に言及する項目を追加する。例: `- [ ] \`## MODIFIED Requirements\` 配下の各 Requirement にも \`#### Scenario:\` が存在し、変更後の振る舞いを Given/When/Then で記述している`

## 3. 検証

- [x] 3.1 `bun run typecheck` が green であることを確認
- [x] 3.2 `bun run test` が green であることを確認
