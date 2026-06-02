# Design: test-cases-from-spec-scenarios

## Context

test-case-gen step は現在 `design.md` / `tasks.md` から testable behaviors を抽出して `test-cases.md` を生成している。delta spec の Scenario（given/when/then）は参照されておらず、spec の受け入れ条件と test case が構造的に紐づいていない。

変更対象は 3 ファイル:

| ファイル | 役割 |
|----------|------|
| `src/prompts/test-case-gen-system.ts` | system prompt + initial message builder |
| `src/templates/step-output-templates.ts` | `TEST_CASES_TEMPLATE` の Source フィールド説明 |
| `tests/prompts/test-case-gen-system.test.ts` | prompt 内容のテスト |

pipeline の step 定義（`src/core/step/test-case-gen.ts`）や step output template の配置ロジックには変更なし。test-case-gen agent は既に Read tool で change folder 内のファイルを読める。delta spec は `specrunner/changes/<slug>/specs/<capability>/spec.md` に配置されており、agent が Read tool で参照可能。

## Goals / Non-Goals

**Goals**:

- test-case-gen の system prompt を delta spec Scenario primary に書き換える
- Source フィールドの参照先を `design.md or tasks.md section` から `specs/<cap>/spec.md > Requirement > Scenario` に変更する
- initial message の手順に delta spec 読み取りを追加する
- delta spec 不在時は design.md / tasks.md フォールバックを維持する（後方互換）

**Non-Goals**:

- test-case-gen の step 定義や pipeline 遷移の変更
- Source フィールドの機械的バリデーション（将来 change）
- verification step の test-coverage ロジック変更（TC ID grep は Source に依存しない）

## Decisions

### D1: prompt 内テキスト変更のみ、step 定義・pipeline は不変

**決定**: `test-case-gen-system.ts` の prompt テキストと `step-output-templates.ts` の template テキストのみ変更する。`test-case-gen.ts`（step 定義）や `pipeline.ts` は変更しない。

**根拠**: test-case-gen agent は既に Read tool で worktree 内の任意ファイルを読める。delta spec の読み取りは prompt の指示で完結し、step 定義への新しい入力パスや依存注入は不要。

**代替案**: delta spec content を buildMessage で読み取り initial message に埋め込む → 却下（agent は Read tool で読めるため不要。message が肥大化し、slug ごとの capability 数が不定のため事前読み取りが複雑になる）。

### D2: Source フィールド形式を `specs/<cap>/spec.md > Requirement: <name> > Scenario: <name>` とする

**決定**: Source フィールドのフォーマットを `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` とする。パス区切りに `>` を使い、人間が辿れる breadcrumb 形式にする。

**根拠**: Source フィールドは現状 machine-parsed されておらず（verification step は TC ID のみ grep）、人間の tracability が主目的。`>` 区切りは Markdown 内で自然に読め、既存の `design.md > section` 形式と一貫性がある。

**代替案**: `Scenario: <name> (specs/<cap>/spec.md)` 形式 → 却下（breadcrumb 順序が逆で辿りにくい）。

### D3: delta spec 不在時は design.md / tasks.md フォールバック

**決定**: system prompt に「delta spec が存在しない場合は design.md / tasks.md から抽出」のフォールバック指示を記載する。

**根拠**: 全ての change が delta spec を持つわけではない（bug-fix type など）。後方互換を維持し、delta spec なしの change でも test-case-gen が動作する必要がある。

**代替案**: delta spec 必須にして不在時は step を fail → 却下（bug-fix 等で spec 不要な change が存在する）。

### D4: Testable Behaviors Extraction セクションを Scenario 起点に書き換え

**決定**: system prompt の `Testable Behaviors Extraction` セクションを「delta spec の Scenario から test case を導出する」に書き換える。現行の 4 次元抽出（Domain Logic / API Contracts / Data Integrity / Edge Cases）は supplementary context として design.md / tasks.md からの追加 test case を実装段で足す際のガイドとして残すが、primary source は Scenario とする。

**根拠**: request の核心要件。Scenario が acceptance test の source になることで spec = claim、test = proof の対応が成立する。

### D5: Coverage Requirements セクションを Scenario 起点に書き換え

**決定**: `Coverage Requirements` セクションの「Every task in tasks.md must have at least one must scenario」を「Every Scenario in delta spec must have at least one test case」に変更する。

**根拠**: test case の網羅基準を tasks.md の task 単位から delta spec の Scenario 単位に移行する。Scenario が acceptance test の正典である以上、coverage の基準も Scenario に合わせる。

## Risks / Trade-offs

**[Risk]** prompt 変更により既存の test-case-gen 出力品質が変わる → **Mitigation**: delta spec 不在時のフォールバックで後方互換を維持。dogfood run で品質確認。

**[Risk]** agent が delta spec の Scenario を正しくパースできない → **Mitigation**: Scenario は `#### Scenario:` ヘッダ + `**Given**/**When**/**Then**` の定型構造で、agent が Markdown として読み取るだけで十分。

## Open Questions

なし。
