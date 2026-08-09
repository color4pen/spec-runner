# Test Cases: custom reviewer に周回知識(前周 findings・operator 裁定)を注入する

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 31
- **Manual**: 0
- **Priority**: must: 24, should: 7, could: 0

---

## Group 1: deriveCustomReviewerPriorRound (T-03 / spec 要件1・要件2)

### TC-001: iteration ≥ 2 で前周 findings + 変更 file + 再指摘プロトコルが注入される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer は iteration ≥ 2 で前周 context block を user message に注入する > Scenario: iteration ≥ 2 で前周 findings + 変更 file + 再指摘プロトコルが注入される

### TC-002: iteration 1 では前周 context block を注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer は iteration ≥ 2 で前周 context block を user message に注入する > Scenario: iteration 1 では前周 context block を注入しない

### TC-003: 前周 findings が欠落しているとき block を省略する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 前周 context の導出失敗は block 全体を省略して続行する > Scenario: 前周 findings が欠落しているとき block を省略する

### TC-004: commit 変更 file の導出が失敗するとき block を省略する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 前周 context の導出失敗は block 全体を省略して続行する > Scenario: commit 変更 file の導出が失敗するとき block を省略する

### TC-005: deriveCustomReviewerPriorRound — runtimeStrategy が undefined で null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** custom reviewer が iteration 2 で、runtimeStrategy が undefined(管理ランタイム相当)
**WHEN** deriveCustomReviewerPriorRound を呼ぶ
**THEN** null を返し、throw しない

### TC-006: deriveCustomReviewerPriorRound — 前周 endedAt より後の code-fixer commit を union する

**Category**: unit
**Priority**: must
**Source**: design.md > D3

**GIVEN** custom reviewer の前周 endedAt = T1。code-fixer が T0 (T1 より前) と T2 (T1 より後) に commitOid を持つ
**WHEN** deriveCustomReviewerPriorRound を呼ぶ
**THEN** T2 の commit のみを union した changedFiles を返す (T0 の commit は含まない)

### TC-007: deriveCustomReviewerPriorRound — 複数の code-fixer commit を union する (重複除去)

**Category**: unit
**Priority**: must
**Source**: design.md > D3

**GIVEN** 前周以降に code-fixer が commitOid="oid1"(files=["a.ts","b.ts"]) と commitOid="oid2"(files=["b.ts","c.ts"]) の 2 回 commit を持つ
**WHEN** deriveCustomReviewerPriorRound を呼ぶ
**THEN** changedFiles は ["a.ts","b.ts","c.ts"] (union・重複除去済み) を返す

### TC-008: deriveCustomReviewerPriorRound — 1 件でも listCommitChangedFiles が失敗なら null (all-or-nothing)

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / D8

**GIVEN** 前周以降に 2 件の code-fixer commit があり、2 件目の listCommitChangedFiles が throw する
**WHEN** deriveCustomReviewerPriorRound を呼ぶ
**THEN** null を返し、throw しない (部分注入しない)

### TC-009: deriveCustomReviewerPriorRound — findings が空配列でも changedFiles があれば非 null を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D8

**GIVEN** 前周 reviewer の findings が空配列 (全 approve)。前周以降 code-fixer commit が存在する
**WHEN** deriveCustomReviewerPriorRound を呼ぶ
**THEN** `{ findings: [], changedFiles: [...] }` を返す (null でない)

### TC-010: deriveCustomReviewerPriorRound — 前周 reviewer StepRun が存在しない (iteration=2 相当だが runs 無し) で null

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** state.steps[reviewerName] が空配列または undefined で前周 endedAt を解決できない
**WHEN** iteration=2 で deriveCustomReviewerPriorRound を呼ぶ
**THEN** null を返し throw しない

---

## Group 2: buildCustomReviewerPriorRoundBlock (T-03)

### TC-011: buildCustomReviewerPriorRoundBlock — 出力が prior-round-context XML タグで囲まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** findings と changedFiles を持つ context を渡す
**WHEN** buildCustomReviewerPriorRoundBlock を呼ぶ
**THEN** 出力が `<prior-round-context>` で始まり `</prior-round-context>` で終わる

### TC-012: buildCustomReviewerPriorRoundBlock — findings の severity/resolution/file/title が展開される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** findings=[{severity:"high",resolution:"fixable",file:"src/auth.ts",title:"Missing guard"}], changedFiles=["src/auth.ts"]
**WHEN** buildCustomReviewerPriorRoundBlock を呼ぶ
**THEN** 出力に "high"・"fixable"・"src/auth.ts"・"Missing guard" が含まれる

### TC-013: buildCustomReviewerPriorRoundBlock — 再指摘プロトコル text を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** findings と changedFiles を持つ任意の context
**WHEN** buildCustomReviewerPriorRoundBlock を呼ぶ
**THEN** 出力に「Read で読み直す」「rationale」「全量列挙」に相当するプロトコル text が含まれる

### TC-014: buildCustomReviewerPriorRoundBlock — findings が空配列のとき「前周指摘なし」相当の文言を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** findings=[], changedFiles=["src/a.ts"]
**WHEN** buildCustomReviewerPriorRoundBlock を呼ぶ
**THEN** 出力に「前周指摘なし」相当の明示文言が含まれる

### TC-015: buildCustomReviewerPriorRoundBlock — changedFiles が空配列のとき「変更なし(machine-derived)」相当の文言を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** findings=[{...}], changedFiles=[]
**WHEN** buildCustomReviewerPriorRoundBlock を呼ぶ
**THEN** 出力に「変更なし」かつ machine-derived 相当の明示文言が含まれる

---

## Group 3: deriveOperatorAdjudicationContext / buildOperatorAdjudicationBlock (T-03)

### TC-016: 裁定記録が存在するとき裁定 block が注入される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 裁定と decisions ledger を custom reviewer round の prompt に注入する > Scenario: 裁定記録が存在するとき裁定 block が注入される

### TC-017: 裁定記録が無いとき裁定 block を注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 裁定と decisions ledger を custom reviewer round の prompt に注入する > Scenario: 裁定記録が無いとき裁定 block を注入しない

### TC-018: deriveOperatorAdjudicationContext — operatorAdjudications のみ存在・decisions 空 → 非 null

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** state.operatorAdjudications=[{text:"X",step:"security",recordedAt:"..."}], state.decisions=[]
**WHEN** deriveOperatorAdjudicationContext(state) を呼ぶ
**THEN** `{ adjudications:[...], decisions:[] }` を返す (null でない)

### TC-019: deriveOperatorAdjudicationContext — decisions のみ存在・operatorAdjudications 空 → 非 null

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** state.operatorAdjudications=[], state.decisions=[{...}]
**WHEN** deriveOperatorAdjudicationContext(state) を呼ぶ
**THEN** `{ adjudications:[], decisions:[...] }` を返す (null でない)

### TC-020: buildOperatorAdjudicationBlock — operator-adjudication XML タグで囲まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** adjudications=[{text:"do not revert auth",step:"security",recordedAt:"..."}], decisions=[]
**WHEN** buildOperatorAdjudicationBlock を呼ぶ
**THEN** 出力が `<operator-adjudication>` で始まり `</operator-adjudication>` で終わる

### TC-021: buildOperatorAdjudicationBlock — 反論プロトコル text を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** adjudications または decisions が 1 件以上の context
**WHEN** buildOperatorAdjudicationBlock を呼ぶ
**THEN** 出力に「反論」「rationale」相当のプロトコル text が含まれる

### TC-022: buildOperatorAdjudicationBlock — operator 自由記述の XML 特殊文字をエスケープする

**Category**: unit
**Priority**: must
**Source**: design.md > Risks / Trade-offs (XML injection)

**GIVEN** adjudications=[{text:"use <b>bold</b> & test > 0",step:"s",recordedAt:"..."}]
**WHEN** buildOperatorAdjudicationBlock を呼ぶ
**THEN** 出力に `&lt;b&gt;bold&lt;/b&gt; &amp; test &gt; 0` が含まれ、`<b>` が生で出力されない

### TC-023: iteration 1 かつ decisions が存在するとき前周 context block は注入されないが裁定 block は注入される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: operator 裁定と decisions ledger を custom reviewer round の prompt に注入する > Scenario: iteration 1 かつ decisions が存在するとき前周 context block は注入されないが裁定 block は注入される

---

## Group 4: JobState OperatorAdjudication 永続化基盤 (T-01)

### TC-024: --prompt 付き resume で裁定記録が state に追加される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job resume --prompt の内容を operator 裁定として JobState に永続化する > Scenario: --prompt 付き resume で裁定記録が state に追加される

### TC-025: --prompt 無しの resume では裁定記録を追加しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job resume --prompt の内容を operator 裁定として JobState に永続化する > Scenario: --prompt 無しの resume では裁定記録を追加しない

### TC-026: appendOperatorAdjudication — 既存 state を変更せず新 state を返す (immutable)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** state.operatorAdjudications が 1 件を持つ既存 state
**WHEN** appendOperatorAdjudication(state, {text:"Y",step:"sec",recordedAt:"..."}) を呼ぶ
**THEN** 戻り値の operatorAdjudications が 2 件になる。元の state は変更されない

### TC-027: appendOperatorAdjudication — operatorAdjudications 不在の state に 1 要素配列を作る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** state.operatorAdjudications が undefined (フィールド不在)
**WHEN** appendOperatorAdjudication(state, record) を呼ぶ
**THEN** 戻り値の operatorAdjudications が [record] の 1 件配列になる

### TC-028: validateJobState — operatorAdjudications を含む state が round-trip する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** operatorAdjudications=[{text:"T",step:"s",recordedAt:"2026-01-01T00:00:00Z"}] を持つ raw JSON
**WHEN** JSON.stringify → JSON.parse → validateJobState を通す
**THEN** 同じ値が保持される。エラーは投げない

### TC-029: validateJobState — 不正な operatorAdjudications で throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** operatorAdjudications が非配列(文字列)、または entry の必須フィールド(text/step/recordedAt)が欠落した raw
**WHEN** validateJobState(raw) を呼ぶ
**THEN** エラーを throw する

### TC-030: validateJobState — operatorAdjudications 不在の legacy state を受理する (backward compat)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** operatorAdjudications フィールドを持たない既存 state の raw JSON
**WHEN** validateJobState(raw) を呼ぶ
**THEN** エラーを throw しない (backward compat)

---

## Group 5: typecheck && test が green (gate)

### TC-031: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

`bun run typecheck && bun run test` が全件 pass すること。verification フェーズ(typecheck + test コマンド)で充足を確認する。

---

## Result

```yaml
result: completed
total: 31
automated: 31
manual: 0
must: 24
should: 7
could: 0
blocked_reasons: []
```
