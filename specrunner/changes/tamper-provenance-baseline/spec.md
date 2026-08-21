# Spec: bite-evidence tamper 判定の provenance 化

## Requirements

### Requirement: bite-evidence は認可された変更経路による test-cases.md の変更を tamper としない

bite-evidence gate は、`test-cases.md` の現在内容への最新の変更が **認可された
変更経路** で説明できる場合、その変更を tamper として扱っては **ならない (SHALL
NOT)**。認可された変更経路とは、`test-cases.md` を `writes()` で宣言する所有 step
（test-case-gen / spec-fixer）による commit、および operator 適用
（`operator-apply` commit）である。認可された出自を持つ場合、gate は tamper に
よる fail-closed を発火させず base/candidate 評価へ進行 **しなければならない
(MUST)**。

#### Scenario: spec-fixer の正規編集は tamper 扱いにならない

**Given** test-case-gen が `test-cases.md` を生成・commit し、その後 spec-review の
fixable finding を受けて spec-fixer が `test-cases.md` を正規に編集し
`spec-fixer: <slug>` commit として記録した状態（実測した偽陽性形）
**When** bite-evidence gate が tamper 判定を行う
**Then** 判定は認可済み（proceed）となり、tamper による `failed` verdict は
発火しない

#### Scenario: operator 適用による変更は tamper 扱いにならない

**Given** operator が `job resume --apply-canon` 相当で `test-cases.md` を変更し、
`operator-apply: <slug>` commit として記録した状態
**When** bite-evidence gate が tamper 判定を行う
**Then** 判定は認可済み（proceed）となり、tamper による `failed` verdict は
発火しない

### Requirement: bite-evidence は認可経路で説明できない test-cases.md の変更を fail-closed にする

bite-evidence gate は、`test-cases.md` の現在内容が **認可された変更経路で説明
できない** 場合、tamper として `failed` verdict を返さ **なければならない
(MUST)**（fail-closed）。認可経路で説明できない変更とは、非所有 step に帰属する
commit による変更、および commit に帰属しない未 commit の worktree 書き換え
（証跡外の書き換え）である。

#### Scenario: 非所有 step に帰属する変更は failed

**Given** `test-cases.md` を最後に変更した commit が、`test-cases.md` を `writes()`
で宣言しない非所有 step（例: implementer）に帰属している状態
**When** bite-evidence gate が tamper 判定を行う
**Then** verdict は `failed`（fail-closed）となり、reason は tamper を示す

#### Scenario: 証跡外の未 commit 書き換えは failed

**Given** `test-cases.md` に、いずれの commit にも帰属しない未 commit の worktree
変更が存在する状態
**When** bite-evidence gate が tamper 判定を行う
**Then** verdict は `failed`（fail-closed）となり、reason は tamper を示す

### Requirement: bite-evidence の tamper 判定は durable な commit 帰属を証跡とする

bite-evidence gate の tamper 判定は、best-effort な lineage 記録ではなく、
sole-committer の **durable な step 帰属 commit 履歴** を証跡として用い **なければ
ならない (MUST)**。したがって、正規編集が commit として残っている限り、その編集の
best-effort な lineage record が欠落していても tamper（偽陽性）と判定しては
**ならない (SHALL NOT)**。

#### Scenario: lineage 記録が欠落しても durable な commit 帰属で認可済みと判定する

**Given** spec-fixer が `test-cases.md` を正規編集し `spec-fixer: <slug>` commit
として記録したが、その step の lineage record は appendLineage の best-effort 失敗
により events.jsonl に存在しない状態
**When** bite-evidence gate が tamper 判定を行う
**Then** 判定は認可済み（proceed）となり、lineage 欠落を理由に tamper 扱いには
ならない

### Requirement: bite-evidence は provenance 証跡を導出できないとき proceed する

bite-evidence gate は、git 由来の provenance 証跡を導出できない場合
（最終変更 commit を照会できない、worktree 状態を照会できない、authorizedWriters
を導出できない、または managed runtime のように構造的に local 履歴を持たない場合）、
tamper による fail-closed を発火させず、判定不能（inconclusive）として base/candidate
評価へ進行 **しなければならない (MUST)**。fail-closed は積極的に認可外と判定できた
変更に限定 **しなければならない (MUST)**。

#### Scenario: provenance を導出できない runtime では tamper で halt しない

**Given** runtime が `test-cases.md` の最終変更 commit を導出できない
（provenance 照会が unavailable）状態
**When** bite-evidence gate が tamper 判定を行う
**Then** 判定は判定不能（proceed）となり、tamper による `failed` verdict は
発火しない
