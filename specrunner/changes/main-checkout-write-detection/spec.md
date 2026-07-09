# Spec: worktree job による main checkout 逃避書き込み検出

## Requirements

### Requirement: The system SHALL compare main-checkout guarded paths across each agent step boundary in worktree mode

worktree mode の job で agent step を実行するとき、システムは step 実行の直前と直後（成功時）に
main checkout 側の監視対象 path のスナップショットを取得し、step 実行中に生じた変更
（内容変更・新規作成・削除）を検出 SHALL する。検出は git コマンドと既存 util のみで行い、
新規依存パッケージを追加してはならない（MUST NOT）。

#### Scenario: agent step 中に監視対象ファイルが変更されると検出される

**Given** worktree mode の job が agent step を実行中である
**And** main checkout 側の監視対象 path（例: `.specrunner/config.json`）が step 開始時点で clean である
**When** agent step の実行中にその path の内容が変更される
**Then** step 直後のスナップショットが step 直前と差分を持ち、当該 path が変更として検出される

#### Scenario: 既に dirty な監視対象ファイルへの追加変更も検出される

**Given** main checkout 側の監視対象 path が step 開始時点で既に未 commit 変更を持つ
**When** agent step の実行中に同じ path の内容がさらに書き換えられる
**Then** before/after の content hash が相違し、当該 path が変更として検出される

### Requirement: The system SHALL monitor forbiddenSurfaces paths plus `.specrunner/`, independent of pipeline profile

監視対象は `config.pipeline.fast.forbiddenSurfaces` に宣言された全 path（glob）に `.specrunner/` 配下を加えた集合と
SHALL する。実際に走る pipeline 種別（fast / standard / design-only）に関わらず、この集合を監視 SHALL する。
監視集合に一致しない path の変更で escalation してはならない（MUST NOT）。

#### Scenario: standard pipeline でも forbiddenSurfaces が監視される

**Given** 実行中の pipeline が fast ではない（例: standard）
**And** `forbiddenSurfaces` に `.specrunner/config.json` が宣言されている
**When** agent step 中に main checkout の `.specrunner/config.json` が変更される
**Then** 当該 path が監視対象として検出され escalation する

#### Scenario: 監視対象外 path の変更は無視される

**Given** 操作者が agent step 中に main checkout で監視対象外 path（例: `specrunner/drafts/foo.md`）を追加・編集する
**When** step 直後のスナップショットが取得される
**Then** その変更は監視集合に一致しないため drift として検出されず、escalation しない

#### Scenario: gitignore された machine-local 書き込みは検出されない

**Given** job が main checkout の `.specrunner/local/<slug>/liveness.json`（`.gitignore` 対象）を書く
**When** agent step の before/after スナップショットが取得される
**Then** `git status --porcelain` が ignore ファイルを列挙しないため、その書き込みは drift として検出されない

### Requirement: The system SHALL escalate to awaiting-resume and record detected paths when drift is detected

監視対象 path の変更を検出した場合、システムは run を継続せず `awaiting-resume` へ遷移し `resumePoint` を書き込み SHALL する。
検出した path と変更種別（created / modified / deleted）を state に記録 SHALL する。CLI 出力には、検出差分・操作者自身の
並行編集である可能性・確認のうえ `job resume` する案内を含め SHALL る。検出時に自動 revert を行ってはならない（MUST NOT）。

#### Scenario: drift 検出で run が awaiting-resume になり検出 path が state に残る

**Given** agent step 中に main checkout の監視対象 path が変更された
**When** step 直後の drift 検出が発火する
**Then** job status が `awaiting-resume` になり `resumePoint` に当該 step が記録される
**And** state に検出 path と変更種別が記録される
**And** 以降の finalize（commit）や後続 step へは進まない

#### Scenario: CLI が検出差分と resume 案内を出力する

**Given** drift 検出により run が awaiting-resume で終了した
**When** CLI が最終結果を描画する
**Then** 検出された path と変更種別が表示される
**And** 操作者自身の並行編集の可能性が示される
**And** 確認のうえ `specrunner job resume <slug>` で継続できる案内が表示される

### Requirement: The system SHALL preserve observable behavior when no drift is detected

監視対象 path に変更が検出されない場合、run の観測可能な挙動は従来と同一で SHALL ある。
一過性の git/fs エラーでスナップショットが取得できない境界では検出を skip し、run を継続 SHALL する（fail-open backstop）。

#### Scenario: 変更なしの worktree run は従来どおり完走する

**Given** agent step 中に main checkout の監視対象 path が一切変更されない
**When** pipeline が各 agent step を実行する
**Then** drift は検出されず、pipeline は従来と同じ遷移で完走する

#### Scenario: スナップショット取得エラーで検出を skip する

**Given** main checkout での `git status` が一過性エラーで失敗する
**When** スナップショット取得が `null` を返す
**Then** 当該 step 境界の drift 検出は skip され、run は継続する

### Requirement: The system SHALL NOT run the check in no-worktree mode or managed runtime

no-worktree mode（workspace が main checkout 自身）および managed runtime（local worktree 非保持）では、
システムは本検査を実行してはならない（MUST NOT）。

#### Scenario: no-worktree mode では検査が走らない

**Given** job が `--no-worktree` で実行され cwd が repo root 自身である
**When** agent step が実行される
**Then** `detectSpecrunnerWorktree(cwd)` が false を返し、スナップショットは `null` となり検査は行われない

#### Scenario: managed runtime では検査が走らない

**Given** job が managed runtime で実行される
**When** agent step が実行される
**Then** `snapshotMainCheckoutGuard` は `null` を返し、before/after 比較は行われない
