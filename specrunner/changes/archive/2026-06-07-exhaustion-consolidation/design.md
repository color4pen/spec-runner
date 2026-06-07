# Design: ループ枯渇判定を1箇所に集約する

## Context

`Pipeline.runInternal`（`src/core/pipeline/pipeline.ts`）のメインループには「iteration counter が `maxIterations` に達したら `handleExhausted` を呼んでループを抜ける」枯渇判定が3箇所インラインで存在する。各箇所は同じ末尾アクション（`pipeline:iteration:exhausted` emit → `handleExhausted` → `printPipelineFinished` → `break`）を持つが、判定条件と対象 step が微妙に異なる。

3箇所の現状（行番号は現行コード）:

- **Site A — current-loop exhaustion（~L329-341）**: 対の fixer を持たない loop step（例: conformance）が needs-fix を返したとき。`loopIters[currentStep] >= maxIterations` を判定。emit step = `currentStep`、emit iteration = `currentLoopIter`、`handleExhausted(currentStep, "review-exhausted")`。
- **Site B — next-loop exhaustion（~L343-366）**: 次に loop step へ入る前。`loopIters[nextStep] >= maxIterations` を判定。ただし対の fixer が上限到達済み（`fixerIters[pairedFixer] >= maxIterations`）なら +1 review を許す bypass がある。bypass しない場合 emit step = `nextStep`、emit iteration = `nextLoopIter`、`handleExhausted(nextStep, "review-exhausted")`。
- **Site C — fixer exhaustion（~L368-383）**: 次に fixer step へ入る前。`fixerIters[nextStep] >= maxIterations` を判定。対の reviewer（`pairedReview`）を枯渇 step として扱い、emit step = `pairedReview`、emit iteration = `maxIterations`、`handleExhausted(pairedReview, "review-after-final-fix")`。

枯渇判定に関わる `>= maxIterations` 比較は計4箇所（Site A の1つ、Site B の loop 比較 + bypass 比較の2つ、Site C の1つ）あり、すべてメインループ本体にインライン展開されているため、ループ制御の全体像が読みにくい。

### 制約

- `maxIterations` の値やループ戦略は変更しない。
- `handleExhausted` のロジック（escalation verdict 上書き / awaiting-resume 遷移 / resumePoint 記録 / `LOOP_ERROR_CODES` 参照）は変更しない。本変更は呼び出し方の集約のみ。
- `LOOP_ERROR_CODES` は変更しない。
- 既存の枯渇関連テスト（TC-012 / TC-016 / TC-061 / TC-063 / TC-069 等）が観測する挙動（error code / exhaustionPhase / `pipeline:iteration:exhausted` payload / iteration 回数 / 状態遷移）を一切変えない。

## Goals / Non-Goals

**Goals**:

- 枯渇判定（`>= maxIterations` の閾値比較 + 共通末尾アクション）を `Pipeline` の単一 private メソッドに集約する。
- 3箇所の枯渇インラインを、その単一メソッド呼び出しに置き換える。
- メインループ本体から `>= this.maxIterations` のインライン比較（bypass 比較を含む計4箇所）を消す。
- 既存の枯渇挙動を完全に保持する（escalation verdict 上書き / awaiting-resume 遷移 / resumePoint 記録 / emit payload / iteration 回数）。

**Non-Goals**:

- `maxIterations` の値・解決ロジック・ループ戦略の変更。
- `handleExhausted` 内部ロジックの変更。
- `LOOP_ERROR_CODES` の変更。
- transition table・episode reset・fixer/loop counter の bookkeeping ロジックの変更。

## Decisions

### D1: 枯渇判定を担う単一 private メソッド `tryExhaust` を導入する

`Pipeline` に次のシグネチャの private メソッドを追加する（メソッド名・パラメータ名は実装時に微調整可）:

```
private async tryExhaust(
  state: JobState,
  deps: PipelineDeps,
  opts: {
    iteration: number;          // maxIterations と比較する counter
    stepName: string;           // 枯渇とみなす loop/reviewer step（emit + handleExhausted 共通）
    phase: "review-exhausted" | "review-after-final-fix";
    reportIteration?: number;   // emit する iteration 値（既定: iteration）
    bypassIteration?: number;   // 定義され >= maxIterations のとき枯渇を抑止（fixer bypass）
  },
): Promise<{ exhausted: boolean; state: JobState }>
```

メソッドの責務:

1. `opts.iteration < this.maxIterations` なら `{ exhausted: false, state }` を返す（枯渇なし）。
2. `opts.bypassIteration` が定義され `opts.bypassIteration >= this.maxIterations` なら `{ exhausted: false, state }` を返す（bypass: +1 review を許す）。
3. 上記以外（枯渇）: `pipeline:loop:exhausted` 診断ログ → `pipeline:iteration:exhausted` を `{ step: stepName, iteration: reportIteration ?? iteration, maxIterations }` で emit → `handleExhausted(state, deps, stepName, phase)` → `printPipelineFinished` → `{ exhausted: true, state: <新 state> }` を返す。

- **Rationale**: 3箇所の共通部分は「閾値比較 → emit → handleExhausted → printPipelineFinished」という一連の流れである。これを1メソッドに閉じ込めると、メインループには「どの counter を / どの step として / どの phase で」判定するかの差分（呼び出し引数）だけが残り、ループ制御の全体像が読める。判定の意味（>= maxIterations）と副作用（emit/遷移/summary）が1箇所に集まるため、将来の loop 追加時も呼び出し1行で済む。
- **3箇所で `stepName` が emit と `handleExhausted` の両方に一致する点を利用**: 現行 Site A/B/C いずれも「emit する step」と「`handleExhausted` に渡す step」が同一（A=currentStep, B=nextStep, C=pairedReview）。よって単一の `stepName` で両者を表現でき、引数が増えない。
- **Alternatives considered**:
  - 共通末尾アクションだけをメソッド化し、`>= maxIterations` 比較は呼び出し側に残す案: 受け入れ基準「メインループからインラインの maxIterations 比較が消える」を満たさない。却下。
  - 3つの専用メソッド（`exhaustCurrentLoop` / `exhaustNextLoop` / `exhaustFixer`）に分割する案: 共通末尾が3回重複し「1箇所に集約」の主旨に反する。却下。

### D2: bypass 比較も `bypassIteration` パラメータでメソッドへ移す

Site B の fixer bypass は現状 `(fixerIters.get(pairedFixer) ?? 0) >= this.maxIterations` というインライン比較である。これを呼び出し側で計算すると `>= maxIterations` 比較がメインループに残ってしまうため、bypass の判定（`>= maxIterations`）も `tryExhaust` 内に移す。呼び出し側は raw counter 値（`fixerIters.get(pairedFixer) ?? 0`、対の fixer が無ければ `undefined`）を `bypassIteration` として渡すだけにする。

- **Rationale**: 受け入れ基準は「インラインの maxIterations 比較が消える」を要求する。bypass 比較も maxIterations 比較なので、メソッド内へ移すことで4箇所すべてを集約でき、基準を完全に満たす。bypass は「枯渇に達したが対 fixer も上限のため +1 を許す」という枯渇判定の一部であり、`tryExhaust` の責務に自然に収まる。
- **Alternatives considered**:
  - bypass を boolean で受け取る案: boolean を作るのに呼び出し側で `>= maxIterations` 比較が必要になり、基準を満たさない。却下。

### D3: ループ終了（`break`）は呼び出し側に残す

`tryExhaust` はループを `break` できない（メソッド境界を越えられない）。呼び出し側で結果を受け、`if (result.exhausted) { state = result.state; break; }` の形でループを抜ける。

- **Rationale**: 枯渇時にメインループを抜ける制御は table-driven ループの構造そのものに属する。`break` を呼び出し側に残すことで、ループ制御の所在が明確になり、メソッドは「判定 + 副作用 + 新 state 返却」という純粋な責務に保てる。`state` の引き継ぎ（`state = result.state`）も呼び出し側で明示する。
- **Alternatives considered**:
  - 例外で大域脱出する案: 通常制御フローに例外を使うのは可読性・デバッグ性を損なう。却下。

### D4: emit する iteration 値を `reportIteration` で厳密保持する

Site C は現状 `pipeline:iteration:exhausted` の `iteration` に `this.maxIterations` を渡している（比較対象は `fixerIters[nextStep]`）。枯渇は `fixerIters[nextStep] >= maxIterations` の瞬間に発火し、fixer counter は entry 前ゲートで増分されるため発火時点の値は `maxIterations` に等しいが、emit 値を byte 単位で現行と一致させるため Site C では `reportIteration: this.maxIterations` を明示的に渡す。Site A/B は `reportIteration` 省略（既定で比較 counter と同値を emit、現行と一致）。

- **Rationale**: 「挙動変更なし」を厳密に守るため、観測可能な event payload を現行と完全一致させる。`reportIteration` を optional にすることで Site A/B は引数増なしで現行どおり、Site C のみ明示指定で現行どおりにできる。

### D5: `pipeline:loop:exhausted` 診断ログを3箇所で統一する

Site A/B は枯渇時に `logPipelineDiag("pipeline:loop:exhausted", ...)` を出すが、Site C には無い。`tryExhaust` は枯渇時に常にこの診断ログを出すため、Site C にも診断ログが1行追加される。

- **Rationale**: `logPipelineDiag` は `SPECRUNNER_DEBUG=pipeline` かつ debug ログレベルでのみ出力され、それ以外では完全な no-op である。テストはこの env を設定しないため全テストで出力されず、観測可能な機能挙動（state / event / stdout / テスト）への影響は皆無。一方で集約後の診断は3箇所で一貫し、デバッグ時の枯渇トレースが揃う。これは機能挙動の変更ではなく診断出力の一貫性向上であり、「挙動変更なし」の制約（escalation / awaiting-resume / resumePoint / event / テスト）に抵触しない、本変更で唯一意図的に揃える差分である。
- **Alternatives considered**:
  - Site C だけ診断ログを抑止するフラグ（`diag?: boolean`）を `tryExhaust` に追加する案: 既存の不一致を再現するためだけの引数となり、集約の主旨（一貫化）に反する。診断が test-invisible である以上、揃える方が望ましい。却下。

## Risks / Trade-offs

- [呼び出し側で `state = result.exhausted` 後の state 引き継ぎ忘れ] `tryExhaust` が新 state を返すため、呼び出し側で `state` への再代入を忘れると枯渇 state が捨てられる。→ **Mitigation**: 返り値を `{ exhausted; state }` の単一オブジェクトにし、`if (result.exhausted) { state = result.state; break; }` の定型で3箇所を統一。既存の枯渇テスト（error code / status / resumePoint を検証）が引き継ぎ漏れを検出する。

- [bypass ロジックの等価性] Site B の bypass を `bypassIteration` 経由に移す際、「`iteration >= max` かつ `bypassIteration >= max` のときのみ抑止」という条件順序を誤ると +1 review の挙動が崩れる。→ **Mitigation**: TC-012 / TC-061 が +1 bypass（spec-review / code-review 3 iteration）と最終 `review-after-final-fix` を検証しており、回帰を捕捉する。

- [Site C への診断ログ追加] D5 のとおり `SPECRUNNER_DEBUG=pipeline` 時のみ1行増える。→ **Mitigation**: 機能挙動・テストに影響しないことを明記。通常実行・全テストで no-op。

## Open Questions

なし。
