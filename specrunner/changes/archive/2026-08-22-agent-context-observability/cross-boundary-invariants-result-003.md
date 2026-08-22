# Cross-Boundary Invariants Review — agent-context-observability
## Iteration 3

---

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 前周指摘の再確認

前周（iteration 2）で報告した未修正 F-1 / F-3 と、Operator 裁定済み F-2 を現行コードで再確認した。

| 前周 finding | 現在の状態 |
|---|---|
| F-1 medium/fixable — success 経路 contextMetrics が modelUsage ガードに従属 | **修正済み** ✓（commit-orchestrator.ts L262 で `(modelUsage \|\| contextMetrics !== undefined)` に変更） |
| F-2 low/decision-needed — parallel round halt の contextMetrics 廃棄 | Operator 裁定：現状維持。コード変更なし。再指摘なし。 |
| F-3 low/fixable — output-repair ターンの非成功 result / catch で exhaustion 未記録 | **修正済み** ✓（agent-runner.ts L1170–1185 に `else if (message.type === "result")` と catch 内 `markExhaustion` を追加） |

---

## 前周 fixing の修正内容検証

### F-1 修正確認

`src/core/step/commit-orchestrator.ts` L258–279（現行）:

```typescript
// Write when modelUsage is available OR contextMetrics were observed — whichever is present.
// Using `modelUsage &&` alone would silently discard contextMetrics in runs where
// modelUsage happens to be absent (e.g. provider does not return usage on a turn).
if ((modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug) {
  const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
  try {
    await appendInvocation(usageAbsPath, {
      command: "job",
      timestamp: completedAt,
      modelUsage: modelUsage ?? null,
      jobId: state.jobId,
      stepName: step.name,
      ...(invocationMetrics ?? {}),
      ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    });
  } catch {
    // Best-effort
  }
}
```

ガードが `(modelUsage || contextMetrics !== undefined)` に変わり、modelUsage 不在でも contextMetrics があれば `modelUsage: null` entry が書かれる。修正要件を満たす。

### F-3 修正確認

`src/adapter/claude-code/agent-runner.ts` output-repair ループ（L1150–1185 抜粋）:

```typescript
if (message.type === "result" && (message as SDKResultMessage).subtype === "success") {
  // ... modelUsage 更新 ...
} else if (message.type === "result") {
  // agent-context-observability: non-success result — observe for contextWindow
  // and check whether the error indicates context exhaustion (mirrors postWork path).
  const errorResult = message as SDKResultMessage & { errors?: string[] };
  contextObserver.observeResult(errorResult as Record<string, unknown>);
  const errorJoined = (errorResult.errors ?? []).join(" ").trim();
  if (errorJoined) contextObserver.markExhaustion(errorJoined);
}
// ...
} catch (err) {
  if (abortController.signal.aborted) throw err;
  const errText = err instanceof Error ? err.message : String(err);
  contextObserver.markExhaustion(errText);
```

非成功 result と catch 経路の両方で `observeResult` / `markExhaustion` が適切に呼ばれる。postWork path との対称性が回復されている。

---

## 今周確認した不変条件（継続 PASS）

| 不変条件 | 確認結果 |
|---|---|
| TC-019: contextMetrics なし halt は usage.json に書かない | ✓ `halt.contextMetrics !== undefined` ガード（L556）で保持 |
| `usage summary` (aggregateUsage) cost 不変 | ✓ `if (!inv.modelUsage) continue;`（usage-summary.ts L71）でスキップ |
| `job stats` (deriveRunStat) cost 不変 | ✓ `if (inv.modelUsage)` ブロックのみ加算（job-stats.ts L185）でスキップ |
| B-13: CommitOrchestrator が唯一の state 書き込みオーナー | ✓ `commitHalt` への `deps` 引数追加は orchestrator 内の責務拡張であり B-13 の境界を越えない |
| B-2: SDK 型は adapter 内に封じ込める | ✓ `AgentContextMetrics` は kernel 配置（no SDK import）。compact_boundary 解析は adapter-local |
| B-3: shared-kernel は domain を import しない | ✓ `src/kernel/context-metrics.ts` に import 文なし |
| D6: 観測なし invocation では contextMetrics を undefined のままにする | ✓ `createContextObserver.snapshot()` の `hasAnyValue` チェックで保持 |
| Codex / managed adapters が contextMetrics を設定しない | ✓ 両 adapter のコメントと実装で確認（返り値に `contextMetrics` フィールドなし） |
| `apply()` → `commitHalt` に `deps` が渡る | ✓ executor.ts L742 `return this.commitHalt(step, state, result.halt, deps);` |
| `makeAgentThrowHalt` に contextMetrics を渡さない | ✓ runner が throw する前に観測器が存在しないため正しい |

---

## 新規 finding

---

### NEW-1（medium / fixable）— `build-attestation.ts` の cost 計算がリジューム再試行シナリオで壊れる

#### 検出ファイル

`src/core/attestation/build-attestation.ts` L139–190（変更なし）

#### 暗黙の前提（変更前）

`build-attestation.ts` の step loop 内でコードは次の前提を持つ:

```typescript
if (inv.modelUsage === null) {
  // No usage data — cost stays null direction
  stepHasUnpriced = true;
  continue;
}
```

```typescript
if (stepHasUnpriced) {
  stepCostUsd = null;
}
```

これは「`modelUsage === null` は managed runtime 等で usage が取得できなかったことを意味し、そのステップは "unpriced" として扱う」という設計意図に基づく。変更前の world では、halt 経路は usage.json に何も書かなかった（TC-019 invariant）。よって同一 step の entries はすべて同じ origin（managed runtime か local runtime か）を持ち、non-null とnull の混在は発生しなかった。

#### 新しい挙動（F-1 fix 後）

F-1 fix により、contextMetrics を持つ halt entry が `modelUsage: null` で usage.json に書かれるようになった。リジュームシナリオ例:

1. `implementer` が context exhaustion で halt → `commitHalt` が `modelUsage: null, contextMetrics: {...}` の halt entry を append
2. operator が job resume → `implementer` が再実行されて成功 → `commitSuccess` が `modelUsage: {"claude-sonnet-4-5": {...}}` の success entry を append
3. PR 作成時に `buildAttestation` を呼び出す → usage.json に `implementer` の entry が 2 件（null + non-null）

#### 破れる不変条件

`buildAttestation` はこの混在を処理するとき:
- null entry で `stepHasUnpriced = true`
- non-null entry でコストを積算
- ループ後 `if (stepHasUnpriced) { stepCostUsd = null; }` → **積算した成功ラン分のコストをゼロクリア**

設計 D7 には「cost 集計の不変性: `usage summary`（`inv.modelUsage` が falsy なら skip）も `job stats`（値が存在する entry のみ加算）も数値が変わらない」と記述があるが、`build-attestation.ts` は言及されていない。`usage summary` / `job stats` は null entry をスキップするだけ（影響ゼロ）に対し、`build-attestation.ts` は `stepHasUnpriced` フラグを通じてコストをゼロクリアするため動作が異なる。

#### 影響

PR コメントの Attestation における per-step costUsd が、context exhaustion からのリジュームが発生した step において正しい値（最終成功ランのコスト）ではなく `null` と表示される。このシナリオは本 Issue (#1058) の主要解決シナリオである。

#### テストカバレッジの欠落

`tests/unit/core/attestation/build-attestation.test.ts` TC-ATT-06 は「全 entry が `modelUsage: null`」のケースのみ検証する。「同一 step の null entry + non-null entry 混在」（リジュームシナリオ）のケースが存在しない。

#### 修正方針

`build-attestation.ts` で null entry を `stepHasUnpriced = true` とする代わりにスキップのみとする（`usage summary` と同じ扱い）:

```typescript
if (!inv.modelUsage) continue;  // skip; do not mark as unpriced
```

これにより、非 null entry が存在するステップのコストは正しく計算される。全 entry が null の場合は `stepCostUsd` が初期値 `null` のままとなり既存の `TC-ATT-06` 期待値も維持される。合わせて「null entry + non-null entry 混在」の回帰テストを追加する。

---

### NEW-2（low / fixable）— report_result retry ループが非成功 result の `observeResult` / `markExhaustion` を呼ばない

#### 検出ファイル

`src/adapter/claude-code/agent-runner.ts` L1032–1052（変更済みファイルの既存ロジック）

#### 暗黙の前提（postWork path との対称性）

postWork ターン（L1075–1094）では、`runFollowUpQueryWithRetry` の返り値を検査し、非成功 result の場合に:

```typescript
contextObserver.observeResult(followErrorResult as Record<string, unknown>);
const followErrorJoined = (followErrorResult.errors ?? []).join(" ").trim();
if (followErrorJoined) contextObserver.markExhaustion(followErrorJoined);
return { completionReason: "error", ... contextMetrics: contextObserver.snapshot() };
```

を実行する。report_result retry ループ（L1032–1052）は返り値を捨てる:

```typescript
await runFollowUpQueryWithRetry(retryPrompt, retryOptions);
followUpAttempts++;
reportRetry++;
```

#### 破れる不変条件

report_result retry ターン中に context exhaustion が発生した場合:
- `contextObserver.observe(message)` は `runFollowUpQueryWithRetry` 内で呼ばれるため `peakActiveContextTokens` は更新される
- しかし `contextObserver.observeResult()` は呼ばれないため `contextWindowTokens` が error result から取得されない
- `contextObserver.markExhaustion()` は呼ばれないため `exhaustionAtTokens` が設定されない

同一関数 `runFollowUpQueryWithRetry` の使い方に postWork（返り値をチェック）と report_result retry（返り値を捨てる）で非対称がある。F-3 で output-repair loop を修正した今、report_result retry loop だけが唯一の例外になっている。

#### 影響

report_result retry ターンで context exhaustion が起きた場合（稀ではあるが）、`exhaustionAtTokens` が設定されず observability が不完全になる。abort signal 経由でエラーが伝播した場合は outer catch 内の `markExhaustion` が捕捉するため、完全には欠落しない。

#### 修正方針

F-3 fix と同様に、返り値を確認して非成功 result に対し `observeResult` / `markExhaustion` を呼ぶ:

```typescript
const retryResult = await runFollowUpQueryWithRetry(retryPrompt, retryOptions);
followUpAttempts++;
reportRetry++;

if (retryResult && retryResult.subtype !== "success") {
  contextObserver.observeResult(retryResult as Record<string, unknown>);
  const errJoined = ((retryResult as { errors?: string[] }).errors ?? []).join(" ").trim();
  if (errJoined) contextObserver.markExhaustion(errJoined);
}

if (capturedToolResult !== null) break;
if (attempt === retryPolicy.maxAttempts) break;
```

---

## evidence

- 確認ファイル: 15（commit-orchestrator.ts / agent-runner.ts / context-observer.ts / step-halt.ts / executor.ts / kernel/context-metrics.ts / usage/types.ts / usage-show.ts / usage-summary.ts / job-stats.ts / job-show.ts / build-attestation.ts / agent-runner.ts(port) / codex/agent-runner.ts / managed/agent-runner.ts）
- 確認テストファイル: 6（commit-orchestrator-context-metrics.test.ts / commit-orchestrator-usage-metrics.test.ts / agent-runner-context-metrics.test.ts / context-observer.test.ts / build-attestation.test.ts / context-metrics-types.test.ts）
- 確認項目: 25（前周継続 10 + 新規 15）
- skipped: 0
- unverified: 0
