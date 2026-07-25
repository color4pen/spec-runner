# Spec: egress-ledger-push-failure

## Requirements

### Requirement: synthesis commit の OID は push 試行前に store へ永続化される

逐次 step の synthesis 経路（`commitAndPush`）は、commit 作成直後・push 試行前に `rev-parse HEAD` で OID を取得し、store へ永続化しなければならない（SHALL）。push の成否は台帳の完全性に影響しない。scoped / guarded 両モードに適用される。

#### Scenario: scoped モードで push が失敗する

**Given** scoped モードで `commitAndPush` が呼ばれ、commit が作成されている
**When** `pushOnly` が 2 回とも失敗して `PUSH_FAILED` で throw する
**Then** `persistBeforePush` コールバックが synthesis commit の OID で呼ばれている（push 前に呼ばれている）

#### Scenario: guarded モードで push が失敗する

**Given** guarded モードで `commitAndPush` が呼ばれ、commit が作成されている
**When** `pushOnly` が 2 回とも失敗して `PUSH_FAILED` で throw する
**Then** `persistBeforePush` コールバックが synthesis commit の OID で呼ばれている（push 前に呼ばれている）

---

### Requirement: commitFinalState の checkpoint / finalize commit OID は push 試行前に store へ永続化される

`commitFinalState` は checkpoint または finalize commit を作成した直後・push 試行前に OID を store へ永続化しなければならない（SHALL）。push の成否は台帳の完全性に影響しない。

#### Scenario: commitFinalState が push 成功する場合

**Given** `commitFinalState` が呼ばれ、managed paths に変更がある
**When** commit が作成され push が成功する
**Then** push より前に `persistBeforePush` コールバックが commit OID で呼ばれている

#### Scenario: commitFinalState が push 失敗する場合

**Given** `commitFinalState` が呼ばれ、managed paths に変更がある
**When** commit が作成され push が 2 回とも失敗する
**Then** `persistBeforePush` コールバックは依然として commit OID で呼ばれており、push 失敗は OID 永続化に影響しない

---

### Requirement: push 失敗後の resume で synthesis commit / checkpoint commit が egress unknown にならない

push 失敗で halt した後に resume が実行された場合、前回実行で作成された synthesis commit および checkpoint commit が `EGRESS_UNKNOWN_COMMIT` で unknown と判定されてはならない（SHALL NOT）。

#### Scenario: push 失敗 → halt → resume の egress 検証 pin

**Given** synthesis commit が作成されたが push が失敗し、OID が store に永続化されている
**When** resume 後の再実行で `verifyEgressLedger` が呼ばれる
**Then** 前回の synthesis commit OID は台帳に存在するため `EGRESS_UNKNOWN_COMMIT` が throw されない

---

### Requirement: pushFailedError のメッセージに git の stderr が含まれる

`pushOnly` が両試行とも失敗した場合、throw する `pushFailedError` の detail フィールドは最終試行の git stderr を含まなければならない（SHALL）。stderr が空の場合は exit code のみで可。

#### Scenario: git push が stderr を出力して失敗する

**Given** `pushOnly` が両試行とも非ゼロ exit code で失敗し、stderr に "remote: error: ..." のようなメッセージを返す
**When** `pushFailedError` が構築される
**Then** error の detail 文字列に stderr のテキストが含まれる

---

### Requirement: EGRESS_UNKNOWN_COMMIT エラーに実 branch 名が含まれる

`verifyEgressLedger` が unknown commit を検出した場合、throw する `EGRESS_UNKNOWN_COMMIT` エラーには実際の branch 名が含まれなければならない（SHALL）。空文字のハードコードは許可されない。

#### Scenario: verifyEgressLedger が branch 付きで呼ばれる

**Given** `verifyEgressLedger` に `branch: "fix/some-feature-abc12345"` が渡される
**When** publish range に台帳未登録の commit が検出される
**Then** throw されるエラーのメッセージに "fix/some-feature-abc12345" が含まれる
