# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/runtime-strategy-convergence/spec.md` — 全 requirement + scenario を確認
- `specrunner/changes/runtime-strategy-convergence/design.md` — D1〜D7 の設計決定と Risk/Trade-offs を確認
- `specrunner/changes/runtime-strategy-convergence/tasks.md` — T-01〜T-14 の受け入れ基準を確認
- `specrunner/changes/runtime-strategy-convergence/test-cases.md` — TC-001〜TC-034 のカバレッジを確認
- `src/core/port/runtime-strategy.ts` — 現行の RuntimeStrategy interface（optional メソッド 10 個）、RealRuntimeStrategy 型エイリアス、derive shim 2 件を確認
- `src/core/command/runner.ts` — CommandRunner の `RuntimeStrategy & PipelineDepsBuilder` 依存、optional guard 2 件（`assertProviderReadiness` 存在確認・`reloadJobState` 存在確認）を確認
- `src/core/command/pipeline-run.ts` — PipelineRunCommand の同依存、`assertNoDuplicateLiveJob?.()` 呼び出しを確認
- `src/core/command/resume.ts` — ResumeCommand の同依存を確認
- `src/core/runtime/factory.ts` — `createRuntime()` の戻り値型 `RuntimeStrategy & PipelineDepsBuilder` を確認
- `src/core/pipeline/runtime-capability-gate.ts` — `canDeriveChangedFiles?.()` optional chaining を確認
- `src/core/runtime/managed.ts` — `ManagedRuntime implements RealRuntimeStrategy`、`reloadJobState` の throw 実装、コメントを確認

### アーキテクチャ確認

- D1〜D7 の設計決定は一貫しており、dependency direction は core/command → core/port の方向を維持している（逆流なし）
- 4 つの named lifecycle capability interface（D1）と RuntimeFacade alias（D2）により、whole-port 依存がなくなり responsibility separation が明確になる
- `Pick<RuntimeStrategy>` ベースの shim を削除し、composition root で explicit binding を行う方針（D4）は設計パターンとして妥当
- ratchet test（D7）は禁止パターンの再導入を CI で検出する適切な防衛機構

### タスク分解カバレッジ確認（completeness - 要件対応）

| 要件（request.md） | 対応タスク |
|--------------------|------------|
| Command lifecycle 契約の明示（§1） | T-02, T-04 |
| Command 層 whole-port 依存撤去（§2） | T-04, T-05, T-06 |
| composition root 型更新（§3） | T-03 |
| fake 都合 optional 撤去（§4） | T-07, T-08 |
| 移行 shim 収束（§5） | T-07, T-09 |
| double cast 撤去（§6） | T-10, T-11 |
| 公開互換性（§7） | D3 で非公開と判断・明示 |
| 振る舞い不変条件（全体） | 各タスクの AC + T-14 gate + TC-016 manual |

受け入れ条件 10 項目のすべてに対応するタスクが存在する。分解漏れなし。

### 正確性確認 — 主要な条件分岐

- `assertProviderReadiness` の存在確認 if ブロック撤去（T-04）: prepare() より前に必ず呼ばれる要件と整合 ✓
- `assertNoDuplicateLiveJob?.()` optional chaining 除去（T-05）: bootstrapJob より前に必ず呼ばれる要件と整合 ✓
- `canDeriveChangedFiles` required 化（T-08、D5）: LocalRuntime / ManagedRuntime 両方が実装済みのため typecheck 破壊なし ✓
- resume path `existingWorktreePath !== undefined` のスキップ条件は維持（T-04） ✓
- Pick-based shim 削除後の `buildDeps()` での直接 bound method 構築（D4, T-09）: LocalRuntime / ManagedRuntime 双方の `listCommitChangedFiles` / `readRevisionContent` は実装済みのため機能上の差異なし ✓

---

## 検証できなかった項目

- `LocalRuntime.reloadJobState` の完全な実装内容（行数の都合でファイル末尾まで読めなかったが、存在と基本動作は confirmed）
- ManagedRuntime が managed new run（resume でない run）を実際にサポートするかどうかの end-to-end 検証（コード上は可能、実際のテストカバレッジ不明）

---

## Findings 詳細

### F-01: design.md Risk 節の `reloadJobState` に関する推論が事実と相違する（HIGH）

**根拠となるファイル確認:**

`managed.ts:611–612`:
```ts
async reloadJobState(_jobId: string, _slug: string, _workspace: ...): Promise<JobState> {
  throw new Error("reloadJobState not implemented for managed runtime");
}
```

`managed.ts:69`:
```ts
export class ManagedRuntime implements RealRuntimeStrategy {
```

`runner.ts:195`:
```ts
if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined) {
```

**問題の詳細:**

`design.md` の Risk 節（`[Risk] ManagedRuntime.reloadJobState は throw を維持する`）は以下のように記述する:

> CommandRunner のスキップ条件 `workspaceOpts.existingWorktreePath === undefined` は維持されるため（resume path では呼ばれない）、実行時に throw する経路はない。

この推論は誤っている。

`workspaceOpts.existingWorktreePath === undefined` が `true` になるのは **run path（新規 run）** であり、resume path（`existingWorktreePath !== undefined`）ではない。条件の向きが逆：
- run path: `existingWorktreePath === undefined` → **条件 true → reloadJobState を呼ぶ**
- resume path: `existingWorktreePath !== undefined` → 条件 false → スキップ

かつ `ManagedRuntime implements RealRuntimeStrategy` であるため `reloadJobState` は定義済み（truthy）。現行コード `if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)` では、managed new run において `this.runtime.reloadJobState`（truthy）AND `existingWorktreePath === undefined`（true）の両条件が成立し、throwing 実装が呼ばれる。

つまり、**managed new run は T-04 適用前の現行コードで既に reloadJobState throw が発生し得る状態**にある。

T-04 の変更（method 存在確認を除去して `if (workspaceOpts.existingWorktreePath === undefined)` のみにする）はこの挙動に対して **behavior-preserving**（現状を維持するだけ）であり、managed new run を新たに壊すものではない。ただし:

1. Risk 節の根拠「throw する経路はない」が事実に反する（resume/run の条件方向を取り違えている）
2. T-12 contract test の記述「ManagedRuntime は呼ばれない想定」も誤り（run path では呼ばれる）
3. `managed.ts:607–608` のコメント「The optional-chaining call in runner.ts uses `?.`」も誤り（実際は `&&` による存在確認）

**影響範囲:**

T-04 実装自体は behavior-preserving なため、コード挙動の regression は発生しない。ただし、誤った前提に基づく Risk 文書とコメントが実装者を誤解させ、以下のリスクが生じる:

- 「throw する経路はない」という誤認識から、managed new run の reloadJobState 挙動の実際の問題（pre-existing bug）が見過ごされる
- T-12 contract test が「ManagedRuntime は呼ばれない」という誤った不変条件を正として記録してしまう

**修正案:**

design.md の Risk 節を以下のように修正する:

> `ManagedRuntime.reloadJobState` は throw を維持するが、managed new run（`existingWorktreePath === undefined`）においては現行コードでも既に呼ばれ throw が発生し得る。T-04 の変更はこの挙動を変えない（behavior-preserving）。managed new run での throw は R2c スコープ外の pre-existing issue として記録し、別途対応する。

T-12 の記述「ManagedRuntime は呼ばれない想定」を削除し、「managed new run では現行同様 reloadJobState が呼ばれ throw する（pre-existing）」と正確に記載する。
