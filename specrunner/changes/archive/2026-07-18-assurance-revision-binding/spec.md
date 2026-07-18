# Spec: scenario / spec の凍結・承認を revision（commit OID）に束縛する

Layer-1 behaviors — 型 / FSM が自動強制しない、`deriveAchievedAssurance`（archive floor authority）の判定規律。
本 change は achieved-assurance-completeness（#850）が定めた 2 つの Requirement を **MODIFIED** する:
scenario 凍結の判定基準を「同一 commit 自己整合」から「確定 commit 跨ぎ比較」へ、specReview を「verdict のみ」から
「reviewed revision の content 束縛」へ。すべての次元は fail-closed（不能・欠落・不一致は当該 achieved フィールドを
absent とし、`satisfiesFloor` が constrained floor を落とす）。

## Requirements

### Requirement: testDerivation と biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob（MODIFIED）

`achieved.testDerivation = "frozen"` および `achieved.biteEvidence = "required"` の前提としての scenario 凍結を、
**確定 commit OID の blob 跨ぎ比較** で検証 MUST する。具体的には次のすべてを満たすときにのみ scenario 凍結成立と MUST する:

- `testCaseGenOid = state.steps["test-case-gen"] の最新 run の commitOid` が present。
- `state.request.slug` が解決可能。
- `readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md")` と `readFileAtCommit(finalHeadOid, "<slug>/test-cases.md")`
  がいずれも解決でき、両 blob の content hash が **一致**。

`testCaseGenOid` 欠落、slug 欠落、いずれかの `readFileAtCommit` が `unavailable`、または content hash 不一致のとき、
`testDerivation` と `biteEvidence` をいずれも absent と MUST する。scenario 凍結の判定に `events.jsonl` の lineage
frozen hash を MUST NOT 用いる（journal を後続 commit で書き換えても判定に影響しないこと）。materialized test blob の
freeze（`diffPathsBetweenCommits(baseOid, finalHeadOid, ...)`）は本 Requirement とは別の歯として存置 MUST する。
`test-cases.md` は archive 時に change フォルダが移動するため、確定 commit（active path）と `finalHeadOid`（archived path）で
full path が異なる。`<slug>/test-cases.md` の trailing suffix で両 commit を解決 MUST する。

#### Scenario: test-case-gen 確定 commit の後に test-cases.md を改竄（time-boundary）

**Given** test-case-gen 確定 commit の `test-cases.md` が S、後続 commit で `test-cases.md` が S' に変更され `finalHeadOid` に S'
**When** `biteEvidence: "required"` / `testDerivation: "frozen"` floor で `deriveAchievedAssurance` を実行する
**Then** `test-cases.md`@testCaseGenOid と @finalHeadOid の content hash が不一致となり、`achieved.testDerivation` と
`achieved.biteEvidence` はいずれも absent となって floor が fail-closed（`exitCode 1`）になる

#### Scenario: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）

**Given** `test-cases.md`@finalHeadOid が S' に改竄され、`events.jsonl`@finalHeadOid の lineage frozen hash も S' に合わせて
書き換えられている（test-case-gen 確定 commit は S のまま）
**When** `deriveAchievedAssurance` を実行する
**Then** commit-OID 束縛は `test-cases.md`@testCaseGenOid（S）と @finalHeadOid（S'）を比較して不一致を検出し、
`achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent（同一 commit 自己整合では通っていた反例を弾く）

#### Scenario: scenario が anchor から HEAD まで不変（positive）

**Given** test-case-gen 確定 commit から `finalHeadOid` まで `test-cases.md` が不変、blob freeze intact、base:red・HEAD:green、
forward type
**When** `biteEvidence: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** scenario 凍結成立と blob freeze intact により `achieved.testDerivation = "frozen"`、他条件成立で
`achieved.biteEvidence = "required"` となり floor を満たす

#### Scenario: testCaseGenOid 欠落 / test-cases.md 取得不能

**Given** `state.steps["test-case-gen"]` の最新 run に commitOid が無い、または `readFileAtCommit` が `test-cases.md` を
`unavailable` と返す
**When** `deriveAchievedAssurance` を実行する
**Then** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent（fail-closed）

### Requirement: specReview SHALL bind the approval to the reviewed revision blob（MODIFIED）

`achieved.specReview = "required"` は、**最新 spec-review run の `outcome.verdict === "approved"`** に加えて、
**承認した spec.md content の不変** を満たすときにのみ設定 MUST する。具体的には次のすべてを満たすとき:

- 最新 spec-review run の `outcome.verdict === "approved"`。
- `specReviewOid = state.steps["spec-review"] の最新 run の commitOid` が present。
- `state.request.slug` 解決可能、`finalHeadOid` 定義、runtime が `readFileAtCommit` を備える。
- `readFileAtCommit(specReviewOid, "<slug>/spec.md")` と `readFileAtCommit(finalHeadOid, "<slug>/spec.md")` がいずれも
  解決でき、両 blob の content hash が **一致**。

verdict が `approved` でない、`specReviewOid` 欠落、slug 欠落、`finalHeadOid` 未定義、runtime に `readFileAtCommit` が無い、
いずれかの `readFileAtCommit` が `unavailable`（spec.md 解決不能）、または content hash 不一致のとき、`specReview` を absent と
MUST する。spec-exempt type（`isSpecRequired` が false）であっても、この束縛を緩めては MUST NOT（floor が
`specReview:"required"` を要求する以上、spec.md を解決できない job は fail-closed が正）。この束縛の I/O は `floor.specReview`
が constrain するときにのみ実行 MAY する（無関係な job に spec.md I/O を課さない）。

#### Scenario: spec-review 確定 commit の後に spec.md を変更（time-boundary）

**Given** 最新 spec-review run の verdict が `approved`、その確定 commit の `spec.md` が SPEC、後続 commit で `spec.md` が変更され
`finalHeadOid` に反映
**When** `specReview: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `spec.md`@specReviewOid と @finalHeadOid の content hash が不一致となり、`achieved.specReview` は absent となって
floor が fail-closed になる

#### Scenario: spec.md が承認から HEAD まで不変（positive）

**Given** 最新 spec-review verdict が `approved`、`spec.md` が spec-review 確定 commit から `finalHeadOid` まで不変
**When** `specReview: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.specReview = "required"` となり当該 floor 次元を満たす

#### Scenario: specReviewOid 欠落 / spec.md 取得不能

**Given** 最新 spec-review verdict は `approved` だが commitOid が無い、または `readFileAtCommit` が `spec.md` を
`unavailable` と返す
**When** `specReview: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.specReview` は absent（fail-closed）
