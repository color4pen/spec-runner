# Spec: 保護正典への fixable finding の escalation routing

## Requirements

### Requirement: 判定層は書けない fixer への正典 fixable finding を escalation に倒す

verdict 導出関数（`deriveJudgeVerdict` / `deriveRegressionGateVerdict` / `deriveConformanceVerdict`）は、
正典集合と fixer 別書込可能集合（`CanonWriteScope`）を与えられたとき、`resolution === "fixable"` かつ
`finding.file` が保護正典に属し、その finding の実効 routing 先 fixer が当該 file を合法に書けない finding が
1 件でも存在する場合、verdict を `escalation`（conformance では非 target-qualified の `escalation`）として
SHALL 返す。実効 routing 先 fixer は、judge / regression-gate では常に code-fixer、conformance では
`finding.fixTarget ?? "implementer"` とする。`CanonWriteScope` が与えられない場合は現行挙動と同一で MUST ある。

#### Scenario: regression-gate の test-cases.md fixable finding は escalation

**Given** regression-gate の finding が `file = specrunner/changes/<slug>/test-cases.md`、
`resolution = fixable`、`fixTarget` は code-fixer または欠落
**When** `deriveRegressionGateVerdict(findings, ok=true, evidence, canonScope)` を評価する
**Then** 実効 fixer=code-fixer は test-cases.md を書けないため verdict は `escalation` を返す

#### Scenario: request.md への fixable finding は fixTarget によらず escalation

**Given** finding が `file = specrunner/changes/<slug>/request.md`、`resolution = fixable`
**When** いずれの verdict 関数を canonScope 付きで評価しても
**Then** request.md はどの fixer の宣言 write にも含まれないため verdict は `escalation` を返す

#### Scenario: 非正典 file への fixable finding は routing 不変

**Given** finding が `file = src/foo.ts`、`resolution = fixable`、severity は high
**When** 各 verdict 関数を canonScope 付きで評価する
**Then** verdict は canonScope 無しの場合と同一（judge/regression は `needs-fix`、conformance は
`needs-fix:${aggregateFixTarget}`）を返す

### Requirement: spec-fixer / implementer の合法な正典修正ルートを保存する

正典 file であっても、その finding の実効 routing 先 fixer が当該 file を合法に書ける場合、verdict は
escalation にせず現行の needs-fix routing を SHALL 維持する。spec-fixer は spec.md / design.md を、
implementer は tasks.md を合法に書けるものとして扱う（各 fixer の `writes()` 宣言を単一ソースとする）。

#### Scenario: spec.md への spec-fixer finding は needs-fix:spec-fixer のまま

**Given** conformance finding が `file = specrunner/changes/<slug>/spec.md`、`resolution = fixable`、
severity = high、`fixTarget = spec-fixer`
**When** `deriveConformanceVerdict(findings, ok=true, evidence, canonScope)` を評価する
**Then** spec-fixer は spec.md を合法に書けるため verdict は `needs-fix:spec-fixer` を返す

#### Scenario: tasks.md への implementer finding は needs-fix:implementer のまま

**Given** conformance finding が `file = specrunner/changes/<slug>/tasks.md`、`resolution = fixable`、
severity = high、`fixTarget = implementer`
**When** `deriveConformanceVerdict(findings, ok=true, evidence, canonScope)` を評価する
**Then** implementer は tasks.md を合法に書けるため verdict は `needs-fix:implementer` を返す

#### Scenario: tasks.md への code-fixer finding は escalation

**Given** conformance finding が `file = specrunner/changes/<slug>/tasks.md`、`resolution = fixable`、
severity = high、`fixTarget = code-fixer`
**When** `deriveConformanceVerdict(findings, ok=true, evidence, canonScope)` を評価する
**Then** code-fixer は tasks.md を書けないため verdict は `escalation` を返す

### Requirement: findings-ledger は書けない fixer に正典 finding を渡さない

`collectFindingsLedger` と `collectParallelFixerFindings` は、`CanonWriteScope` を与えられたとき、
実効 fixer=code-fixer が合法に書けない正典 fixable finding を出力集合から SHALL 除外する。除外された
finding は fixer prompt に MUST 届かない。除外の原因となった正典 finding を含む reviewer round / gate の
verdict は、判定層により `escalation` に SHALL 倒れる。

#### Scenario: 正典 finding を含む reviewer round の後、code-fixer は正典 finding を受領しない

**Given** ある reviewer member が `file = specrunner/changes/<slug>/test-cases.md`、`resolution = fixable`
の finding を報告した round
**When** coordinator が needs-fix を集約し `collectParallelFixerFindings(state, members, canonScope)` を
評価する、および member の verdict を canonScope 付きで導出する
**Then** code-fixer に渡る findings に正典 finding は含まれず、かつ当該 round の集約 verdict は `escalation`
になる

### Requirement: escalation reason は file / title と operator 適用の必要性を含む

canon 由来の escalation が発生したとき、システムは escalation の reason に、該当する各 finding の `file` と
`title`、および「fixer は write-scope により当該 file を修正できないため operator の適用が必要」である旨を
SHALL 含める。この reason は resume 時の resumePoint.reason として operator に MUST 提示される。

#### Scenario: reason に file・title・operator 適用の必要性が含まれる

**Given** `file = specrunner/changes/<slug>/test-cases.md`、`title = "Category 誤分類"` の正典 fixable finding
**When** `buildCanonEscalationReason([finding])` を評価する
**Then** 返る文字列は該当 file、title、および operator の適用が必要である旨を含む

#### Scenario: canon escalation は awaiting-resume に落ちる（failed でない）

**Given** sequential judge step が canon 由来で `escalation` verdict を返し `escalationReason` を持つ
**When** pipeline がその verdict を処理する
**Then** job は `awaiting-resume` に遷移し、resumePoint.reason に canon escalation の reason が設定される
（`CANON_FINDING_ESCALATION` は fatal error code ではない）
