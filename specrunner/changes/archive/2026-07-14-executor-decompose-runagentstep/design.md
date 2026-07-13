# Design: executor の runAgentStep 概念分解

## Context

`StepExecutor.runAgentStep()` は約440行に以下の3責務が混在している:

1. **実行 context 組立**（`:256-347`）: `projectContext` / rules follow-up prompts / session継続ID / セッションログパス / outputVerification ポリシー / `effectiveResumePrompt` / `AgentRunContext` オブジェクト。制御フローを持たない純粋な組立ブロック。
2. **失敗停止の所作 6 箇所**（`:380` agent throw / `:404` timeout / `:442` non-success / `:472` drift / `:525` output-gate / `:598` commit-fail）: いずれも `ErrorInfo` 組立 → `recordFailedStepResult` → `store.fail` または `transitionJob` → interruption → history → `store.persist` → `attachStateAndRethrow` の手順を手組みしている。
3. **成功確定**（`finalizeStep` `:765-1017`）: artifact 確定・no-op 検出・verdict 導出（`:793-915`）・`StepRun`/history 生成・state persist・lineage 記録。判定（verdict 導出）と副作用（store 操作・event 発行）が混在している。

本 request は execution-ownership ADR（B-13/B-14）の**下地**であり、所有権・挙動を一切変えない構造抽出のみを対象とする。

**制約**:
- `StepHalt` の適用所有者（persist / transition / rethrow）は executor 内に留める（R2 が担う）。
- `store.persist` の呼び出し元を変更しない。
- 失敗経路の disposition（`failed` / `awaiting-resume`）を変更しない。
- history / event の記録順を変更しない。
- `StepExecutor` の公開 API を変更しない。

## Goals / Non-Goals

**Goals**:
- `buildStepContext(step, state, deps, cwd, emitFn)` を新設し context 組立（`:256-347`）を移す。
- `StepHalt` discriminated union を値として導入する。6 箇所の guard を `StepHalt` を**構築**する形へ変換する（適用はそのまま executor 内）。
- `StepCompletion` 型と `deriveStepCompletion` 関数を切り出す（verdict 導出ロジックの抽出）。
- 既存テストの期待振る舞いを変えない（出力・状態・history・Git 差分が同じ）。

**Non-Goals**:
- `StepHalt` の適用所有者を executor から orchestrator へ移動する（R2）。
- `store.persist` の呼び出し元を変更する（R2）。
- fan-out 経路（Pipeline.ts の parallel reviewer 実行）へ変更を波及させる。
- `validateRequiredInputs` の失敗経路を変更する（6 箇所に含まない）。
- 新しい振る舞いや機能を追加する。

## Decisions

### D1: 3 ファイル分割（sibling pattern）

新設ファイルを `src/core/step/` 配下に以下の3つ追加する。既存の `executor-helpers.ts` の sibling pattern に倣う。

| ファイル | 内容 |
|----------|------|
| `step-halt.ts` | `StepHalt` DU 型 + factory 関数 |
| `step-context-builder.ts` | `buildStepContext` 関数 |
| `step-completion.ts` | `StepCompletion` 型 + `deriveStepCompletion` 関数 |

**Rationale**: 機能別に独立したファイルへ分離することで、各概念が単一責務ファイルとなり import graph が明確になる。既存の `executor-helpers.ts` に追記する案は、executor 外で再利用される可能性のある概念（`StepHalt`、`StepCompletion`）を executor 依存ヘルパーと同居させるため却下する。

**Alternatives considered**: 全部 `executor-helpers.ts` に追記 → 異なる抽象レイヤーの概念が混在し、R2 での所有者移動時に分離コストが発生するため却下。

### D2: `buildStepContext` — async 関数、制御フローなし

```typescript
// src/core/step/step-context-builder.ts
export async function buildStepContext(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  cwd: string,
  emitFn: (event: DomainEvent, payload: Record<string, unknown>) => void,
): Promise<AgentRunContext>
```

`executor.ts` の `:256-347` を丸ごと移植し、制御フローを一切持たない。I/O（`readFile` / `resolveStepRules`）は含むが、分岐で挙動を変えるロジックはない。`emitFn` を引数で受け取ることで executor インスタンスへの依存を断ち、単体テスト可能な形にする。

`AgentRunContext.emit` を含む完全な `AgentRunContext` を返す。呼び出し側（executor）は戻り値を `runner.run(ctx)` にそのまま渡す。

**Rationale**: 関数内に制御フローを持たないことで、「この関数が通ると挙動が変わる」という懸念を排除する。`emitFn` を引数化することで executor クラス状態への依存を完全に除去する。

**Alternatives considered**: `emit` は `buildStepContext` の外で構築して ctx にマージする → return 型が `Omit<AgentRunContext, "emit">` になり呼び出し側が複雑になるため却下。

### D3: `StepHalt` — discriminated union + factory 関数

```typescript
// src/core/step/step-halt.ts
export type StepHalt =
  | { kind: "failed"; error: ErrorInfo; thrownErr: Error }
  | {
      kind: "awaiting-resume";
      error: ErrorInfo;
      thrownErr: Error;
      resumePoint: { step: StepName; reason: string; iterationsExhausted: number };
      interruption: { type: "interruption"; reason: string; errorCode?: string };
      statePatch?: { mainCheckoutDrift?: MainCheckoutDrift };
    };
```

**Factory 関数**: `makeAgentThrowHalt`, `makeTimeoutHalt`, `makeNonSuccessHalt`, `makeDriftHalt`, `makeOutputGateHalt`, `makeCommitFailHalt` — 各 guard 箇所に対応。それぞれが `ErrorInfo` を内部で組み立て `StepHalt` を返す。

6 箇所の guard は factory 呼び出しで `StepHalt` を**構築**し、その直後の同一ブロックで**適用**する（persist / transition / rethrow のコードは executor 内に残る）。`applyStepHalt` ヘルパー関数は作らない（適用の所有者移動は R2）。

**Rationale**: 適用を inline に残すことで、挙動の変化ゼロを保証しやすくなる。`StepHalt` は「この guard が何を意味するか」を型で表すだけであり、どう適用するかは executor が決める。R2 で適用者を orchestrator へ移すとき、各 call-site は factory 呼び出しのみ残り、apply は削除するだけになる。

**Alternatives considered**:
- `applyStepHalt` ヘルパーを作り、guard を 1 行にする → R2 での所有者移動がしやすいが、R1 の「挙動不変」確認が複雑になる（新関数のパスを全テストで通す必要がある）ため却下。
- `StepHalt` を例外クラスにする → ADR が値として定義することを rationale で明示しているため却下。

### D4: `StepCompletion` + `deriveStepCompletion` — 判定と副作用の分離

```typescript
// src/core/step/step-completion.ts
export interface StepCompletion {
  verdict: Verdict;
  persistToolResult: (BaseReportResult & { findings?: Finding[] }) | null;
}

export async function deriveStepCompletion(
  step: Step,
  state: JobState,
  deps: PipelineDeps,
  agentResult: { toolResult?: BaseReportResult | null; ... } | undefined,
  permissionScope: PermissionScope | undefined,
): Promise<StepCompletion>
```

`finalizeStep` の `:793-915`（verdict 導出ブロック）を `deriveStepCompletion` へ移植する。`finalizeStep` は `deriveStepCompletion` を呼び出し、受け取った `StepCompletion` を使って後続の side effect（`pushStepResult` / `appendHistory` / `store.persist` / lineage 等）を実行する。

`deriveStepCompletion` は async（`verifyFindingRefs` と `computeExtraScopeFindings` を含む）だが、state の書き込みは行わない。判定（verdict 計算）と副作用（store 操作・event 発行）を分離することで、verdict ロジックを単体テスト可能にする。

**Rationale**: `finalizeStep` は 250 行超の関数であり、verdict 計算ロジックが副作用と混在している。分離により verdict 導出のみのユニットテストが書けるようになり、R2 での orchestrator 移動時に副作用ブロックと計算ブロックを独立して扱える。

**Alternatives considered**: `deriveStepCompletion` に副作用も含める → side effect の所有者が executor から外れる可能性があり、R1 の「所有者変更なし」制約に違反するため却下。

## Risks / Trade-offs

- **[Risk] 6 guard の factory 化での意図しない動作変更**: factory 関数内で `ErrorInfo` を組み立てる際、既存コードと異なるフィールド値を返す可能性がある。→ Mitigation: 各 factory が返す `ErrorInfo` を既存コードと逐一照合した上で実装する。既存テスト（executor-commit-mutex.test.ts 等）が回帰検出として機能する。
- **[Risk] `buildStepContext` への deps.resumePrompt クリアタイミングのずれ**: `ctx.session.resumePrompt` は `buildStepContext` 内で `effectiveResumePrompt` として組み立てられるが、`deps.resumePrompt = undefined` のクリアは ctx 生成後に executor 内で行われる必要がある。→ Mitigation: クリアブロック（`:349-353`）は `buildStepContext` 呼び出し後・`runner.run` 呼び出し前の executor 内に残す。
- **[Risk] `deriveStepCompletion` の async が finalizeStep の呼び出し箇所を変える**: `finalizeStep` は `runAgentStep` と `runCliStep` の2箇所から呼ばれる。CLI step path は `agentResult` が undefined のまま呼ばれるため、`deriveStepCompletion` に agentResult=undefined を渡すパスが正しく処理されることを確認する必要がある。→ Mitigation: `deriveStepCompletion` 内で `agentResult === undefined` の prose-parse path を忠実に再現する。

## Open Questions

なし。request.md の architect 評価済み設計判断により全決定事項が確定している。
