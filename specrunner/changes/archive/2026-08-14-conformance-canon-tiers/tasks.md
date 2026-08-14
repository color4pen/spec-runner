# Tasks: conformance の正典の二層化

## T-01: conformance system prompt を二層化する

`src/prompts/conformance-system.ts` の `CONFORMANCE_BASE` を編集する。5 節骨格
(Question / Contract / Method / Evidence / Completion) と共有定数
(`${EVIDENCE_DISCIPLINE}` / `${SEVERITY_DEFINITION}` / `${DECISION_NEEDED_DEFINITION}` /
`${EVIDENCE_COUNTS_DEFINITION}` / `${SPEC_EXEMPT_MARKER}`) は保持したまま、節内文面のみ書き換える。

- [x] `## Contract` の入力宣言を二層化する: request.md / spec.md を `規範（normative）`、
      design.md / tasks.md を `計画・根拠（plan / rationale）` と明記する (anchor A1a / A1b)。
      4 成果物名 (request.md / spec.md / design.md / tasks.md) はすべて残す。
- [x] `## Method` を書き換える:
      - request.md — 受け入れ基準の達成を `全件確認` (規範)。未達は finding。
      - spec.md — `${SPEC_EXEMPT_MARKER}` 判定は現行維持。非 exempt 時は全 Requirement (SHALL/MUST)
        と全 Scenario の充足を `全件確認` (規範)。未充足は finding。
      - design.md / tasks.md — 計画・根拠として読む。decision 不反映・tasks 相違・checkbox 未完了は
        `それ自体では finding にしない`。判定は「その相違が request/spec の意図・受け入れ基準・
        振る舞いを破るか」で行う。破る場合のみ finding とし、`finding の根拠には request.md / spec.md`
        の該当箇所を引く。破らない場合は相違を `non-blocking note` として evidence 報告本文に記録し、
        design/tasks の追随更新を促してよい (finding にはしない)。
- [x] routing 表 (現 L72-77) を二層整合の文面に書き換える。`fixTarget` トークンと 3 つの routing
      target (`spec-fixer` / `implementer` / `code-fixer`) は維持する。design/tasks との相違は
      request/spec 違反を伴う場合のみ finding であり、その finding の修正先を示す表として書く
      (例: 「request/spec 違反の根源が spec.md の誤り、または design.md の誤りにある → `spec-fixer`」)。
- [x] `## Evidence` の step 固有要求を二層に整合させる (規範充足の判定根拠 + 計画との相違の note を記録)。

**Acceptance Criteria**:
- `CONFORMANCE_SYSTEM_PROMPT` が anchor `規範（normative）` / `計画・根拠（plan / rationale）` /
  `それ自体では finding にしない` / `finding の根拠には request.md / spec.md` / `non-blocking note` /
  `全件確認` をすべて含む。
- `CONFORMANCE_SYSTEM_PROMPT` が引き続き `tasks.md` / `design.md` / `spec.md` / `request.md` /
  `fixTarget` / `spec-fixer` / `implementer` / `code-fixer` を含む (既存 TC-012 / TC-CONF-03 green)。
- 5 節見出し (`## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion`) が
  この順序で残り、`${EVIDENCE_DISCIPLINE}` / `${SEVERITY_DEFINITION}` が prompt に含まれる
  (drift-guard TC-001 / TC-004 / TC-015 green)。
- verdict 出力指示の禁止文字列 (drift-guard TC-016) を追加していない。`architecture/` を追加していない。

## T-02: report tool description の routing 説明を二層に整合させる

`src/core/step/report-tool.ts` の `CONFORMANCE_REPORT_TOOL.description` 内の fixTarget routing 説明
(`'spec-fixer' = spec/design artifact is wrong; ...`) を、二層と矛盾しない文面へ更新する。

- [x] routing 説明を「finding の修正先」の説明として書き直す。design/tasks との相違が request/spec
      違反を伴う場合のみ finding であり、その修正先を示す旨に整合させる。
- [x] `zodSchema` の `conformanceFindingSchema.fixTarget` enum
      (`implementer` / `code-fixer` / `spec-fixer`) は変更しない。
- [x] description 内に `fixTarget` トークンを残す。

**Acceptance Criteria**:
- `CONFORMANCE_REPORT_TOOL.description` が `fixTarget` を含む (TC-CONF-01 green)。
- `toJSONSchema(object(CONFORMANCE_REPORT_TOOL.zodSchema))` の文字列が `implementer` /
  `code-fixer` / `spec-fixer` を含む (fixTarget enum 不変)。
- `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` の schema は `fixTarget` を含まない (TC-CONF-02 green)。

## T-03: conformance initial message (buildMessage) を二層に整合させる

`src/core/step/conformance.ts` の `buildMessage` (現 L84-91) の手順から、完了性 gate 表現を外す。

- [x] 「verify all checkboxes are marked complete [x]」を、checkbox 状態を計画コンテキストとして
      note する旨 (完了性を gate 扱いしない) に緩める。
- [x] design decisions / Requirements / acceptance criteria を「note する」手順は維持する。
      規範 vs 計画の役割づけは system prompt が担うため、message には判定基準を書かない。

**Acceptance Criteria**:
- `buildMessage` が checkbox 全完了を conformance の合否 gate として要求する文面を含まない。
- 既存の他テストが無変更で green (buildMessage を pin するテストは存在しない)。

## T-04: 二層化を固定する新規テストを conformance.test.ts に追加する

`tests/unit/core/step/conformance.test.ts` に新規 describe ブロックを**追加**する
(既存 TC の書き換えはしない)。

- [x] 二層宣言 pin: `CONFORMANCE_SYSTEM_PROMPT` が `規範（normative）` と
      `計画・根拠（plan / rationale）` を含む。
- [x] 相違の非 finding 化 + 根拠 pin: `CONFORMANCE_SYSTEM_PROMPT` が
      `それ自体では finding にしない` と `finding の根拠には request.md / spec.md` と
      `non-blocking note` を含む。
- [x] 完了性維持 pin: `CONFORMANCE_SYSTEM_PROMPT` が `全件確認` を含み、`受け入れ基準` /
      `Requirement` / `Scenario` を参照する。
- [x] 機械意味論不変 pin: `toJSONSchema(object(CONFORMANCE_REPORT_TOOL.zodSchema))` の文字列が
      `implementer` / `code-fixer` / `spec-fixer` を含む (fixTarget enum の 3 値固定)。

**Acceptance Criteria**:
- 追加した各 assertion が実装 (T-01 / T-02) 完了後に green。
- 既存 TC-009〜TC-CONF-03 は無変更のまま green (design.md D7 の列挙どおり)。

## T-05: 検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green (新規 T-04 の assertion 含む、既存テストは無変更で green)。
- [x] `judge-verdict-conformance.test.ts` (機械意味論 pin) が無変更で green であることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- design.md D7 表に列挙した既存テストがすべて無変更で green。列挙外の既存テストも無変更で green。
