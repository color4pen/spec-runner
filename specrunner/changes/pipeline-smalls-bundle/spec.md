# Spec: pipeline 運用の小粒不具合 3 件の一括修正

## Requirements

### Requirement: build-fixer prompt が lcov 変更行 gate 手順を使う

build-fixer の system prompt は、test-coverage phase が失敗した場合の手順として、`verification-result.md` に記録された **未実行の変更行（file:line）を確認し、その行を実際に実行する実テストを追加する** ことを指示 SHALL。旧 TC-ID 照合手順（missing TC ID の確認・test-cases.md の参照・TC ID 記載）は残ってはならない。

#### Scenario: test-coverage failed 時の手順に lcov 変更行が記載されている

**Given** build-fixer の system prompt が生成される
**When** BUILD_FIXER_SYSTEM_PROMPT の文字列を検査する
**Then** `verification-result.md` に記録された未実行変更行を確認する旨の記述が含まれる

#### Scenario: 旧 TC-ID 手順が残っていない

**Given** build-fixer の system prompt が生成される
**When** BUILD_FIXER_SYSTEM_PROMPT の文字列を検査する
**Then** "missing TC ID"、"test-cases.md"、"TC ID を必ず記載" のいずれも含まれない

---

### Requirement: build-fixer と code-fixer の両 prompt が coverage gate 回避を禁止する

build-fixer および code-fixer の system prompt は、coverage gate を回避する不正な修正（既存テストの削除・移設、カバレッジ目的の dead code / dead export の追加、coverage 設定の編集）を禁止事項として明示 SHALL。また、正当な修正で解消できない場合は修正せず失敗のまま終えることを明示 SHALL。

#### Scenario: build-fixer prompt に gate 回避禁止規律が含まれる

**Given** build-fixer の system prompt が生成される
**When** BUILD_FIXER_SYSTEM_PROMPT の文字列を検査する
**Then** テストの削除・移設禁止、dead code 追加禁止、coverage 設定編集禁止のいずれかを示すキーワードが含まれる

#### Scenario: code-fixer prompt に gate 回避禁止規律が含まれる

**Given** code-fixer の system prompt が生成される
**When** CODE_FIXER_SYSTEM_PROMPT の文字列を検査する
**Then** テストの削除・移設禁止、dead code 追加禁止、coverage 設定編集禁止のいずれかを示すキーワードが含まれる

---

### Requirement: exit-guard が awaiting-resume 遷移時に resumePoint を書く

exit-guard の 3 経路（no-worktree / per-job / global scan）は、`state.step` が truthy の場合、awaiting-resume への遷移時に `resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 }` を state に書き込む SHALL。`state.step` が falsy の場合は従来どおり resumePoint を設定しない（既存挙動を維持する）。

#### Scenario: no-worktree 経路で resumePoint が書かれる

**Given** no-worktree モードで running 状態かつ `step` が有効な値の job が存在する
**When** exit-guard の no-worktree ハンドラが実行される
**Then** 遷移後の state に `resumePoint.step === state.step` かつ `resumePoint.reason === "signal"` が記録される

#### Scenario: per-job 経路で resumePoint が書かれる

**Given** worktree モードで running 状態かつ `step` が有効な値の job が存在する
**When** exit-guard の per-job ハンドラが実行される
**Then** 遷移後の state に `resumePoint.step === state.step` かつ `resumePoint.reason === "signal"` が記録される

#### Scenario: global scan 経路で resumePoint が書かれる

**Given** main checkout で running 状態かつ `step` が有効な値の job が list される
**When** exit-guard の global scan ハンドラが実行される
**Then** 遷移後の state に `resumePoint.step === state.step` かつ `resumePoint.reason === "signal"` が記録される

#### Scenario: step が空の job では resumePoint を書かない

**Given** `state.step` が空文字列（または falsy）の running job が存在する
**When** exit-guard が実行される
**Then** 遷移後の state の `resumePoint` は null または undefined のまま

---

### Requirement: view コマンドが worktree cwd から実行された場合に明示エラーで拒否する

`job ls`、`job stats`、`job show` は、specrunner job worktree 内の cwd から実行された場合、state scan（`JobStateStore.list` 呼び出し）の前に `WORKTREE_GUARD` エラー（exit code 非 0）で終了 SHALL。エラーメッセージには main checkout への再実行案内（`cd <mainPath>` ヒント）を含む。判定には `detectSpecrunnerWorktree` を使い、エラー生成には `worktreeGuardError` を流用する。

#### Scenario: worktree cwd からの job ls がエラーになる

**Given** cwd が `<repo>/.git/specrunner-worktrees/<slug>-<id>/` 以下
**When** `runPs` を呼び出す
**Then** exit code 非 0 で返り、stderr に main checkout への案内が出力される（JobStateStore.list は呼ばれない）

#### Scenario: worktree cwd からの job stats がエラーになる

**Given** cwd が `<repo>/.git/specrunner-worktrees/<slug>-<id>/` 以下
**When** `runJobStats` を呼び出す
**Then** exit code 非 0 で返り、stderr に main checkout への案内が出力される（JobStateStore.list は呼ばれない）

#### Scenario: worktree cwd からの job show がエラーになる

**Given** cwd が `<repo>/.git/specrunner-worktrees/<slug>-<id>/` 以下
**When** `runJobShow` を呼び出す
**Then** exit code 非 0 で返り、stderr に main checkout への案内が出力される（JobStateStore.list は呼ばれない）

#### Scenario: main checkout cwd からの view コマンドは正常動作する

**Given** cwd が main checkout（`.git` がディレクトリ）の下
**When** `runPs` / `runJobStats` / `runJobShow` を呼び出す
**Then** 従来どおり state scan が実行され、exit code 0 で結果が返る
