# Spec: conformance needs-fix の戻り先 step 導出

## Requirements

### Requirement: conformance findings に戻り先分類 fixTarget を付与する

The system SHALL allow each conformance finding to carry an optional `fixTarget` of
`implementer | code-fixer | spec-fixer`, advertised only by the conformance report tool
(`CONFORMANCE_REPORT_TOOL`), and the conformance system prompt MUST instruct the agent how
to map a non-conformity's nature to a `fixTarget`. When `fixTarget` is omitted it MUST be
treated as `implementer`. Other judge steps (spec-review / code-review / request-review /
custom reviewers) MUST NOT advertise `fixTarget`.

#### Scenario: conformance report tool が fixTarget を受理する

**Given** conformance agent が `report_result` を `{ ok: true, findings: [{ severity: "high", resolution: "fixable", file: "x", title: "t", rationale: "r", fixTarget: "spec-fixer" }] }` で呼ぶ
**When** CLI が tool 入力を parse する
**Then** parse 結果の finding に `fixTarget: "spec-fixer"` が保持される

#### Scenario: fixTarget 省略は implementer 扱い

**Given** conformance finding が `fixTarget` を含まない
**When** CLI が戻り先導出のため fixTarget を解決する
**Then** その finding の戻り先は `implementer` として扱われる

#### Scenario: 他 judge step は fixTarget を広告しない

**Given** spec-review / code-review が使う report tool schema
**When** schema の findings 要素フィールドを検査する
**Then** `fixTarget` フィールドは含まれない

### Requirement: CLI が fixTarget から戻り先を集約導出する

The system SHALL derive the conformance needs-fix routing target on the CLI from the findings'
`fixTarget` values (not from any agent-declared verdict/outcome), aggregating multiple targets
by the priority `spec-fixer > implementer > code-fixer`, and the derived verdict MUST be one of
`approved`, `escalation`, `needs-fix:implementer`, `needs-fix:code-fixer`, `needs-fix:spec-fixer`.
The approved / escalation derivation MUST remain identical to `deriveJudgeVerdict`.

#### Scenario: 単一 fixTarget の戻り先導出

**Given** conformance が `ok: true` かつ needs-fix を惹起する high finding 1 件（`fixTarget: "spec-fixer"`）を返す
**When** CLI が `deriveConformanceVerdict` で verdict を導出する
**Then** verdict は `needs-fix:spec-fixer` になる

#### Scenario: 複数 fixTarget 混在時の優先則

**Given** needs-fix を惹起する findings が `fixTarget` で `code-fixer` と `spec-fixer` と `implementer` を混在させる
**When** CLI が verdict を導出する
**Then** verdict は `needs-fix:spec-fixer`（優先則 spec-fixer > implementer > code-fixer）になる

#### Scenario: fixTarget 全省略は needs-fix:implementer

**Given** needs-fix を惹起する findings がいずれも `fixTarget` を持たない
**When** CLI が verdict を導出する
**Then** verdict は `needs-fix:implementer` になる

#### Scenario: approved / escalation は据え置き

**Given** conformance findings に critical/high が無い（または decision-needed が 1 件以上、または ok=false）
**When** CLI が verdict を導出する
**Then** verdict はそれぞれ `approved` / `escalation` であり、`needs-fix:*` にはならない

### Requirement: 戻り先別の遷移を定義する

The system SHALL route conformance per its derived verdict: `needs-fix:implementer` → implementer,
`needs-fix:code-fixer` → code-fixer, `needs-fix:spec-fixer` → spec-fixer. The system SHALL retain a
transition for plain `needs-fix` routing to implementer for backward compatibility, and MUST NOT
define new successor transitions for the target steps (their existing transitions carry the
downstream flow).

#### Scenario: 3 方向の戻り先遷移

**Given** conformance が `needs-fix:implementer` / `needs-fix:code-fixer` / `needs-fix:spec-fixer` を返す
**When** pipeline が遷移表を引く
**Then** それぞれ implementer / code-fixer / spec-fixer へ遷移する

#### Scenario: 旧 plain needs-fix は implementer へ

**Given** conformance outcome が plain `needs-fix`（旧形式）
**When** pipeline が遷移表を引く
**Then** implementer へ遷移する（後方互換）

#### Scenario: 戻り先 step の後続は既存遷移が引き受ける

**Given** conformance が code-fixer / spec-fixer / implementer へ戻した
**When** その戻り先 step が完了する
**Then** code-fixer → conformance、spec-fixer → spec-review、implementer → verification の既存遷移で後続が進む（新設遷移なし）

### Requirement: 戻り先 step に conformance findings を注入する

The system SHALL inject the conformance findings into the context of the target step
(implementer / code-fixer / spec-fixer) when, and only when, that step is entered as the
conformance fix target, determined from job state by (a) the latest conformance verdict being
`needs-fix:<thisStep>` and (b) the latest conformance run being more recent than the step's
normal predecessor run. When entered from a normal predecessor (not conformance), the step MUST
continue to use its existing findings source.

#### Scenario: conformance 起点入場で conformance findings を注入する

**Given** 最新 conformance run の verdict が `needs-fix:code-fixer` で、conformance が code-fixer の直前 reviewer より新しく完了している
**When** code-fixer の初期メッセージを組み立てる
**Then** メッセージに conformance findings ブロックが含まれる

#### Scenario: reviewer 起点入場では conformance findings を注入しない

**Given** `conformance → spec-fixer → spec-review →（needs-fix）→ spec-fixer` の二巡目で、spec-review が conformance より新しく完了している
**When** spec-fixer の初期メッセージを組み立てる
**Then** メッセージは spec-review findings を使い、conformance findings は注入されない

#### Scenario: 通常の最初の実装では注入しない

**Given** conformance がまだ一度も走っていない（test-case-gen → implementer の初回実装）
**When** implementer の初期メッセージを組み立てる
**Then** conformance findings は注入されない

### Requirement: 単一収束予算で打ち切る

The system SHALL bound the conformance-fix retry loop solely by `CONFORMANCE_RETRIES_EXHAUSTED`
regardless of which of the three targets is routed to, and MUST NOT let the target step's loop
budget (spec-review / code-review) prematurely exhaust due to iteration counts carried over from
an earlier convergence episode. Conformance-originated entry into a fixer step SHALL start a fresh
convergence episode for that fixer and its paired review loop.

#### Scenario: code-fixer 経由でも conformance 予算で打ち切る

**Given** maxIterations 回連続で conformance が `needs-fix:code-fixer` を返す（code-fixer は毎回 approved 完了）
**When** pipeline が走る
**Then** ちょうど maxIterations 回の conformance 実行後に `CONFORMANCE_RETRIES_EXHAUSTED` で halt し、`CODE_REVIEW_RETRIES_EXHAUSTED` にはならない

#### Scenario: spec-fixer 経由でも conformance 予算で打ち切る

**Given** maxIterations 回連続で conformance が `needs-fix:spec-fixer` を返す（下流は毎回収束）
**When** pipeline が走る
**Then** `CONFORMANCE_RETRIES_EXHAUSTED` で halt し、`SPEC_REVIEW_RETRIES_EXHAUSTED` にはならない

#### Scenario: implementer 経由でも conformance 予算で打ち切る

**Given** maxIterations 回連続で conformance が `needs-fix:implementer` を返す（verification/code-review は毎回収束）
**When** pipeline が走る
**Then** `CONFORMANCE_RETRIES_EXHAUSTED` で halt する

#### Scenario: conformance 起点の fixer 入場で内側予算がリセットされる

**Given** code-review phase で code-fixer が既に maxIterations 回近く走った後、conformance が `needs-fix:code-fixer` を返す
**When** pipeline が code-fixer へ入場する
**Then** code-fixer の iteration 予算は fresh から数え直され、入場直後に exhaustion で halt しない

### Requirement: 旧形式 history の resume 後方互換

The system SHALL resume jobs whose persisted history contains a plain `needs-fix` conformance
outcome (pre-change format) without error, re-running conformance to derive a new
`needs-fix:<target>` verdict, and findings injection MUST degrade safely (no injection) when a
conformance run lacks the `fixTarget` form.

#### Scenario: 旧 needs-fix history の resume が成功する

**Given** 旧形式の conformance StepRun（verdict が plain `needs-fix`、toolResult に fixTarget なし）を含む state
**When** その state を resume する
**Then** resume はエラーにならず、conformance を再実行して `needs-fix:<target>` を新たに導出する

#### Scenario: fixTarget 不在の run では誤注入しない

**Given** 最新 conformance run の verdict が plain `needs-fix`（`needs-fix:<target>` 形でない）
**When** 戻り先 step が `getConformanceFixContext` を評価する
**Then** `null` を返し conformance findings を注入しない
