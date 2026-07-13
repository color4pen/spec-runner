# Design: 並列 round の入力を immutable にする（共有 deps 不変・resume 配布）

## Context

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D4 — 実行 seam を跨ぐ入力の不変性** の並列 round 実装。ADR の提案 invariant **B-16**（`deps` を実行 seam を跨いで in-place 書き換えしない）を挙動として実現する request。R3 で `ParallelReviewRound` は挙動不変で抽出済み。

### 現状の構造

- **fan-out**（`src/core/pipeline/parallel-review-round.ts`）: `Promise.allSettled` で pending member を実行し、各 member に同一 `state` と**同一 `deps` オブジェクト**を渡す（`this.executor.execute(memberStep, state, deps)`）。
- **resume 入力の消費**（`src/core/step/executor.ts:242-246`）: agent step 実行時、`deps.resumePrompt` / `deps.resumeContext` を最初に見た step が **in-place で `undefined` にクリアする**（one-shot）。
  ```
  if (deps.resumePrompt !== undefined || deps.resumeContext !== undefined) {
    deps.resumePrompt = undefined;
    deps.resumeContext = undefined;
  }
  ```
  逐次経路ではこれが「resume 入力は再開 step だけに届く」を実現する。並列経路では**同一 `deps` を共有する member 群のうち最初に到達した 1 つが消費**し、どれが最初かは `allSettled` の解決順に依存する非決定挙動になる。
- **resume 入力の構築**（`src/core/step/step-context-builder.ts:122`）: `buildResumePrompt({ humanResumePrompt: deps.resumePrompt, resumeContext: deps.resumeContext, stepName })`。
  - **human note**（`resumePrompt`）は step 名で gate されず、`deps.resumePrompt` を持つ全 step に適用される。
  - **automatic context**（`resumeContext`）は `buildResumePrompt` 内部（`resume-context.ts:64`）で `resumeContext.resumePoint.step === stepName` の時だけ展開される（step 固有）。
- **member→coordinator 写像**（`src/core/resume/resolve-step.ts:42`）: member（custom reviewer）の `resumePoint.step` は、resume 時に `mapMemberToCoordinator` で coordinator（`custom-reviewers`）へ写像され、`startStep` は coordinator になる。
- **automatic context の落下**（`src/core/command/resume.ts:274`）:
  ```
  resumeContext: resumePoint && startStep === resumePoint.step ? { resumePoint } : undefined,
  ```
  member 由来の resumePoint では `startStep`（= coordinator）と `resumePoint.step`（= member 名）が strict equality を満たさず、`resumeContext` が `undefined` になる。結果、member→coordinator resume で automatic context が写像で捨てられる。

### 構造的欠陥

resume 入力（human note / automatic context）の「誰に届くか」が、型・宣言でなく **executor の in-place クリアの実行順** によって偶然決まる。ADR D4 が閉じるべき残余そのものである。

## Goals / Non-Goals

**Goals**:

- member 実行が共有 `deps`（orchestration 入力）を in-place で書き換えない。round ごとに readonly な execution input を構築して各 member へ渡す（R1 / B-16）。
- human resume note を round の全 pending member へ readonly で配布する（R2）。
- automatic resume context を対象 member（`resumeContext.resumePoint.step` の member）にだけ展開する。member→coordinator 写像後も元の `resumePoint` を保持して context を落とさない（R3）。
- 逐次経路・非並列時の resume 挙動（human note = 再開 step のみ / automatic context = 再開 step のみ）を不変に保つ（R4）。

**Non-Goals**:

- git 副作用の round 所有（R5）。member persist の除去（R6）。
- `architecture/` 配下の変更。B-16 の ratify（`model.md` §4 / `conformance.md` (A) / `core-invariants.test.ts` の歯）は本 request の pipeline では行わず、実装 merge 後に attended で行う（trust-root を out-of-loop に保つ）。
- `deps` 構築点（composition root）の再設計。`src/core/command/runner.ts:171-174` の build 時 injection は実行 seam を跨がない構築であり、本 request の対象外。

## Decisions

### D1 — resume 入力の one-shot 所有を executor から Pipeline へ移す

`StepExecutor` から in-place クリア（`executor.ts:242-246`）を**削除**する。executor は `deps.resumePrompt` / `deps.resumeContext` を `buildStepContext` 経由で**読むだけ**で、書かない。

one-shot（resume 入力は再開した最初の実行単位だけに届く）は **`Pipeline.runInternal` が所有**する。runInternal は execution unit（逐次経路では単一 step 実行、parallel review では round）の列を知っており、どれが「再開された最初の unit」かを判定できる。

- runInternal は実行前に `depsWithoutResume = { ...deps, resumePrompt: undefined, resumeContext: undefined }` を一度だけ構築する。
- `firstUnitExecuted` フラグを持ち、各 unit へ渡す `deps` を選ぶ:
  - 最初の unit（= 再開 unit）→ `deps`（resume 入力あり）。
  - 2 つ目以降 → `depsWithoutResume`（resume 入力なし）。
- coordinator 分岐（`round.run(...)`）と逐次分岐（`executor.execute(...)`）の両方でこの選択を使う。

**Rationale**: ADR の所有権原則は「実行入力の lifecycle は orchestration が所有する」。one-shot は「どの unit が再開単位か」を知る主体＝ Pipeline に属する。executor は 1 step の I/O だけを見るので、複数 step/member を跨ぐ「一度きり」の判断を持てず、共有 `deps` を書き換える以外に実現手段がなかった。所有を Pipeline へ移すと、共有 `deps` を書き換えずに one-shot を表現できる。

**Alternatives considered**:

- *human note も step 名で gate する*: automatic context のように「対象 step 名」を state に保存して gate する案。human note には「対象 step」が保存されておらず（`deps.resumePrompt` は文字列のみ）、その対象は「再開された unit」＝ 実行順で決まる暗黙情報。保存フィールドの新設は要件肥大で、one-shot の所有を Pipeline に置く方が最小。却下。
- *executor のクリアを残し、round だけ per-member clone を渡す*: 逐次経路の in-place mutation（B-16 違反）が残り、D4 を部分的にしか満たさない。却下。

### D2 — round が readonly な per-round execution input を構築する

`ParallelReviewRound.run` は、member を fan-out する前に**渡された `deps` から readonly な round 入力**（`roundDeps`）を構築し、各 member の `executor.execute(memberStep, state, roundDeps)` へ渡す。member 実行は `roundDeps` を書き換えない（D1 で executor がクリアを止めるため）。round.run 自身の store / runtime 操作は従来どおり `deps` を使う。

配布の差（全 member vs 対象 member）は `buildResumePrompt` の既存 gate がそのまま担う:

- **human note**（`roundDeps.resumePrompt`）: gate されず、全 pending member の resume prompt に入る → R2。
- **automatic context**（`roundDeps.resumeContext`）: `resumePoint.step === stepName` で gate され、対象 member だけに展開される → R3。

**Rationale**: D4「round ごとに readonly な入力を構築」を構造として明示する所有点が round。executor がクリアを止めた結果として `deps` が不変になるだけでなく、round が member 入力構築の宣言的な所有者になることで、将来の per-member override（本 request では不要）も round が seam になる。配布ロジックを新設せず、既存 `buildResumePrompt` の gate 差（human note は ungated / automatic context は step-gated）を再利用するため、追加の分岐を持たない。

**Alternatives considered**:

- *round が member ごとに automatic context を明示 targeting する*: `buildResumePrompt` が既に step 名で gate しているため二重実装になる。round は同一 `resumeContext` を全 member へ渡すだけでよい。却下。
- *round が `deps` をそのまま member へ渡す（clone しない）*: executor が書き換えないなら挙動は同じだが、D4 の「round ごとに readonly な入力を構築」という**構造要件**を満たさず、readonly 境界がコードに現れない。明示的に `roundDeps` を構築する。

### D3 — member→coordinator 写像後も automatic context を保持する

`resolve-step.ts` の `mapMemberToCoordinator` を **export** し、`resume.ts` の automatic context gate を strict equality から**写像後一致**に変える:

```
const mappedResumeStep = resumePoint
  ? mapMemberToCoordinator(resumePoint.step, state.reviewers)
  : undefined;
// ...
resumeContext: resumePoint && startStep === mappedResumeStep ? { resumePoint } : undefined,
```

保持する `resumePoint` は**元の member 名**を持つ（写像しない）。coordinator round が pending member を実行するとき、`buildResumePrompt` の `resumePoint.step === stepName` gate が対象 member と一致し、automatic context が正しく展開される。

**Rationale**: automatic context の gate は「resume が resumePoint の指す位置へ実際に入るか」で決まるべき。member→coordinator は写像であって位置の一致であり、strict equality はその写像を見落として context を落としていた。`mapMemberToCoordinator` を使うと、静的 step（写像なし → `mappedResumeStep === resumePoint.step`）では**現状と完全に同一**の判定になり、member 経路だけが修正される。

**Alternatives considered**:

- *`resumeContext` に写像後の coordinator step を入れる*: `buildResumePrompt` の gate は member 名で照合するため、coordinator 名を入れると全 member で不一致になり context が展開されなくなる。元の member 名を保持するのが正しい。却下。
- *`resolveResumeStep` に「resumePoint 由来か」を返させる*: 戻り値の拡張は呼び出し側全体に波及。`mapMemberToCoordinator` の再利用が最小。却下。

### D4 — 配布仕様は「意図した配布」を固定する（偶然挙動を仕様化しない）

現状の「どの member が最初に resume を消費するか」は非決定であり、これを正しい仕様として固定しない。intended-invariant として:

- human note → round の全 pending member（readonly、実行順非依存）。
- automatic context → 対象 member（`resumePoint.step` の member）だけ。
- member 実行中に共有 `deps` は in-place 変更されない。

**Rationale**: request の architect 評価済み判断「偶然挙動を仕様として固定しない」に従う。test は observable な配布（誰に届くか）と不変性（共有 `deps` が変わらないか）を固定し、内部の実行順には依存しない。

## Risks / Trade-offs

- **[Risk] executor の mechanism を検証する既存 test が壊れる** → `executor-resume-context.test.ts`（`src/core/step/__tests__/` と `tests/unit/step/` の 2 系統）は「executor が `deps` を in-place クリアする」という*除去される機構*を assert している。挙動（逐次で再開 step だけが human note を受ける）は D1 で Pipeline が保存するため、これらの test は機構レベルから Pipeline レベルの observable behavior test へ**移設**する。挙動不変性は維持される（R4）。
- **[Risk] `--from` 明示時の context 保持が微変化する** → 新 gate `startStep === mapMemberToCoordinator(resumePoint.step, reviewers)` では、`--from <member>` / `--from custom-reviewers` を明示しつつ member 由来 resumePoint がある場合、context が保持される（現状は落ちる）。coordinator が pending member を再評価し、対象 member にだけ context を届けるため副作用は無く、むしろ member→coordinator の意図に沿う。`--from` を**別 step**へ redirect した場合は従来どおり context を落とす（`startStep ≠ mappedResumeStep`）。静的 step 経路は完全不変。
- **[Risk] round の readonly 保証は executor の非 mutation に依存** → `roundDeps` は全 member で共有される 1 オブジェクトなので、仮に member 実行経路が書き換えれば member 間で競合する。真の保証は D1（executor がクリアを止める）にある。`roundDeps` 構築は D4 の構造要件を満たす所有点であって、それ単体で競合を防ぐものではない。test は共有 `deps` の不変性で二重に固定する。

## Open Questions

なし（architect 評価済みの設計判断で確定）。
