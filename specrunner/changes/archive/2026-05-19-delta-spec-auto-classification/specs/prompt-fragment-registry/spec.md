# Delta Spec: prompt-fragment-registry update for new delta spec format

## MODIFIED Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される。個別 fragment file (`authority-spec-guard.ts` / `commit-discipline.ts` / `delta-spec-format.ts` / `pipeline-rules.ts`) は存在しない。

`AUTHORITY_SPEC_GUARD` は spec authority lifecycle の統一規律として 4 セクション (MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律) を含み、書く側 (implementer / design / spec-fixer / code-fixer) と見る側 (spec-review / code-review) の両方に共通の規律を提供する MUST。

`DELTA_SPEC_FORMAT` は新形式のセクションヘッダー (`## Requirements` / `## Removed` / `## Renamed`) を説明し、ADDED / MODIFIED の分類は tool が baseline 突合で決定する旨を明示する MUST。旧形式セクションヘッダー (`## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements`) の使用禁止を明記する MUST。

`AUTHORITY_SPEC_GUARD` の「書く側の規律」節は、`## Requirements` に変更/追加したい Requirement を書く指示と、ADDED / MODIFIED の判断は tool が行う旨を記載する MUST。`## Removed` / `## Renamed` の用途説明は維持する MUST。

#### Scenario: fragments.ts から 4 const を import できる
- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` を import する
- THEN 4 つすべてが non-empty string として取得できる

#### Scenario: AUTHORITY_SPEC_GUARD が 4 セクションを含む
- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 内容を検査する
- THEN "MUST NOT" / "正規経路" / "書く側の規律" / "見る側の規律" の 4 セクションヘッダーを含む

#### Scenario: DELTA_SPEC_FORMAT が新形式を説明する
- GIVEN `DELTA_SPEC_FORMAT` を import する
- WHEN 内容を検査する
- THEN `## Requirements` を含み、`## ADDED Requirements` を含まない

#### Scenario: AUTHORITY_SPEC_GUARD が旧形式の分類基準を含まない
- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 「書く側の規律」節を検査する
- THEN 旧形式の分類基準 (`**ADDED**: baseline に存在しない` / `**MODIFIED**: baseline に存在する`) を含まず、tool が分類する旨を記載している
