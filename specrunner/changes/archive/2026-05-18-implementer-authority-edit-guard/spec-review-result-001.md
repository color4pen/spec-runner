# Spec Review Result: implementer-authority-edit-guard

- **reviewer**: spec-review (local)
- **date**: 2026-05-18
- **verdict**: approved

## Summary

request.md → design.md → tasks.md → delta spec の一貫性は高く、実コードの構造とも整合する。`commitAndPush` 内に prefix-based guard を挿入する設計は、CliStep が自然に影響外となる既存構造を活かしており、追加のホワイトリストや例外分岐が不要な点で堅実。

## Findings

### F-01: tasks.md に request TC-AUTH-05 (CliStep regression test) が欠落 — MEDIUM

**観測**: request.md は TC-AUTH-05 として「CliStep (= kind="cli") は `commitAndPush` を通らず authority 編集が許可される (= 既存挙動 regression なし)」を明示的に要求している。しかし tasks.md では TC-AUTH-05 が「通常 step (authority spec なし) は既存挙動維持」に差し替わっており、request の TC-AUTH-06 に対応。CliStep regression test は tasks のどこにも出現しない。

**影響**: implementer が tasks.md のみを参照して実装した場合、request 受け入れ基準の 1 つを満たさない可能性がある。ただし design.md が CliStep 除外の構造的根拠を明記しており、テスト対象は既存挙動（新規コードではない）であるため実害は限定的。

**推奨**: tasks T-06 に TC-AUTH-05 相当（CliStep が `commitAndPush` を通らないことの regression test）を追加するか、T-07 の integration test で CliStep 経路を明示的にカバーする。implementer が request.md の受け入れ基準を参照すれば自力で補完可能な範囲。

### F-02: delta spec scenario の `requiresCommit` 条件が冗長 — LOW

**観測**: delta spec の Scenario "Staged commit with authority spec path is rejected" が `requiresCommit: true` を GIVEN に含むが、staged commit path（`hasChanges === true`）に `requiresCommit` は影響しない。guard は staged 変更があれば `requiresCommit` の値に関わらず発火する。

**影響**: 仕様として誤りではないが、`requiresCommit` が guard 発火条件であるかのような誤読を招く可能性がある。

**推奨**: scenario の GIVEN から `requiresCommit: true` を削除し、「an AgentStep completes with staged changes under local runtime」に簡素化するとよい。修正不要でも動作に影響なし。

### F-03: 設計判断・prefix 区別の妥当性 — INFO (positive)

`specrunner/specs/` vs `specrunner/changes/*/specs/` の prefix 区別は `git diff --name-only` が repo root 相対の正規化パスを返す性質に依存しており、path traversal (`../`) や encoding trick の余地がない。defense-in-depth として適切。

### F-04: Error factory の引数設計 — INFO (positive)

`authoritySpecEditViolationError(stepName, violatedPaths)` は違反 path を列挙する設計で、agent/user 双方がどのファイルを delta spec 経由にすべきか即座に判断できる。既存 `SpecRunnerError` パターンとの整合性も高い。

## Cross-reference Matrix

| request requirement | design | tasks | delta spec |
|---|---|---|---|
| 1. executor で authority 編集 reject | Guard 挿入点 + pseudo-code | T-02 | Requirement + Scenario 1,3 |
| 2. delta spec 編集の正常許可 | prefix 区別説明 | T-02 (暗黙) + T-06 TC-AUTH-02 | Scenario 2 |
| 3. CliStep 例外扱い | CliStep は影響外 | **欠落 (F-01)** | Scenario 5 |
| 4. prompt 補強 | authority-spec-guard.ts | T-03, T-04, T-05 | — (prompt は spec 外) |
| 5. test | Component Structure | T-06, T-07 | — |
| 6. spec authority 反映 | Delta Spec 言及 | — (暗黙) | ADDED Requirement 1 件 |

## Security Assessment

- **Path injection**: `git diff --name-only` は正規化パスを返すため bypass 不可
- **Guard bypass**: `commitAndPush` は `runAgentStep` からのみ呼ばれ、CliStep は `runCliStep` で別経路。agent が `StepExecutor` を迂回する経路は存在しない
- **Prompt injection による回避**: prompt 補強は補助策であり、executor 側の機械的 reject が本体。prompt を無視しても guard で catch される defense-in-depth 設計
- **Overall**: セキュリティ上の懸念なし
