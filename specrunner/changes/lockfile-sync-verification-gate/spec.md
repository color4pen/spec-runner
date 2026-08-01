# Spec: verification に lockfile 整合 gate を追加する

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: 依存変更に lockfile 同期が伴わなければ gate は fail する

`baseBranch` が与えられたとき、verification は base…HEAD の変更ファイル集合を導出し、そこに `package.json`（workspace 配下を含む）があって base 版と HEAD 版で**依存関連セクション**（`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` / `overrides` / `resolutions` / `packageManager`）の内容が異なるのに、同変更集合に lockfile（`LOCKFILE_MAP` 対象: `pnpm-lock.yaml` / `bun.lockb` / `bun.lock` / `yarn.lock` / `package-lock.json`）が 1 つも含まれない場合、`lockfile-sync` phase を **failed** にする MUST。fail の stdout には検出した package manager の同期手順（`<pm> install` を実行して lockfile を commit する）を含める MUST。

#### Scenario: 依存追加 + lockfile 変更なし → failed（#935 の再現）

**Given** 変更集合に `package.json` があり、その `dependencies` が base に無い依存を HEAD で追加している。変更集合に lockfile は含まれず、repo は lockfile を追跡している
**When** lockfile-sync gate が判定する
**Then** status は failed で、stdout に検出した package manager の同期手順（`<pm> install` と lockfile を commit する旨）が含まれる

#### Scenario: 依存追加 + lockfile 変更あり → passed

**Given** 変更集合に `package.json`（依存追加）と lockfile の両方が含まれる
**When** lockfile-sync gate が判定する
**Then** status は passed で、gate は fail の原因にならない

#### Scenario: workspace 配下 package.json の依存変更でも検出される

**Given** 変更集合に `packages/foo/package.json` があり、その依存関連セクションが base と HEAD で異なる。変更集合に lockfile は含まれず、repo は lockfile を追跡している
**When** lockfile-sync gate が判定する
**Then** status は failed になる（root だけでなく workspace 配下の package.json も対象になる）

### Requirement: 依存関連セクションに差の無い package.json 変更は偽陽性にしない

`package.json` が変更集合にあっても、依存関連 7 セクションの内容が base 版と HEAD 版で同一なら、gate は fail しない MUST。判定は行 diff ではなく、依存関連セクションを parse して key 順に依存しない形で比較する SHALL。

#### Scenario: scripts / version のみの変更 → 非 failed

**Given** 変更集合に `package.json` があり、`scripts` と `version` のみが base と異なる（依存関連 7 セクションは同一）。変更集合に lockfile は含まれない
**When** lockfile-sync gate が判定する
**Then** status は failed にならない（依存変更が無いため対象外）

### Requirement: 検査対象外・検査不能は fail させず可視化する

repo が lockfile を追跡しない場合（base にも HEAD にも `LOCKFILE_MAP` 対象が存在しない）、gate は skip する MUST。base…HEAD の diff が導出できない場合（`unavailable` 等）は gate を fail させず、検査不能である旨を phase 結果に明示する MUST。検査不能を黙って pass 扱いにしない SHALL。

#### Scenario: lockfile 非追跡 repo → skipped

**Given** repo が lockfile（`LOCKFILE_MAP` 対象）を一切追跡しておらず、`package.json` の依存関連セクションが変更されている
**When** lockfile-sync gate が判定する
**Then** status は skipped で、stdout に lockfile 非追跡である旨が明示される（fail にならない）

#### Scenario: diff 導出不能 → skipped + 検査不能の明示

**Given** base…HEAD の変更ファイル集合を git から導出できない（managed 等で worktree diff が非導出）
**When** lockfile-sync gate が実行される
**Then** status は skipped で、stdout に検査不能（diff unavailable）である旨が明示される（failed にも pass にもならない）

### Requirement: gate は commands 経路 / phases 経路の両方で主検証の後に実行される

`baseBranch` が与えられたとき、lockfile-sync gate は `verification.commands` を使う repo（commands 経路）でも、package.json script fallback を使う repo（phases 経路）でも、主検証（および changed-line-coverage gate）の後に実行される MUST。先行検証が failed の場合は fail-fast で skipped になる SHALL。`baseBranch` が未指定のときは実行されない SHALL。

#### Scenario: phases 経路で gate が実行される

**Given** `verification.commands` 未設定（phases 経路）で `baseBranch` が与えられ、先行の script phase が全て passed
**When** verification を実行する
**Then** `lockfile-sync` phase が実行され、その結果が verdict に反映される

#### Scenario: commands 経路で gate が実行される

**Given** `verification.commands` を設定（commands 経路）し `baseBranch` が与えられ、先行の command が全て passed
**When** verification を実行する
**Then** `lockfile-sync` phase が実行され、その結果が verdict に反映される

#### Scenario: baseBranch 未指定なら gate は走らない

**Given** `runVerification` が `baseBranch` 引数なしで呼ばれる
**When** verification を実行する
**Then** `lockfile-sync` phase は結果に現れず、既存の phase 構成・verdict は変わらない

### Requirement: implementer の手順に lockfile 同期指示が含まれる

implementer の user message（`buildImplementerInitialMessage`）の手順には、依存を追加・変更した場合は lockfile を同期してから完了する旨が含まれる MUST。この指示は test-materialize 済み（standard pipeline）と未 materialize（fast pipeline）の両分岐の message に含まれる SHALL。

#### Scenario: 両分岐の user message に lockfile 同期指示が含まれる

**Given** `buildImplementerInitialMessage` を `testsMaterialized: true` と `testsMaterialized: false` の双方で構築する
**When** それぞれの message を検査する
**Then** どちらの message にも「依存を追加・変更した場合は lockfile を同期する」旨の手順が含まれる
