# Spec: 中断 step の書きかけ canon を resume が自動隔離して再走する

## Requirements

### Requirement: resume は中断 step の書きかけ canon を機械的裏づけ完全一致時に自動隔離する

`--apply-canon` 未指定の resume で protected canon paths が dirty のとき、システムは次の 4 条件を
すべて満たす場合に限り、それを中断 step の書きかけ部分出力とみなし、halt せず自動隔離して resume を
続行 SHALL する:

1. resume 対象 step（`startStep`）が中断された step `S`（= `state.step`）と一致する。
2. dirty canon paths の全てが `S` の `writes()` 宣言に含まれる（`writes(S) ∩ protectedCanonPaths`）。
3. `S` の中断が state から機械的に裏づけられる（stale-running 検出、または `resumePoint.reason` が
   `signal` / `timeout` / `failure` / `exhaustion` のいずれか）。
4. `S` の完了 StepRun が存在しない（`state.steps[S]` が空 / 不在）。

4 条件のうち 1 つでも不成立の場合、システムは現行どおり fail-closed で halt SHALL する。

#### Scenario: untracked な書きかけ canon がある中断 resume は隔離して続行する

**Given** design step が signal 中断され、`state.step = "design"`、`resumePoint.reason = "signal"`、
`state.steps["design"]` が不在で、worktree に untracked な design.md / tasks.md が残っている
**When** operator が `--apply-canon` なしで resume する
**Then** resume は halt せず、design.md / tasks.md を退避してから worktree から除去し、design step を
最初から再走させる

#### Scenario: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する

**Given** design step が signal 中断され、`state.steps["design"]` が不在で、worktree に既存 tracked
な design.md が modified 状態で残っている
**When** operator が `--apply-canon` なしで resume する
**Then** resume は halt せず、modified な design.md を退避してから `HEAD` の内容へ戻し、design step を
再走させる

### Requirement: 自動隔離は削除前に読める形の evidence を退避する

自動隔離時、システムは対象 canon path の内容（tracked なら diff、untracked なら raw content）を
`.specrunner/local/<slug>/` 配下の退避ディレクトリへ、削除より前にすべて書き出 SHALL す。退避先と
退避対象は log に明示 SHALL する。

#### Scenario: 隔離後に退避先へ evidence が残る

**Given** design の書きかけ canon が自動隔離の対象になっている
**When** resume が自動隔離を実行する
**Then** `.specrunner/local/<slug>/` 配下の退避ディレクトリに各 canon path の内容が読める形で残り、
何をどこへ退避したかが log に出力される

### Requirement: 機械的裏づけの無い dirty canon は fail-closed で halt する

中断の機械的裏づけが得られない dirty canon（operator の意図的編集に相当）に対して、システムは自動
隔離せず、現行どおり fail-closed で halt SHALL する。

#### Scenario: 中断の裏づけが無い dirty canon は halt する

**Given** worktree に dirty な canon path があるが、stale-running 検出も interruption 由来の
resumePoint も無い（例: `resumePoint` が null、または reason が `escalation`）
**When** operator が `--apply-canon` なしで resume する
**Then** resume は自動隔離せず fail-closed で halt し、`--apply-canon` か破棄を促す

#### Scenario: 中断 step の writes() 外の canon が混在する場合は halt する

**Given** 中断 step `S` の writes() に含まれない canon path（例: 別 step 由来の canon）が dirty
canon に 1 件以上混在している
**When** operator が `--apply-canon` なしで resume する
**Then** resume は自動隔離せず fail-closed で halt する

#### Scenario: 前 step が正常完了している場合は halt する

**Given** `S` が完了 StepRun を持つ（`state.steps[S]` が非空）状態で dirty canon がある
**When** operator が `--apply-canon` なしで resume する
**Then** resume は自動隔離せず fail-closed で halt する

### Requirement: `--apply-canon` 明示は自動隔離より優先する

`--apply-canon` が指定された resume では、システムは自動隔離判定を行わず、現行どおり dirty canon を
`operator-apply: <slug>` commit として取り込み ledger に記録 SHALL する。

#### Scenario: `--apply-canon` 指定時は operator-apply commit を行う

**Given** design の書きかけ canon がある（自動隔離判定が成立し得る状態）
**When** operator が `--apply-canon` 付きで resume する
**Then** resume は自動隔離せず、dirty canon を operator-apply commit として取り込む

### Requirement: 退避失敗時は削除せず fail-closed で halt する

自動隔離の evidence 退避が 1 件でも失敗した場合、システムは canon path を worktree から削除せず、
fail-closed で halt SHALL する。

#### Scenario: 退避書き込み失敗時は何も削除せず halt する

**Given** 自動隔離判定が成立しているが、退避先ディレクトリへの evidence 書き込みが失敗する
**When** resume が自動隔離を試みる
**Then** resume は canon path を削除せず halt し、退避が保全され削除されていないことを促す

### Requirement: stale-running（SIGKILL / hard-crash）経路でも部分出力判定が機能する

`resumePoint` が存在しない SIGKILL / hard-crash 経路（stale-running 検出で `awaiting-resume` 化
されたケース）でも、システムは stale-running 検出を中断の機械的裏づけとして扱い、部分出力判定を
適用 SHALL する。

#### Scenario: resumePoint 無しの stale 経路でも隔離判定が働く

**Given** `state.status = "running"` かつ runner process が死んでおり（stale-running 検出）、
`resumePoint` が不在、`state.step = "design"`、`state.steps["design"]` が不在で、worktree に design の
書きかけ canon が残っている
**When** operator が `--apply-canon` なしで resume する
**Then** resume は stale-running 検出を裏づけとして部分出力と判定し、halt せず隔離して design を再走
させる

### Requirement: 自動隔離後の再 resume は clean な gate 通過になる

自動隔離が worktree から書きかけ canon を除去した後、システムの後続 resume は apply-canon gate を
dirty 検出なしで通過 SHALL する（隔離の冪等性）。

#### Scenario: 隔離後の再 resume は dirty canon を検出しない

**Given** 直前の resume が design の書きかけ canon を自動隔離して除去した
**When** operator が続けて resume する
**Then** apply-canon gate は dirty canon を検出せず、隔離も halt も行わずに通過する
