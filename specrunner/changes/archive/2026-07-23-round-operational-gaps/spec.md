# Spec: round-operational-gaps

## Requirements

### Requirement: pipelineManagedPaths は prCreateResultPath を含む

`pipelineManagedPaths(slug)` SHALL `prCreateResultPath(slug)` を返す配列に含める。これにより pr-create-result.md は `partitionRoundChanges` の offending 判定から除外され、round halt を引き起こさない。また `commit-push.ts` scoped mode の `existingManaged` にも含まれ、scoped 合成の commit 対象となる。

#### Scenario: pr-create-result.md のみが dirty な round で offending が空になる

**Given** worktree に `specrunner/changes/<slug>/pr-create-result.md` の dirty な変更がある  
**When** `partitionRoundChanges({ changed: [prCreateResultPath(slug)], declared: [], slug })` を呼ぶ  
**Then** `offending` が空配列であり、`toStage` も空配列である（managed として双方から除外）

#### Scenario: pipelineManagedPaths が pr-create-result.md を含む

**Given** 任意の slug  
**When** `pipelineManagedPaths(slug)` を呼ぶ  
**Then** 返り値に `specrunner/changes/<slug>/pr-create-result.md` が含まれる  
**And** 返り値の長さが 5 である（state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md）

### Requirement: cross-boundary-invariants は runtime/verification 変更で起動する

`specrunner/reviewers/cross-boundary-invariants.md` の frontmatter `paths` SHALL `src/core/runtime/**` と `src/core/verification/**` を含む（既存 5 glob に加えて合計 7 glob）。本文（観点・判定基準）は変更しない。

#### Scenario: runtime 専変更で cross-boundary-invariants が skip しない

**Given** request が `src/core/runtime/` 配下のみを変更する  
**When** custom reviewer round が起動条件を評価する  
**Then** cross-boundary-invariants は skip せず、review セッションを開始する

#### Scenario: verification 専変更で cross-boundary-invariants が skip しない

**Given** request が `src/core/verification/` 配下のみを変更する  
**When** custom reviewer round が起動条件を評価する  
**Then** cross-boundary-invariants は skip せず、review セッションを開始する

#### Scenario: 既存 5 glob が保存されている

**Given** 修正後の `cross-boundary-invariants.md`  
**When** frontmatter `paths` を読む  
**Then** `src/core/pipeline/**`, `src/core/step/**`, `src/state/**`, `src/store/**`, `src/adapter/**` がすべて含まれる
