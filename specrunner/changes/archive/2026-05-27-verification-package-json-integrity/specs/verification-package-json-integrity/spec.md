## Requirements

### Requirement: phase fallback path は verification 実行前に package.json scripts の改変を検出する

`runVerificationPhases` は MUST phase ループ開始前に、ワークツリーの `package.json` の `scripts` セクションを `origin/<baseBranch>` のそれと JSON レベルで比較する。`baseBranch` は `runVerification` の引数として渡される。比較対象は `scripts` セクションのみであり、`dependencies` / `devDependencies` 等の他セクションは検査しない。

#### Scenario: scripts が改変されている場合、verification が実行されず failed verdict を返す

- Given: ワークツリーの `package.json` の `scripts` セクションが `origin/<baseBranch>` と異なる
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: build / typecheck / test / lint / security / test-coverage のいずれの phase も実行されない
- And: verdict は `"failed"` であり、errorCode は `"PACKAGE_JSON_SCRIPTS_TAMPERED"`
- And: verification-result.md に改変前後の scripts の内容が記載される

#### Scenario: scripts が未改変の場合、従来通り verification が実行される

- Given: ワークツリーの `package.json` の `scripts` セクションが `origin/<baseBranch>` と同一
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: 従来通り build / typecheck / test 等の phase が順次実行される

#### Scenario: dependencies のみの変更は許容される

- Given: ワークツリーの `package.json` の `dependencies` が変更されているが `scripts` は同一
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: integrity check は tampered を検出せず、従来通り phase が実行される

#### Scenario: scripts キー順が異なるだけで内容が同一の場合

- Given: baseline の `scripts` と worktree の `scripts` はキーと値が同一だがキーの出現順が異なる
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: integrity check は tampered を検出せず、従来通り phase が実行される

### Requirement: custom commands path では integrity check を実行しない

`runVerificationCommands`（`verification.commands` 定義時）は SHALL integrity check を実行しない。ユーザーが明示的にコマンドを設定している場合、package.json の scripts セクションの変更は関係ない。

#### Scenario: custom commands 使用時は integrity check がスキップされる

- Given: config に `verification.commands` が定義されている
- And: ワークツリーの `package.json` の `scripts` セクションが `origin/<baseBranch>` と異なる
- When: `runVerification(slug, cwd, verificationConfig, baseBranch)` を呼ぶ
- Then: integrity check は実行されず、custom commands が通常通り実行される

### Requirement: baseBranch の package.json が取得できない場合はチェックをスキップする

`git show origin/<baseBranch>:package.json` が失敗した場合（baseBranch に package.json が存在しない、origin が fetch されていない等）、integrity check は SHALL スキップされ、従来通り phase が実行される。

#### Scenario: baseBranch に package.json が存在しない

- Given: `origin/<baseBranch>` に `package.json` が存在しない（新規プロジェクト等）
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: integrity check はスキップされ、従来通り phase が実行される

#### Scenario: baseBranch が undefined の場合

- Given: `baseBranch` が `undefined`（テストや直接呼び出し）
- When: `runVerificationPhases(slug, cwd, undefined)` を呼ぶ
- Then: integrity check はスキップされ、従来通り phase が実行される
