# Spec: achieved-assurance の達成判定を完成させる

Layer-1 behaviors — 型 / FSM が自動強制しない、`deriveAchievedAssurance`（archive floor authority）の
判定規律。すべての次元は fail-closed（不能・欠落・不一致は当該 achieved フィールドを absent とし、
`satisfiesFloor` が constrained floor を落とす）。

## Requirements

### Requirement: biteEvidence SHALL require a measured HEAD-green at the final archive HEAD

`deriveAchievedAssurance` は `achieved.biteEvidence = "required"` を、base-red の確立に加えて、
**同一の凍結された materialized test 群を `finalHeadOid` で `runTestsAtCommit` 実行し、`kind:"ran"` かつ
全 file が `passed === true` かつ結果欠落なし（base-red と対称の完全被覆）**を機械観測したときにのみ
設定 SHALL する。HEAD 実行が `unavailable`、いずれかの file が red、または materialized test の
いずれかに green 結果が対応しないとき、`biteEvidence` は absent と MUST する。CI-wait は追加防御として
残るが、HEAD-green の provenance 代用に MUST NOT 用いる。

#### Scenario: base-red だが HEAD で依然 red

**Given** materialized test が base で全 red、base→finalHeadOid で不変
**And** `runTestsAtCommit(finalHeadOid, ...)` が少なくとも 1 file について `passed === false` を返す
**When** `biteEvidence: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.biteEvidence` は absent となり floor が fail-closed（`exitCode 1`）になる

#### Scenario: base-red かつ HEAD-green（同一凍結 test 群）

**Given** materialized test が base で全 red、base→finalHeadOid で不変、scenario 二層凍結 intact、forward type
**And** `runTestsAtCommit(finalHeadOid, ...)` が全 file について `passed === true` を返す
**When** `biteEvidence: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.biteEvidence = "required"` となり floor を満たす

### Requirement: testDerivation と biteEvidence SHALL require a two-layer scenario freeze

`achieved.testDerivation = "frozen"` および `achieved.biteEvidence = "required"` の前提として、
次の 3 条件すべてを MUST 検証する:
(a) `finalHeadOid` の `events.jsonl` を `fold` した lineage の最新 `test-case-gen` record に
`test-cases.md` output があり、その hash が non-null。
(b) `finalHeadOid` の `test-cases.md` 内容の hash が (a) の frozen hash と一致。
(c) materialized test blob が base→finalHeadOid で不変（既存 freeze diff）。
いずれかが 欠落 / null / 不一致 / 取得不能 のとき `testDerivation` と `biteEvidence` を absent と MUST する。
`test-cases.md` / `events.jsonl` は archive 時に change フォルダが移動するため `finalHeadOid` では
`specrunner/changes/archive/<日付>-<slug>/` 配下にあり、`<slug>/<file>` の trailing suffix で解決する
（in-loop `tamper.ts` の `inconclusive → proceed` を authority は信頼 MUST NOT）。

#### Scenario: frozen hash が null

**Given** `finalHeadOid` の lineage test-case-gen record の `test-cases.md` output hash が null
**When** `deriveAchievedAssurance` を実行する
**Then** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent

#### Scenario: finalHeadOid の test-cases.md が frozen hash と不一致

**Given** frozen hash は non-null だが `finalHeadOid` の `test-cases.md` 内容 hash が異なる
**When** `deriveAchievedAssurance` を実行する
**Then** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent

### Requirement: biteEvidence SHALL be gated to forward-strategy request types

`achieved.biteEvidence`（forward strategy = base-red → HEAD-green）は
**`state.request.type ∈ FORWARD_TYPES`（`bug-fix` / `new-feature`）のときにのみ**設定 MUST する。
非 forward type（`refactoring` / `spec-change` / `chore`）では、base-red・HEAD-green・scenario 凍結が
すべて成立しても `biteEvidence` を absent と MUST する（専用 strategy 実装まで fail-closed）。
`FORWARD_TYPES` は in-loop gate と単一 source を共有 MUST（`gate.ts` から export して再利用）。
`testDerivation`（commit topology + 凍結、strategy 非依存）と `specReview` は type gate の対象外と MUST する。

#### Scenario: 非 forward type で base-red・HEAD-green が成立

**Given** `state.request.type = "refactoring"`、materialized test が base:red・HEAD:green・凍結 intact
**When** `biteEvidence: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.biteEvidence` は absent となり floor が fail-closed になる

### Requirement: specReview SHALL require an approved verdict

`achieved.specReview = "required"` は、**最新 spec-review run の `outcome.verdict === "approved"`** の
ときにのみ設定 MUST する。verdict が `needs-fix` / `escalation` / `null`、または spec-review run が
存在しないとき absent と MUST する（run 存在だけでは不成立）。

#### Scenario: 最新 spec-review verdict が approved でない

**Given** 最新 spec-review run の `outcome.verdict` が `"needs-fix"`
**When** `specReview: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.specReview` は absent となり floor が fail-closed になる

#### Scenario: 最新 spec-review verdict が approved

**Given** 最新 spec-review run の `outcome.verdict` が `"approved"`
**When** `specReview: "required"` floor で `deriveAchievedAssurance` を実行する
**Then** `achieved.specReview = "required"` となり当該 floor 次元を満たす

### Requirement: The runtime SHALL provide a commit-scoped file read primitive

RuntimeStrategy は、任意 commit OID の file 内容を trailing-suffix 解決付きで取得する primitive を
MUST 提供する。DU 契約: 一意解決＋読取成功で内容を返し、非存在 OID / 非存在 path / 曖昧（複数一致）/
managed runtime では `unavailable` を返し、例外を MUST NOT throw する。working-tree 依存の
`digestArtifacts` は commit 内容でなく、かつ folder 移動後は active path 不在のため代用 MUST NOT。

#### Scenario: archived path 配下の file を suffix で解決して読む

**Given** `finalHeadOid` の tree に `specrunner/changes/archive/<日付>-<slug>/test-cases.md` が存在
**When** 当該 primitive を `oid=finalHeadOid`、suffix=`<slug>/test-cases.md` で呼ぶ
**Then** 解決された blob 内容を返し、その hash が digestArtifacts と byte 一致する

#### Scenario: 非存在 OID / managed runtime

**Given** 非存在 OID、または managed runtime
**When** 当該 primitive を呼ぶ
**Then** `unavailable` を返し throw しない
