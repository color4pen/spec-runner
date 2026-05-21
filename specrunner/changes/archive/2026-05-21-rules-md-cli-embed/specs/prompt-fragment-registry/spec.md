## Requirements

### Requirement: rules.md の存在と構造的保証

rules.md content の source of truth は `src/prompts/rules.ts` の `RULES_MD_CONTENT` string constant である MUST。CLI は worktree setup 時に `RULES_MD_CONTENT` を `fs.writeFile` で `specrunner/changes/<slug>/rules.md` に配置する MUST。

`specrunner/rules.md` ファイルは repo に存在しない MUST（source of truth は CLI コードに一本化）。

rules.md content はパイプライン規律として以下のセクションを含む MUST:

- System Context（pipeline 構成）
- 思想原則
- 責任範囲（step × 領域テーブル）
- System Facts（正規 path 一覧）
- ADR 配置の特記（業界慣習 MADR 不採用の明示）
- spec authority lifecycle
- delta spec 記法

#### Scenario: rules.md content が ADR 配置規律を含む

- GIVEN `RULES_MD_CONTENT` が `src/prompts/rules.ts` から export されている
- WHEN 内容を検査する
- THEN 「ADR 配置の特記」セクションが存在し、「業界慣習 MADR」「採用しない」「adr-gen 以外」のキーワードを含む

#### Scenario: rules.md content が正規 ADR path を含む

- GIVEN `RULES_MD_CONTENT` が `src/prompts/rules.ts` から export されている
- WHEN 内容を検査する
- THEN `specrunner/adr/` を含む正規 path 文字列が存在する
