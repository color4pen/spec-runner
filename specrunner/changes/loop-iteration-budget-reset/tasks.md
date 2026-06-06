# Tasks: loop-iteration-budget-reset

## T-01: fresh-episode リセットブロックを `runInternal` に追加

**ファイル**: `src/core/pipeline/pipeline.ts`

`runInternal` の while ループ内、`const nextStep = transition?.to ?? "escalate";` で next step を解決し、terminal 処理ブロック（`if (nextStep === "end" || nextStep === "escalate") { … break; }`）が閉じた **直後**、かつ既存の exhaustion check 群（"Check current loop step exhaustion" / "Check loop exhaustion before entering next loop iteration" / "Check fixer exhaustion before entering fixer step"）の **すべてより前**に、以下のブロックを挿入する:

```ts
// --- Fresh convergence episode reset (fixer-pair loops only) ---
// A loop step that has a dedicated fixer starts a NEW convergence episode whenever
// it is (re-)entered from a step that is NOT its paired fixer (initial arrival,
// conformance re-entry, resume). Reset BOTH the gate's iteration budget and its
// fixer's iteration budget so the new episode gets a fresh maxIterations budget.
// Loops WITHOUT a dedicated fixer (conformance) are intentionally excluded:
// pairedFixerForNext is undefined → their lifetime counter is preserved
// (termination guarantee for whole-phase re-execution).
const pairedFixerForNext = this.loopNames.includes(nextStep as string)
  ? this.loopFixerPairs[nextStep as string]
  : undefined;
if (pairedFixerForNext !== undefined && currentStep !== pairedFixerForNext) {
  loopIters.set(nextStep as string, 0);
  fixerIters.set(pairedFixerForNext, 0);
}
```

- [x] 上記ブロックを指定位置に挿入する。`currentStep` を predecessor、`nextStep` を入場対象 gate として判定する。
- [x] loop entry bookkeeping（loop step 入場時の `prevIter + 1`）は変更しない。リセット後は冒頭の `+1` が iter 1 を生成する。
- [x] fixer entry bookkeeping / 既存 exhaustion check / bypass ロジック / transition table は変更しない。
- [x] `loopFixerPairs` / `loopNames` / `fixerIters` / `loopIters` の宣言や型は変更しない（既存のものを使う）。

**設計上の必須事項**: リセットは `loopIters[gate]` と `fixerIters[pairedFixer]` を **両方** 0 にすること。`loopIters` のみのリセットでは、前 episode で max に達した `fixerIters[pairedFixer]` が fixer entry-guard で fixer を弾くため、受け入れ基準「再入後に build-fixer が起動する」を満たせない（design.md D1 / 根本原因 2 系統を参照）。

**Acceptance Criteria**:
- リセットブロックが next-step 解決後・全 exhaustion check 前に位置する。
- `pairedFixerForNext` が undefined（conformance 等 fixer なし loop、または非 loop step）のときリセットしない。
- predecessor が paired fixer のとき（`build-fixer→verification` 等）リセットしない。
- `bun run typecheck` が型エラーなし。

---

## T-02: 観測バグの回帰テスト（再入で verification が fresh budget を得て build-fixer が起動する）

**ファイル**: `tests/core/pipeline/pipeline.test.ts`（または `tests/unit/core/pipeline/` 配下の新規ファイル）

TC-069 と同様に、専用の executor spy と Pipeline インスタンスをインラインで構築する（共有 `buildMockPipeline` を改変しなくてよい。改変する場合は既存テストの green を保つこと）。`maxIterations = 2`、`loopNames` と `loopFixerPairs` は標準構成（spec-review/verification/code-review それぞれの fixer pair を含む）。`startStep` は `"implementer"` とし、design / spec-review / test-case-gen を省略してよい（state に `branch` を設定しておく）。

driver シーケンス（call count で分岐する executor を用意する）:

- episode 1: `implementer` → `verification`(failed) → `build-fixer` → `verification`(failed) → `build-fixer` → `verification`(passed)。これで episode 1 終了時点に `fixerIters[build-fixer]` と `loopIters[verification]` が max 相当まで進む前提を作る。
- `verification`(passed) → `code-review`(approved, fixable なし) → `conformance`(needs-fix)。
- `conformance`(needs-fix) → `implementer`(2 回目) → `verification` 再入。
- 再入後の `verification`(failed, fixable) → `build-fixer`(3 回目) → `verification`(passed) → `code-review`(approved) → `conformance`(approved) → `adr-gen` → `pr-create` → end。

- [x] verification / build-fixer / code-review / conformance を call count で分岐させる executor を用意する。
- [x] 各 step 結果は `state.steps[step]` に attempt 付き `StepRun` を append する形で返す（既存テストの結果生成パターンに合わせる）。
- [x] アサーション: build-fixer が **3 回** 呼ばれる（再入後にも起動）。
- [x] アサーション: 最終 `result.status === "awaiting-archive"`（escalate せず完走）。
- [x] アサーション: `result.error?.code` が `"VERIFICATION_RETRIES_EXHAUSTED"` で **ない**こと（再入時に即 exhaust していない）。

**Acceptance Criteria**:
- このテストは T-01 適用前は失敗する（再入時に build-fixer が起動せず escalate するため）。
- T-01 適用後に pass する。

---

## T-03: 停止性の回帰テスト（conformance は lifetime counter を保ち maxIterations 回で exhaust）

**ファイル**: T-02 と同じテストファイル

`maxIterations = 2`、標準 `loopNames` / `loopFixerPairs`。`startStep = "implementer"`。verification と code-review は毎回 pass / approved（fixable なし）させ、conformance のみ毎回 `needs-fix` を返す executor を用意する。

driver シーケンス:

- `implementer` → `verification`(passed) → `code-review`(approved) → `conformance`(needs-fix, iter1) → `implementer` → `verification`(passed) → `code-review`(approved) → `conformance`(needs-fix, iter2 = maxIterations) → exhaust → escalate。

- [x] verification 常に passed、code-review 常に approved（fixable 0）、conformance 常に needs-fix の executor を用意する。
- [x] アサーション: `result.error?.code === "CONFORMANCE_RETRIES_EXHAUSTED"`。
- [x] アサーション: `result.status === "awaiting-resume"`。
- [x] アサーション: conformance が **正確に 2 回**（= maxIterations 回）呼ばれる（無限ループせず、fixer-pair の episode リセットに巻き込まれて lifetime counter が失われていない）。

**Acceptance Criteria**:
- conformance の lifetime counter がリセットされず、`maxIterations` 回で停止する。
- conformance を誤ってリセット対象に含める実装（無限ループ）ではこのテストが（vitest timeout / 呼び出し回数超過で）失敗する。

---

## T-04: 単一 episode 内の exhaustion / 継続カウントが不変であることの確認

**ファイル**: T-02 と同じテストファイル（新規テスト 1 件）＋既存テスト群

新規テスト（verification の単一 episode 内 exhaustion）: `maxIterations = 2`、標準構成、`startStep = "implementer"`。implementer → verification が毎回 failed、build-fixer が毎回 fix 失敗（verification は再び failed）。fixer 最終 iter 後の bypass review まで含めて、同一 episode 内で従来通り escalate することを確認する。

- [x] 同一 episode（`build-fixer↔verification` の周回）では verification の iteration counter が継続加算され、`maxIterations`（+ bypass の +1）到達で `VERIFICATION_RETRIES_EXHAUSTED` escalate することをアサートする。
- [x] 既存の loop-budget / bypass 関連テストが green であることを確認する: `tests/core/pipeline/pipeline.test.ts`（TC-062 / TC-063 / TC-069 等）、`tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts`、`tests/unit/core/pipeline/pipeline.transitions.test.ts`。

**Acceptance Criteria**:
- 単一 episode 内では予算が継続カウントされ、従来と同じ周回数で exhaust する（requirement 5 / 受け入れ基準「単一 episode 内の exhaustion 挙動が不変」）。
- 既存の bypass / exhaustion テストが regression していない。

---

## T-05: 最終検証

- [x] `bun run typecheck` が型エラーなし。
- [x] `bun run test` が全 green（新規テスト T-02 / T-03 / T-04 を含む）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。

---

## 受け入れ基準（request.md 対応チェックリスト）

- [x] fixer-pair loop（verification / code-review / spec-review）の gate に loop 外（非 fixer の直前 step）から到達すると iteration counter が 0 から始まる（T-01）。
- [x] fixer から gate に戻った場合は counter が継続する（同一 episode で `maxIterations` 超で exhaust）（T-01 / T-04）。
- [x] conformance→implementer→verification の再入で verification が fresh budget を得て build-fixer が起動する（T-02）。
- [x] conformance（fixer なし）は lifetime counter を保ち `maxIterations` 回後に escalate する（T-03）。
- [x] 単一 episode 内の exhaustion 挙動が不変（T-04）。
- [x] `bun run typecheck && bun run test` が green（T-05）。
