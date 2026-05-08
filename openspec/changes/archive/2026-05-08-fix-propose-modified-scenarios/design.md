## Context

`src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` 内に Delta Spec Format Rules セクションがある。Rule 2（107行目）で「各 Requirement は少なくとも 1 つの Scenario を含むこと」と記述しているが、MODIFIED Requirements に対する明示的な指示がない。LLM は MODIFIED を「差分の説明」と解釈し、振る舞いを示すシナリオを省略する傾向がある。

119行目の例示も `<変更後の本文 + Scenario>` と曖昧で、具体的な Given/When/Then の例を示していない。

## Goals / Non-Goals

**Goals:**
- MODIFIED Requirements にもシナリオ必須であることをプロンプトで明示する
- Self-review checklist で MODIFIED のシナリオ欠落を commit 前に検出させる

**Non-Goals:**
- spec-review 側のチェック強化（別 request で対応）
- openspec validate のロジック変更（既に正しく検出している）
- REMOVED Requirements のシナリオ対応（削除なのでシナリオ不要）
- プロンプトの大規模リファクタリング

## Decisions

### D1: Rule 2 の直下に MODIFIED 固有の補足ルールを追加

Rule 2 の汎用ルールは維持し、その直下に MODIFIED 専用の補足説明を挿入する。

**理由**: 汎用ルールを消すと ADDED にも影響する。ルール番号を変えると既存の参照が壊れる可能性があるため、Rule 2 の補足として追加するのが最小変更。

### D2: MODIFIED の例示を具体化

119行目の `<変更後の本文 + Scenario>` を、`propose-system.ts` 内の既存シナリオフォーマットに合わせた具体例に差し替える。具体的には `#### Scenario: <シナリオ名>` + `- **WHEN** <条件>` + `- **THEN** <期待結果>` の形式を使用する。LLM は抽象的なプレースホルダーより具体例からパターンを学習する。

**理由**: 「Scenario を含むこと」とだけ書いてもプレースホルダー的な記述で済まされる。具体例があれば出力品質が安定する。フォーマットは `propose-system.ts` 内の既存記述（`- **WHEN** / - **THEN**`）に統一することで、tasks.md 1.2 との表記揺れを排除する。

### D3: Self-review checklist に MODIFIED 専用項目を追加

既存のチェック項目（「各 `### Requirement:` header の直下に `#### Scenario:` が少なくとも 1 つ存在する」）は維持し、MODIFIED を明示的に言及する項目を追加する。

**理由**: 汎用チェックでは ADDED に気を取られて MODIFIED を見落とす傾向がある。明示的な項目があれば self-review で検出しやすくなる。

## Risks / Trade-offs

- **[プロンプト修正は確率的]** → 効果検証は次回の MODIFIED を含む実パイプライン実行で確認。単体テストでは検証不可
- **[プロンプト長の増加]** → 数行の追加なので token 影響は無視できる
