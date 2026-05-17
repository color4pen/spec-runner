# Tasks: code-fixer-final-iter-reviewed

## [x] T-01: `ResumePoint` に `exhaustionPhase` を追加

**ファイル**: `src/state/schema.ts`

`ResumePoint` interface に optional field を追加:

```typescript
export interface ResumePoint {
  step: StepName;
  reason: string;
  iterationsExhausted: number;
  /** Diagnostic: distinguishes "fixer ran to completion then review rejected" from "review exhausted before fixer max". */
  exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
}
```

既存の field は一切変更しない。optional なので旧 state file との互換性を維持する。

---

## [x] T-02: Pipeline constructor に `loopFixerPairs` を追加

**ファイル**: `src/core/pipeline/pipeline.ts`

### 2-a: constructor param 追加

```typescript
constructor(params: {
  steps: Map<string, Step>;
  transitions: Transition[];
  maxIterations: number;
  executor: StepExecutor;
  events: EventBus;
  loopName?: string;
  loopNames?: string[];
  loopFixerPairs?: Record<string, string>;  // review → fixer mapping
}) {
  // ...existing...
  this.loopFixerPairs = params.loopFixerPairs ?? {};
}
```

### 2-b: private field 追加

```typescript
/** Mapping: review step name → paired fixer step name. */
private readonly loopFixerPairs: Record<string, string>;
```

### 2-c: `fixerIters` Map 追加

`runInternal` method 内、`loopIters` 宣言の直後に:

```typescript
const fixerIters = new Map<string, number>();
```

---

## [x] T-03: fixer 入場時の iter tracking を追加

**ファイル**: `src/core/pipeline/pipeline.ts`

`runInternal` の「Loop step entry bookkeeping」ブロック（line 150-170）の直後に、fixer 入場時の bookkeeping を追加する:

```typescript
// --- Fixer step entry bookkeeping ---
const isFixer = Object.values(this.loopFixerPairs).includes(currentStep);
if (isFixer) {
  const prevFixerIter = fixerIters.get(currentStep) ?? 0;
  fixerIters.set(currentStep, prevFixerIter + 1);
}
```

この位置は step 実行前（execute 呼び出し前）であること。

---

## [x] T-04: exhaustion check を改訂

**ファイル**: `src/core/pipeline/pipeline.ts`

`pipeline.ts:276-295` の exhaustion check ブロックを以下に置換:

```typescript
// --- Check loop exhaustion before entering next loop iteration ---
if (this.loopNames.includes(nextStep as string)) {
  const nextLoopIter = loopIters.get(nextStep as string) ?? 0;
  if (nextLoopIter >= this.maxIterations) {
    // Check bypass: fixer's final iter just completed → allow one more review
    const pairedFixer = this.loopFixerPairs[nextStep as string];
    const cameFromFixer = pairedFixer !== undefined && currentStep === pairedFixer;
    const fixerAtMax = cameFromFixer && (fixerIters.get(pairedFixer) ?? 0) >= this.maxIterations;

    if (!fixerAtMax) {
      // Conventional exhaustion (no fixer bypass)
      stdoutWrite(`[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted, escalating\n`);
      state = await this.handleExhausted(state, nextStep as string, "review-exhausted");

      if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
        const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
        const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
        stdoutWrite(
          `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
        );
      }
      break;
    }
    // else: bypass — allow the +1 review iteration (fixer final iter review)
  }
}

// --- Check fixer exhaustion before entering fixer step ---
const fixerNames = new Set(Object.values(this.loopFixerPairs));
if (fixerNames.has(nextStep as string)) {
  const nextFixerIter = fixerIters.get(nextStep as string) ?? 0;
  if (nextFixerIter >= this.maxIterations) {
    // Fixer exhausted: the review that triggered this needs-fix has already used the bypass
    // This path means: review (+1) → needs-fix → code-fixer (blocked)
    // Find the paired review for this fixer to escalate properly
    const pairedReview = Object.entries(this.loopFixerPairs)
      .find(([_, fixer]) => fixer === nextStep)?.[0];
    const exhaustedLoopName = pairedReview ?? nextStep as string;
    stdoutWrite(`[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted, escalating\n`);
    state = await this.handleExhausted(state, exhaustedLoopName, "review-after-final-fix");

    if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
      const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
      const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
      stdoutWrite(
        `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
      );
    }
    break;
  }
}
```

**設計ノート**: bypass 後の review が needs-fix を返した場合、transition table は `code-review --needs-fix→ code-fixer` に従うが、fixer gate で弾かれて escalate する。これにより bypass は構造的に 1 回のみ。

---

## [x] T-05: `handleExhausted` に `exhaustionPhase` パラメータを追加

**ファイル**: `src/core/pipeline/pipeline.ts`

### 5-a: method signature 変更

```typescript
private async handleExhausted(
  state: JobState,
  exhaustedLoopName: string = this.loopName,
  exhaustionPhase?: "review-after-final-fix" | "review-exhausted",
): Promise<JobState>
```

### 5-b: `resumePoint` に `exhaustionPhase` を追加

`transitionJob` 呼び出し内の `patch.resumePoint` に field を追加:

```typescript
resumePoint: {
  step: exhaustedLoopName as StepName,
  reason: errorShape.message(this.maxIterations),
  iterationsExhausted: this.maxIterations,
  ...(exhaustionPhase && { exhaustionPhase }),
},
```

---

## [x] T-06: `run.ts` に `loopFixerPairs` を渡す

**ファイル**: `src/core/pipeline/run.ts`

`createPipeline` 関数（line 54-62）の Pipeline constructor 呼び出しに `loopFixerPairs` を追加:

```typescript
return new Pipeline({
  steps,
  transitions: STANDARD_TRANSITIONS,
  maxIterations,
  executor,
  events: bus,
  loopName: STEP_NAMES.SPEC_REVIEW,
  loopNames: [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW],
  loopFixerPairs: {
    [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
    [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
    [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  },
});
```

`STEP_NAMES` 定数を使う（リテラル文字列ではなく）。

---

## [x] T-07: TC-061 を新 semantic で書き換え

**ファイル**: `tests/pipeline-integration.test.ts`

### 7-a: TC-061 の既存テストを更新

TC-061 は `maxRetries: 2` で code-review が 2 回 needs-fix を返すシナリオ。
新 semantic では fixer 最終 iter 後に review +1 回が走るため:

- `codeReviewVerdicts` を `["needs-fix", "needs-fix", "needs-fix"]` に変更（3 回目の review も needs-fix で escalation）
- `sessionIds` に `sess_code_fixer_002` と `sess_code_review_003` を追加
- assertion を更新:
  - `codeReviewArr?.length` → `3`（2 ではなく）
  - 最終 verdict は `"escalation"`（変更なし）
  - `result.error?.code` → `"CODE_REVIEW_RETRIES_EXHAUSTED"`（変更なし）
  - `result.status` → `"awaiting-resume"`（変更なし）
  - `result.resumePoint?.exhaustionPhase` → `"review-after-final-fix"` を追加

### 7-b: mock client に session ID とverdict を追加

`buildPipelineMockClient` / `buildMockGithubClient` の呼び出し引数を上記に合わせる。

---

## [x] T-08: 新 TC — fixer 最終 iter 後の review が approve → 完走

**ファイル**: `tests/pipeline-integration.test.ts`

TC-061 の直後に新テストを追加:

```typescript
// TC-XXX: code-fixer final iter → code-review (+1) approved → awaiting-merge
describe("TC-XXX: code-fixer final iter reviewed — approved path", () => {
  it("allows +1 review iteration after fixer final iter, completes on approval", async () => {
    // maxRetries = 2
    // code-review iter 1: needs-fix → code-fixer iter 1
    // code-review iter 2: needs-fix → code-fixer iter 2 (final)
    // code-review iter 3 (+1 bypass): approved → pr-create → end
    // assertions:
    //   - result.status === "awaiting-merge"
    //   - codeReviewArr.length === 3
    //   - codeFixerArr.length === 2
    //   - last code-review verdict === "approved" (not escalation)
  });
});
```

`codeReviewVerdicts: ["needs-fix", "needs-fix", "approved"]`、`sessionIds` に fixer 2 回 + review 3 回分を含める。

---

## [x] T-09: 新 TC — spec-review / spec-fixer pair で同挙動

**ファイル**: `tests/pipeline-integration.test.ts`

spec-review ↔ spec-fixer pair で fixer 最終 iter 後に review +1 が走るテスト:

- `maxRetries: 2`
- `specReviewVerdicts: ["needs-fix", "needs-fix", "approved"]`
- assertions: `specReviewArr.length === 3`, `specFixerArr.length === 2`, `result.status` が後段に進む

---

## [x] T-10: 新 TC — verification / build-fixer pair で同挙動

**ファイル**: `tests/pipeline-integration.test.ts`

verification ↔ build-fixer pair で fixer 最終 iter 後に verification +1 が走るテスト:

- `maxRetries: 2`
- verification が 2 回 `failed`、build-fixer が 2 回走った後、verification +1 が `passed` で完走
- assertions: verification が 3 entries、build-fixer が 2 entries

---

## [x] T-11: 新 TC — fixer 不在の loop step は従来挙動を維持

**ファイル**: `tests/core/pipeline/pipeline.test.ts`

`loopFixerPairs` に pair が定義されていない loop step の exhaustion が従来通り `maxIterations` で打ち切られることを確認する unit test:

- `loopFixerPairs: {}` で Pipeline を構築
- loop step が `maxIterations` 回走ったら即 escalate（bypass なし）

---

## [x] T-12: TC-060 が regression していないことを確認

**ファイル**: `tests/pipeline-integration.test.ts`

TC-060（code-review needs-fix → code-fixer → code-review approved）のテストが変更なしで pass することを確認する。

このタスクは **コード変更不要** — T-01〜T-06 の実装後に `bun run test` で TC-060 が green であることを確認するのみ。

---

## [x] T-13: delta spec 作成

**新規ファイル**: `specrunner/changes/code-fixer-final-iter-reviewed/delta-spec/pipeline-orchestrator.md`

`pipeline-orchestrator` spec の Requirement "Pipeline Enforces Loop Guard via maxIterations" を MODIFIED:

```markdown
## MODIFIED

### Pipeline Enforces Loop Guard via maxIterations

追加仕様:

- Pipeline SHALL accept a `loopFixerPairs: Record<string, string>` parameter mapping review step names to their paired fixer step names.
- Pipeline SHALL track fixer iterations independently in a `fixerIters: Map<string, number>` counter, incremented each time a fixer step is entered.
- When the next step is a loop step AND `loopIters[nextStep] >= maxIterations`, the exhaustion check SHALL be **bypassed once** if:
  - The immediately preceding step is the paired fixer for `nextStep` (per `loopFixerPairs`)
  - AND that fixer's iteration count has reached `maxIterations`
- This bypass guarantees that the fixer's final iteration output is reviewed exactly once before escalation.
- When a fixer step is about to be entered AND `fixerIters[fixer] >= maxIterations`, the pipeline SHALL escalate (the fixer is not re-entered).
- The `ResumePoint` interface SHALL include an optional `exhaustionPhase` field with values `"review-after-final-fix"` or `"review-exhausted"` to distinguish escalation contexts.
- The maximum number of review iterations is `maxIterations + 1` (the +1 is exclusively the final-fix review).
- Loop steps with no entry in `loopFixerPairs` SHALL retain the existing exhaustion behavior (exhaust at `maxIterations` with no bypass).

#### Scenario: fixer final iter output is reviewed before escalation (code-review)
- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `code-review → code-fixer`
- **AND** code-review returns `needs-fix` for iterations 1 and 2
- **AND** code-fixer runs after each needs-fix (2 total fixer runs)
- **WHEN** code-fixer iter 2 completes and transitions to code-review
- **THEN** code-review iter 3 (the +1 bypass) SHALL execute
- **AND** if code-review iter 3 returns `approved`, the pipeline continues to pr-create

#### Scenario: fixer final iter review rejects → escalation with phase marker
- **GIVEN** same setup as above
- **WHEN** code-review iter 3 returns `needs-fix`
- **THEN** pipeline transitions to code-fixer
- **AND** code-fixer is blocked by `fixerIters["code-fixer"] >= 2`
- **THEN** pipeline escalates with `resumePoint.exhaustionPhase === "review-after-final-fix"`

#### Scenario: loop step without paired fixer exhausts normally
- **GIVEN** a loop step not present in `loopFixerPairs` keys
- **WHEN** that step reaches `maxIterations`
- **THEN** pipeline escalates immediately (no bypass)
- **AND** `resumePoint.exhaustionPhase === "review-exhausted"`
```

---

## [x] T-14: `bun run typecheck && bun run test` を green にする

全タスク完了後の最終検証:

- `bun run typecheck` — 型エラーなし
- `bun run test` — 全テスト pass（TC-060 含む）

---

## 受け入れ基準（チェックリスト）

- [x] `src/core/pipeline/pipeline.ts` の exhaustion check が fixer 最終 iter 直後の review を 1 回許可する
- [x] `fixerIters` counter が追加され、fixer 側の上限は `maxIterations` で gate されている
- [x] `loopFixerPairs` が `src/core/pipeline/run.ts` で初期化され Pipeline に渡されている
- [x] `handleExhausted` の resumePoint に `exhaustionPhase` field が追加され適切に分岐する
- [x] TC-060（既存）が regression していない
- [x] TC-061 が新 semantic で書き換えられ pass する
- [x] fixer 最終 iter 後の review が approve → 完走する TC が追加され pass する
- [x] spec-review / verification pair で同じ挙動が成立する TC が pass する
- [x] fixer 不在の loop step が従来挙動を維持する TC が pass する
- [x] `bun run typecheck && bun run test` が green
- [x] delta spec が `pipeline-orchestrator` の Loop Guard requirement を MODIFIED で更新している
