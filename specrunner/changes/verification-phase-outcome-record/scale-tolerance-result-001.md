# Scale-Tolerance Review: verification-phase-outcome-record

**Reviewer**: scale-tolerance  
**Iteration**: 1  
**Verdict**: approved (no findings)

---

## Scope

時間とともに単調増加するオブジェクト（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードがないかを検査した。

---

## 確認項目と証拠

### 1. `fold()` — events.jsonl の全行走査

**ファイル**: `src/store/event-journal.ts:264-409`

`fold()` は単一ジョブの `events.jsonl` を行単位で走査（O(N) in journal lines）。  
新規追加は `step-attempt` レコードの outcome 構築時の conditional spread 1 行のみ（line 380）:

```ts
...(r.outcome.verificationPhases !== undefined ? { verificationPhases: r.outcome.verificationPhases } : {}),
```

これは 1 レコードあたり O(k)（k = phase 数、最大 6 固定 phase または user 設定 commands 数）。  
外側ループの追加なし。全体の計算量は変わらず O(N in journal lines)。

### 2. `stepRunToRecord()` — シリアライズ時

**ファイル**: `src/store/event-journal.ts:441-463`

1 つの conditional spread 追加のみ。O(1)。

### 3. `pushStepResult()` — 状態への書き込み

**ファイル**: `src/state/helpers.ts:127-168`

`state.steps[stepName]` への dictionary lookup + conditional spread 1 行追加。  
既存ステップ配列をスキャンしない。O(1)。

### 4. `projectSuccess()` — 成功結果の in-memory 投影

**ファイル**: `src/core/step/commit-orchestrator.ts:115-141`

destructuring + conditional spread のみ。O(1)。

### 5. `VerificationStep.run()` の phases 投影

**ファイル**: `src/core/step/verification.ts:55-59`

```ts
const verificationPhases = verificationResult.phases.map((p) => ({
  phase: p.phase,
  status: p.status,
  exitCode: p.exitCode,
}));
```

`verificationResult.phases` のサイズ = 実行フェーズ数（standard: 最大 6、commands path: ユーザー設定数）。  
ジョブ総数・archive 件数に比例しない。O(k) per iteration、k は固定上界。

### 6. `runCliStep()` でのキャプチャ

**ファイル**: `src/core/step/executor.ts:620`

```ts
const verificationPhases = cliRunResult?.verificationPhases;
```

single property access。O(1)。

### 7. journal データサイズの増加量

各 verification iteration の `step-attempt` レコードに追加されるデータ:
- 構造: `{ phase: string, status: string, exitCode: number|null }` × phases
- D3 設計決定により stdout / stderr / durationMs / skippedCount は除外
- 標準 phase 最大 6 件 × ~50 bytes ≈ 300 bytes/iteration

ジョブあたりの増加: `iteration_budget × 300 bytes`（iteration_budget は設定で上界あり）。  
archive 件数・ジョブ総数に比例しない。

### 8. verification.commands path でのコマンド数

ユーザーが多数のコマンドを設定した場合でも:
- 格納データは phase 名・status・exitCode のみ（stdout/stderr なし）
- コマンド数はユーザー設定で上界あり（時間単調増加ではない）
- 1 コマンドあたり ~50 bytes の追加で journal 肥大化は軽微

### 9. クロスジョブ走査・API 呼び出し

変更対象のコードパス（types.ts / helpers.ts / event-journal.ts / executor.ts / commit-orchestrator.ts / verification.ts）にクロスジョブスキャン・GitHub API 呼び出し・sidecar ファイル走査の追加なし。

---

## 証拠サマリ

| 対象 | 計算量変化 | スケール懸念 |
|------|-----------|------------|
| `fold()` in event-journal.ts | O(N) → O(N)（内部定数追加のみ） | なし |
| `stepRunToRecord()` | O(1) → O(1) | なし |
| `pushStepResult()` | O(1) → O(1) | なし |
| `projectSuccess()` | O(1) → O(1) | なし |
| `VerificationStep.run()` phases 投影 | O(k) 新規追加（k ≤ phase 数、上界あり） | なし |
| journal per-job データ増加 | ~300 bytes/iteration（上界あり） | なし |
| クロスジョブ走査 | なし | — |
| GitHub API 追加呼び出し | なし | — |

---

## 結論

全確認項目でスケール上の問題なし。  
新規データは per-job・per-iteration で上界を持ち、archive 件数・ジョブ総数・issue/PR 件数に比例して成長するコードパスは存在しない。Findings: 0。
