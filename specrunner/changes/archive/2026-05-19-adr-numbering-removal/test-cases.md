# Test Cases: ADR Numbering Removal

## Summary

ADR ファイル命名から連番 (`ADR-NNNN-`) を廃止し `{YYYY-MM-DD}-{slug}.md` 形式に変更する変更のテストシナリオ。変更箇所は prompt テキスト 1 ファイル・ADR ファイル rename 5 件・内部参照クリーンアップ 2 件・delta spec。

---

## TC-01: Prompt 命名規則が新形式に変更されている

- **Category**: prompt
- **Priority**: must
- **Source**: Requirement 1 / Task 1

**GIVEN** `src/prompts/adr-gen-system.ts` のファイル命名セクション (L46 付近) を読む  
**WHEN** ADR ファイルパスの命名規則文字列を確認する  
**THEN** `specrunner/adr/{YYYY-MM-DD}-{slug}.md` が含まれ、`ADR-{NNNN}` が含まれない

---

## TC-02: 採番ロジック (ls + max+1) が prompt から削除されている

- **Category**: prompt
- **Priority**: must
- **Source**: Requirement 2 / Task 1

**GIVEN** `src/prompts/adr-gen-system.ts` を読む  
**WHEN** 採番に関するキーワード (`NNNN`、`ls`、`max`、`0001`、`最大番号`) を検索する  
**THEN** マッチが 0 件である

---

## TC-03: YYYY-MM-DD と slug の説明行が残っている

- **Category**: prompt
- **Priority**: should
- **Source**: Task 1 注記 (L50 はそのまま残す)

**GIVEN** `src/prompts/adr-gen-system.ts` のファイル命名セクションを読む  
**WHEN** `YYYY-MM-DD` および `slug` の説明行を確認する  
**THEN** 両行が存在する（採番行だけが削除され、日付・slug の説明は保持されている）

---

## TC-04: 既存 ADR 5 件が新形式ファイル名で存在する

- **Category**: rename
- **Priority**: must
- **Source**: Requirement 3 / Task 2

**GIVEN** `specrunner/adr/` ディレクトリを確認する  
**WHEN** 新形式 `{YYYY-MM-DD}-{slug}.md` のファイル一覧を確認する  
**THEN** 以下 5 件がすべて存在する:
  - `2026-05-18-prompt-fragment-registry.md`
  - `2026-05-18-validation-rule-interface.md`
  - `2026-05-18-one-shot-query-wrapper.md`
  - `2026-05-19-baseline-header-consistency-check.md`
  - `2026-05-19-spec-review-baseline-pull-model.md`

---

## TC-05: 旧形式 (ADR-NNNN- prefix) ファイルが存在しない

- **Category**: rename
- **Priority**: must
- **Source**: Requirement 3 / Task 2

**GIVEN** `specrunner/adr/` ディレクトリを確認する  
**WHEN** `ADR-` で始まるファイルを検索する  
**THEN** 旧形式ファイルが 0 件である

---

## TC-06: git mv で履歴が保持されている (rename 検出)

- **Category**: rename
- **Priority**: should
- **Source**: design.md「git mv で履歴保持」

**GIVEN** リネーム後のファイルを対象に git log を実行する  
**WHEN** `git log --follow specrunner/adr/2026-05-18-prompt-fragment-registry.md` を確認する  
**THEN** 旧ファイル名時点のコミットが履歴に含まれる（rename として git が認識している）

---

## TC-07: specrunner/adr/ 配下に ADR-NNNN 参照が残っていない

- **Category**: cleanup
- **Priority**: must
- **Source**: Requirement 4 / Task 3 / 受け入れ基準

**GIVEN** `specrunner/adr/` 配下の全 .md ファイル  
**WHEN** `grep -rE 'ADR-[0-9]{4}' specrunner/adr/` を実行する  
**THEN** マッチが 0 件である

---

## TC-08: one-shot-query-wrapper.md の H1 から ADR-0001: が削除されている

- **Category**: cleanup
- **Priority**: must
- **Source**: Task 3 item 1 / design.md

**GIVEN** `specrunner/adr/2026-05-18-one-shot-query-wrapper.md` の L1 を読む  
**WHEN** H1 タイトル行を確認する  
**THEN** `ADR-0001:` prefix が削除され、`# queryOneShot を agent-runner と分離した独立関数として導入する` から始まる

---

## TC-09: baseline-header-consistency-check.md の H1 から ADR-0004: が削除されている

- **Category**: cleanup
- **Priority**: must
- **Source**: Task 3 item 2 / design.md

**GIVEN** `specrunner/adr/2026-05-19-baseline-header-consistency-check.md` の L1 を読む  
**WHEN** H1 タイトル行を確認する  
**THEN** `ADR-0004:` prefix が削除され、`# Baseline Header Consistency Check as Defense-in-Depth Layer in spec-merge` から始まる

---

## TC-10: archive/merged 配下のファイルが変更されていない

- **Category**: cleanup
- **Priority**: should
- **Source**: Requirement 4 スコープ制限「archive/merged は touch しない」

**GIVEN** `specrunner/changes/archive/` および `specrunner/requests/merged/` の内容  
**WHEN** git diff でこれらパス配下の変更を確認する  
**THEN** 変更されたファイルが 0 件である（歴史的参照は保持されている）

---

## TC-11: delta spec が正しいパスに存在する

- **Category**: spec
- **Priority**: must
- **Source**: Requirement 5

**GIVEN** `specrunner/changes/adr-numbering-removal/specs/adr-generation/spec.md` を読む  
**WHEN** ファイルの存在と内容を確認する  
**THEN** ファイルが存在し、`MODIFIED` セクションに Requirement `judge=yes produces an ADR file` が含まれる

---

## TC-12: delta spec の命名規則が新形式を示している

- **Category**: spec
- **Priority**: must
- **Source**: Requirement 5 / delta spec

**GIVEN** `specrunner/changes/adr-numbering-removal/specs/adr-generation/spec.md` を読む  
**WHEN** ADR ファイルパスの記述を確認する  
**THEN** `specrunner/adr/{YYYY-MM-DD}-{slug}.md` 形式が記述され、`ADR-{NNNN}` が含まれない

---

## TC-13: delta spec の Requirement header が baseline と一致する

- **Category**: spec
- **Priority**: must
- **Source**: Requirement 5 ⚠️ 規律「Requirement header は baseline の header と完全一致 MUST」

**GIVEN** baseline spec `specrunner/specs/adr-generation/spec.md` と delta spec を並べて確認する  
**WHEN** MODIFIED 配下の Requirement header 文字列を比較する  
**THEN** `judge=yes produces an ADR file` のヘッダー文字列が baseline と完全一致している

---

## TC-14: typecheck が green

- **Category**: build
- **Priority**: must
- **Source**: Requirement 6 / Task 4 / 受け入れ基準

**GIVEN** 全実装タスクが完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなしで終了する

---

## TC-15: テストが全 green

- **Category**: build
- **Priority**: must
- **Source**: Requirement 6 / Task 4 / 受け入れ基準

**GIVEN** 全実装タスクが完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する（ADR 命名固有テストは現状存在しないため、既存テスト群がすべて通過する）

---

## TC-16: adr-gen step が新形式パスで ADR を生成する

- **Category**: adr-output
- **Priority**: must
- **Source**: Requirement 1 / delta spec「judge=yes produces an ADR file」

**GIVEN** prompt 変更適用後に adr-gen step が judge=yes で実行される  
**WHEN** 生成された ADR ファイルのパスを確認する  
**THEN** `specrunner/adr/{YYYY-MM-DD}-{slug}.md` 形式であり、`ADR-NNNN-` prefix を含まない

---

## TC-17: 本 change 自身の ADR が新形式で生成される

- **Category**: adr-output
- **Priority**: must
- **Source**: 受け入れ基準「本 request 自身の ADR が新形式で生成される」

**GIVEN** 本 change (slug: `adr-numbering-removal`, date: `2026-05-19`) の adr-gen step が実行される  
**WHEN** 生成ファイル名を確認する  
**THEN** `specrunner/adr/2026-05-19-adr-numbering-removal.md` として生成される

---

## TC-18: 並列 finish で異なる slug の ADR がファイル名衝突しない

- **Category**: adr-output
- **Priority**: should
- **Source**: 背景「並列 finish 時の採番衝突問題の構造的解消」

**GIVEN** 同日 (同一 YYYY-MM-DD) に異なる slug を持つ 2 つの request が並列で finish する  
**WHEN** 両方が judge=yes で ADR を生成する  
**THEN** `{date}-{slug-a}.md` と `{date}-{slug-b}.md` は異なるファイル名となり衝突しない

---

## TC-19: 旧形式 ADR 採番の採番ロジックが動作しない (削除確認)

- **Category**: adr-output
- **Priority**: could
- **Source**: Requirement 2「採番手順を削除」

**GIVEN** prompt 変更適用後の adr-gen-system.ts を確認する  
**WHEN** `ls specrunner/adr/` を実行して最大番号を取得する手順の記述を探す  
**THEN** そのような手順が prompt 内に存在しない（agent が ls + max+1 を試みる余地がない）
