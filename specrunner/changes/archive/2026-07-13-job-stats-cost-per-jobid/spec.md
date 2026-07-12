# Spec: job stats のコスト集計で usage.json を jobId / change-dir から解決する

## Requirements

### Requirement: job stats は各 state 行を source change-dir から usage.json を解決しなければならない

`job stats` コマンドは、各 state 行のコスト集計に使う `usage.json` を、その state が load された change-dir（= `state.json` の親ディレクトリ）から直接解決しなければならない（SHALL）。slug ベースの再解決（`resolveChangeDir(slug)`）を使ってはならない。

#### Scenario: 同一 base-slug・別 jobId の 2 run が各自のコストを計上する

**Given** active change dir `specrunner/changes/foo/` に jobId=B の state.json と usage.json が存在し、archive dir `specrunner/changes/archive/2026-05-01-foo/` に jobId=A の state.json と usage.json が存在する

**When** `job stats --json` を実行する

**Then** 出力の `runs` 配列に slug=`foo` の行が 2 行存在し、各行の `costUsd` がそれぞれ自分の usage.json から算出した値と一致する。行 A のコストに行 B の invocation が混入せず、行 B のコストに行 A の invocation が混入しない

---

### Requirement: legacy invocation（jobId なし）は自行の usage.json の分のみ加算されなければならない

同一 base-slug の 2 run が各々 `jobId` なし（legacy 形式）の invocation を含む usage.json を持つ場合、各行は自分の change-dir の usage.json にある legacy invocation のみを加算しなければならない（SHALL）。別行の usage.json の legacy invocation を加算してはならない。

#### Scenario: 各行が自行の legacy invocation のみをコストに含める

**Given** active と archive それぞれの change-dir に、`jobId` フィールドを持たない invocation を含む usage.json が存在する

**When** `job stats --json` を実行する

**Then** active 行のコストは active change-dir の usage.json の legacy invocation から算出され、archive 行のコストは archive change-dir の usage.json の legacy invocation から算出される。コストの合計が各 dir の invocation の合計と一致する

---

### Requirement: usage.json が存在しない行は cost = null になり行は drop されない

`usage.json` が存在しない change-dir を持つ state 行のコストは null でなければならず（SHALL）、行そのものが `runs` 配列から除外されてはならない。

#### Scenario: usage.json なしの行が cost = null で出力に現れる

**Given** `specrunner/changes/baz/` に state.json は存在するが usage.json が存在しない

**When** `job stats --json` を実行する

**Then** 出力の `runs` に slug=`baz` の行が 1 行存在し、`costUsd` が `null` である
