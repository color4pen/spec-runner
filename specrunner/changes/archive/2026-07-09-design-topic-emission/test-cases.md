# Test Cases: 設計層 topic 排出

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 23
- **Manual**: 1
- **Priority**: must: 13, should: 11, could: 0

---

### TC-001: decision-needed と origin:"scope" の finding が候補として収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL collect design-level findings across all step runs > Scenario: decision-needed and scope findings are collected

---

### TC-002: fixable のみの job では候補ゼロ・ファイル書き出しなし

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL collect design-level findings across all step runs > Scenario: fixable-only job yields no candidates

---

### TC-003: 同一 finding が複数 iteration に出ても 1 件に dedupe、最小 attempt を保持

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL collect design-level findings across all step runs > Scenario: duplicate findings are deduplicated deterministically

---

### TC-004: 代表入力から契約文法に一致する slug と id が生成される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL derive a deterministic, contract-conformant slug per finding > Scenario: slug matches the contract grammar

---

### TC-005: 生成ファイルが flat frontmatter・本文（title/rationale/severity/step/file）を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL write each topic as a flat-frontmatter markdown file > Scenario: emitted file has contract-conformant frontmatter and body

---

### TC-006: 対応する decision がある場合に「暫定裁定」節が出力される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL write each topic as a flat-frontmatter markdown file > Scenario: matching decision is rendered as a provisional ruling

---

### TC-007: 対応する decision がない場合に「暫定裁定」節は出力されない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL write each topic as a flat-frontmatter markdown file > Scenario: candidate without a matching decision omits the ruling section

---

### TC-008: 再 archive 時に既存 topic ファイルは上書きされず重複しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL be idempotent by skipping existing topic files > Scenario: re-archive does not overwrite or duplicate

---

### TC-009: 排出ファイルが archive commit に含まれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL stage emitted files independently of the mark-hook > Scenario: emitted topics are included in the archive commit

---

### TC-010: mark-hook がエラーでも topic emission は実行される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL stage emitted files independently of the mark-hook > Scenario: emission staging is independent of mark-hook outcome

---

### TC-011: designLayer.enabled=false で no-op

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL degrade to a no-op when disabled or when design/ is absent > Scenario: disabled design layer emits nothing

---

### TC-012: topicEmission=false で no-op

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL degrade to a no-op when disabled or when design/ is absent > Scenario: topicEmission=false emits nothing

---

### TC-013: design/ 不在で no-op（design/ ディレクトリを作成しない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL degrade to a no-op when disabled or when design/ is absent > Scenario: absent design/ emits nothing

---

### TC-014: design/ 存在・design/topics/ 不在なら topics/ を作成してファイルを書き出す

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL degrade to a no-op when disabled or when design/ is absent > Scenario: design/ present but design/topics/ absent creates the directory

---

### TC-015: topicEmission 未指定で resolveDesignLayerConfig が true を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The resolved design-layer config SHALL expose topicEmission with a default of true > Scenario: default resolves to true

---

### TC-016: topicEmission=false が resolver で保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The resolved design-layer config SHALL expose topicEmission with a default of true > Scenario: explicit false is preserved

---

### TC-017: job archive --with-merge 経路でも topic emission が走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Emission SHALL run on both archive paths and report a summary when it emits > Scenario: with-merge path emits topics

---

### TC-018: 新規書き出しがあれば summary 行を 1 行出力、0 件なら出力なし

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Emission SHALL run on both archive paths and report a summary when it emits > Scenario: summary line printed only when emission occurs

---

### TC-019: config schema が topicEmission に非 boolean を渡すと検証エラー

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a specrunner config object with `designLayer.topicEmission` set to a non-boolean value (e.g. `"yes"` or `1`)
**WHEN** the config validation schema is applied
**THEN** a validation error is returned indicating the value is not a valid boolean

---

### TC-020: typecheck が topicEmission 追加後も green（全 ResolvedDesignLayer リテラル更新）

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `topicEmission: boolean` が `ResolvedDesignLayer` に required フィールドとして追加されている
**WHEN** `resolveDesignLayerConfig`・`noopDesignLayer`（orchestrator.ts）・`disabledDesignLayer`（archive.ts）の 3 箇所すべてに `topicEmission` フィールドが追加されていることを確認し、`typecheck` を実行する
**THEN** TypeScript コンパイルエラーが 0 件で完了する

---

### TC-021: 特殊文字・大文字を含む入力でも contract 文法に一致する slug が生成される

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-02

**GIVEN** job-slug, step, iteration, index の組み合わせとして通常想定外の文字（大文字、アンダースコア、連続ハイフン等）が含まれる入力
**WHEN** `deriveTopicSlug` を呼ぶ
**THEN** 出力が `^[a-z0-9]+(-[a-z0-9]+)*$` に一致し、先頭・末尾にハイフンがなく、連続ハイフンが存在しない

---

### TC-022: writeFile 例外発生時に throw せず warning を stderr に出して継続する

**Category**: unit
**Priority**: should
**Source**: design.md > D8 / tasks.md > T-06 Acceptance Criteria

**GIVEN** `emitDesignTopics` が fake fs で駆動され、`fs.writeFile` が例外を throw するよう設定されている
**WHEN** `emitDesignTopics` を呼ぶ
**THEN** 関数は throw せずに `{ status: "skipped" }` または件数 0 で戻る
**AND** `stderrWrite` に warning が出力される
**AND** archive フローが継続可能な状態（例外伝播なし）である

---

### TC-023: git add 非 0 exit 時に throw せず warning を stderr に出して継続する

**Category**: unit
**Priority**: should
**Source**: design.md > D8 / tasks.md > T-06 Acceptance Criteria

**GIVEN** `emitDesignTopics` が fake spawn で駆動され、`git add` が非 0 exit code を返すよう設定されている
**WHEN** `emitDesignTopics` を呼ぶ
**THEN** 関数は throw せずに戻る
**AND** `stderrWrite` に warning が出力される
**AND** ファイル自体は worktree に書き出されている（ステージングされていないだけ）

---

### TC-024: step 名辞書順・attempt 昇順・index 昇順の決定的走査順で収集される

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** 複数の step（step 名が辞書順で異なる）を持つ job state で、各 step に複数の run（attempt 1, 2, ...）と複数の decision-needed finding（配列 index 0, 1, ...）が存在する
**WHEN** `collectTopicCandidates` を呼ぶ
**THEN** 返却される candidates は step 名の辞書昇順 → attempt 昇順 → finding index 昇順の順序になっている
**AND** 同一 step の同一 finding が複数 attempt に存在する場合、最小 attempt の candidate が採用される

---

## Result

```yaml
result: completed
total: 24
automated: 23
manual: 1
must: 13
should: 11
could: 0
blocked_reasons: []
```
