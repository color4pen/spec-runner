# Spec: git 書き込み副作用の失敗を typed halt 化する

この spec は local runtime の commit 経路（`commitAndPush` / `commitScopedPaths`）における **git 書き込み副作用の失敗と正当 no-op の分離**の振る舞い正典である。`architecture/adr/2026-07-13-execution-ownership-model.md` D2（失敗遷移の単一適用 = `StepHalt`）/ B-13 / B-14 が定める halt 適用の構造は不変で、本 spec はその適用**対象**に、従来 silent-return / 結果無視していた git 副作用失敗 site を含める refine を担う。

正典用語:

- **commit 経路（step）**: `commitAndPush`。step 完了後に worktree の変更を stage → commit → push する local 専用の単一点。
- **commit 経路（round）**: `commitScopedPaths`。coordinator round が宣言出力に限定して stage → commit → push する単一点（B-15）。
- **正当 no-op**: `git add` が成功し、staged 変更が無く（`git diff --cached --quiet` exit 0）、agent 自己 commit による HEAD 前進も無い状態。commit すべき変更が実在しない正当な結果。
- **agent 自己 commit**: staged 変更は無いが（diff exit 0）、step 開始時点から HEAD が前進している状態。agent が自ら commit した既存 commit を push すべき正当経路。
- **git 操作失敗**: `git add` の非ゼロ終了 / spawn 失敗、`git diff --cached --quiet` の exit≥2 / spawn 失敗、`git commit` の非ゼロ終了 / spawn 失敗。worktree 上で発生する operational failure（index lock / disk / corruption 等）。

## Requirements

### Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する

local 専用の step commit 経路（`commitAndPush`）は、**git 操作失敗**を **正当 no-op** から区別し、git 操作失敗のときは typed な `SpecRunnerError`（code `COMMIT_AND_PUSH_FAILED`）を **throw しなければならない（MUST）**。git 操作失敗を silent に成功扱い（return）して **はならない（MUST NOT）**。分離軸は次のとおり:

- `git add` が spawn 失敗 または 非ゼロ終了 → **throw**（MUST）。「非 git repo なので no-op」として silent skip して **はならない（MUST NOT）**。
- `git diff --cached --quiet` が spawn 失敗 または exit≥2（git エラー）→ **throw**（MUST）。exit 0（staged 変更なし）を「変更なし」、exit 1（staged 変更あり）を「commit 対象」として扱わなければならない（MUST）。exit≥2 を「変更なし」に潰して **はならない（MUST NOT）**。
- `git commit` が spawn 失敗 または 非ゼロ終了 → **throw** し、その後の push を **実行してはならない（MUST NOT）**。commit の成否を検査せず push へ進んで **はならない（MUST NOT）**。

throw された失敗は、既存の commit-fail halt 経路（`makeCommitFailHalt` → `CommitOrchestrator`）で単一適用され、step は terminal に **failed（code `COMMIT_AND_PUSH_FAILED`）** で halt しなければならない（MUST）。新しい StepHalt kind や新しい適用点を追加して **はならない（MUST NOT）**。

#### Scenario: git add 失敗で halt する（silent no-op しない）

**Given** local step commit 経路で `git add` が非ゼロで終了する
**When** step の commit 経路が実行される
**Then** typed error（code `COMMIT_AND_PUSH_FAILED`）が throw される
**And** step は `failed`（code `COMMIT_AND_PUSH_FAILED`）で halt する
**And** silent no-op しない（commit / push は実行されない）

#### Scenario: git diff の git エラー（exit≥2）で halt する

**Given** local step commit 経路で `git diff --cached --quiet` が exit≥2 で終了する
**When** step の commit 経路が実行される
**Then** typed error が throw され step が halt する
**And** exit≥2 を「変更なし」として扱わない（no-op で素通りしない）

#### Scenario: git commit 失敗で halt し push しない

**Given** local step commit 経路で staged 変更があり（diff exit 1）、`git commit` が非ゼロで終了する
**When** step の commit 経路が実行される
**Then** typed error が throw され step が halt する
**And** push は実行されない（commit 失敗を無視して push へ進まない）

#### Scenario: 正当 no-op は silent に成功する

**Given** `git add` が成功し、staged 変更が無く（diff exit 0）、HEAD 前進も無い
**When** step の commit 経路が実行される
**Then** throw も commit も push も起きず、silent に成功する（正当 no-op を保存）

#### Scenario: agent 自己 commit は push のみ行う

**Given** `git add` が成功し、staged 変更が無く（diff exit 0）、step 開始時点から HEAD が前進している
**When** step の commit 経路が実行される
**Then** commit は行わず push のみ実行する（既存の自己 commit 経路を保存）

### Requirement: round commit 経路は git 操作失敗を正当 no-op から分離し throw する

coordinator round の commit 経路（`commitScopedPaths`）は、step commit 経路と **同じ分離軸**で git 操作失敗を **throw しなければならない（MUST）**。すなわち `git add -A -- <paths>` の spawn 失敗 / 非ゼロ終了 → throw、`git diff --cached --quiet` の spawn 失敗 / exit≥2 → throw、`git commit` の spawn 失敗 / 非ゼロ終了 → throw（push を実行しない）。git 操作失敗を silent return / 結果無視して **はならない（MUST NOT）**。

正当 no-op は保存しなければならない（MUST）: stage 対象 path が空、または `git add` 成功かつ staged 変更なし（diff exit 0）のとき、throw も commit もせず return する。scoped staging（`git add -A -- <paths>`、宣言出力限定、bare `git add -A` を使わない）は **不変でなければならない（MUST）**（B-15 保持）。

round の git 操作失敗の throw は、**新しい halt 機構を追加せず**、`pushFailedError`（push 失敗）が現在乗っているのと同一の既存経路で受けなければならない（MUST）。

#### Scenario: round の git add 失敗で throw する（silent return しない）

**Given** round commit 経路で `git add -A -- <paths>` が非ゼロで終了する
**When** round の commit 経路が実行される
**Then** typed error が throw される
**And** silent return しない（diff / commit / push は実行されない）

#### Scenario: round の git commit 失敗で throw し push しない

**Given** round commit 経路で staged 変更があり（diff exit 1）、`git commit` が非ゼロで終了する
**When** round の commit 経路が実行される
**Then** typed error が throw される
**And** push は実行されない

#### Scenario: round の正当 no-op は保存される

**Given** round commit 経路で stage 対象が空、または `git add` 成功かつ staged 変更なし（diff exit 0）
**When** round の commit 経路が実行される
**Then** throw も commit も push も起きず return する（正当 no-op を保存）

### Requirement: run 完了後の finalize は挙動不変（throw しない）

run 完了後の best-effort finalize（`commitFinalState`）は、本変更の影響を **受けてはならない（MUST NOT）**。commit 失敗・push 失敗は従来どおり warn に留め、**throw してはならない（MUST NOT）**。run は既に awaiting-archive で state は branch 上に回収可能なため、finalize での throw は不適切である。

#### Scenario: finalize の commit / push 失敗は warn に留まる

**Given** run が awaiting-archive に遷移した後の `commitFinalState`
**When** commit または push が失敗する
**Then** warn を出すが throw しない（挙動は本変更前と同一）
