# Step I/O 契約：各 step が入出力を宣言し、実行前に入力の存在を検証する

**Date**: 2026-06-04
**Status**: accepted

## Context

pipeline の**制御フロー**は `PipelineDescriptor` + `STANDARD_TRANSITIONS` で宣言済みだが、**データフロー**（各 step が読み書きするファイル）は 3 箇所に散在していた。

1. **prompt 散文** — `buildMessage` 内に "Read `…/tasks.md`" 等が文章として埋め込まれている。
2. **state 逆引き** — 直し工程が直前の成果物の在処を `getLatestStepResult(state, X).findingsPath` で job state から逆引きし、無ければ halt する。
   - `code-fixer`: `getLatestStepResult(state, "code-review").findingsPath` → 無ければ `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` で halt。
   - `build-fixer`: `getLatestStepResult(state, "verification").findingsPath` → 無ければ `SpecRunnerError(BUILD_FIXER_NO_VERIFICATION_RESULT)` で halt。
   - `spec-fixer`: `getLatestStepResult(state, "spec-review").findingsPath ?? specReviewResultPath(slug, 1)`（halt せず fallback）。
3. **path helper** — `src/util/paths.ts` の純粋関数（`reviewFeedbackPath(slug, iteration)` 等）と、`getOutputTemplates` が書き込み先を導出するロジック。

この散在により、どの step がどのファイルに依存するかが機械的に読み取れず、「探して見つからず halt」が各 step の実装に散在していた。

実行土台の seam としては、先行変更（runtime-strategy-artifact-lifecycle, 2026-06-01）で `RuntimeStrategy` に step artifact lifecycle（`prepareStepArtifacts` / `captureHeadSha` / `finalizeStepArtifacts`）を委譲しており、入力検証を同じ seam に追加する素地が整っていた。

## Decision

### D1: I/O 契約を Step 契約に追加する（reads / writes の 2 pure メソッド）

`Step` 契約（`AgentStep` / `CliStep` の共通契約）に、解決済み I/O 参照を返す 2 つの **pure メソッド**を追加する。

```ts
interface IoRef {
  /** 解決済みの worktree-relative path（util/paths から導出。{n} は state から解決済み）。 */
  path: string;
  /** reads のみ意味を持つ。既定 true。false の入力は欠落しても halt しない。 */
  required?: boolean;
  /** 検証対象の種別。既定 "file"。"gitState" は git 状態として扱う。 */
  artifact?: "file" | "gitState";
}

// Step 契約に追加（optional — 型互換のため。標準 pipeline の 12 step は全て実装する）
reads?(state: JobState, deps: StepDeps): IoRef[];
writes?(state: JobState, deps: StepDeps): IoRef[];
```

メソッド形（`(state, deps) => IoRef[]`）にするのは、`{n}` の解決に state が必要なため。`resultFilePath(state, deps)` と同じ pure メソッドパターンに揃える。各 step は内部で `util/paths` を呼び `{n}` を解決して**解決済み path** を返す。executor / runtime は path 文字列のみを消費し、domain 結合を持たない。

`writes` は「正典の出力リスト」を明示する宣言であり、本変更では事前検証に使わない。`getOutputTemplates` とは当面共存する（移設は `util/paths` の全面移設を伴う将来 request で行う）。

### D2: `{n}`（iteration）の解決規則

2 つの pure helper（`src/core/step/io-iteration.ts`）に集約する。

- `nextIteration(state, stepName)` = `(state.steps?.[stepName]?.length ?? 0) + 1` — **自 step の `writes`**（現在の反復＝過去実行回数 + 1）。
- `latestIteration(state, stepName)` = `state.steps?.[stepName]?.length ?? 0` — **他 step の出力を読む `reads`**（その producer の最新反復）。

各 step はこの helper で iteration を解決し、`util/paths`（`reviewFeedbackPath(slug, iter)` 等）に渡す。既存の inline 算出（`getOutputTemplates` / `computeCodeReviewIteration`）と同一規約であり、宣言から導く path と producer が実際に書いた path（`resultFilePath`）が一致する。

producer が未実行のとき（`latestIteration` = 0）、解決される read path は存在しない path となり、D3 の事前検証が `STEP_INPUT_MISSING` で停止する。これが state 逆引き halt の置換である（暗黙の「見つからない」を明示の「在処が無い」に変える）。

### D3: 実行前検証を RuntimeStrategy の seam として追加する

`RuntimeStrategy`（port）に `validateStepInputs` を追加する。

```ts
// port DTO（domain 非依存）
interface RequiredInput { path: string; artifact: "file" | "gitState"; }

validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>;
```

`StepExecutor` は実行直前に `step.reads?.(state, deps)` を解決し、`required !== false` のものを `RequiredInput[]` に射影して strategy に渡す。strategy は artifact の在処に応じて存在を検証し、欠落時は `SpecRunnerError("STEP_INPUT_MISSING", hint, message)` を throw する。

| runtime | `file` の検証 | `gitState` の検証 |
|---------|-------------|-----------------|
| LocalRuntime | `fs.access(path.join(cwd, relPath))` | worktree が git repo として有効か（最小チェック） |
| ManagedRuntime | `git fetch origin <branch>` 後に `git cat-file -e <branch-ref>:<relPath>` | 同左 |

ManagedRuntime では cloud agent が origin/branch 上に artifact を push するため、CLI のローカル作業ツリーには artifact が無い。git state に対して検証することで、local が fs で見る対象と managed が git で見る対象が「同じ宣言 path」となり、両 runtime が整合する。

### D4: state 逆引き halt の置換（fixer 3 箇所）

`code-fixer` / `build-fixer` / `spec-fixer` の `buildMessage` から `getLatestStepResult(...).findingsPath` 逆引きと halt（throw / fallback）を除去し、findings path を**宣言と同じ純粋導出**（`util/paths` + D2 helper）で計算する。

- `code-fixer.reads` = `[ reviewFeedbackPath(slug, latestIteration(state, "code-review")) ]`（required file）。`CODE_FIXER_NO_REVIEW_RESULT` の throw と error code を削除。
- `build-fixer.reads` = `[ verificationResultPath(slug) ]`（required file。iteration 無し）。`BUILD_FIXER_NO_VERIFICATION_RESULT` の throw と error code を削除。
- `spec-fixer.reads` = `[ specReviewResultPath(slug, latestIteration(state, "spec-review")) ]`（required file）。`?? specReviewResultPath(slug, 1)` fallback を削除。

存在保証は D3 の事前検証が担うため、`buildMessage` に到達した時点で path は必ず存在する。導出式は producer の `resultFilePath` と一致するため、生成される prompt に埋め込まれる path は不変。

## Alternatives Considered

### Alternative 1: 静的配列 `reads: IoRef[]` として宣言する

- **Pros**: 宣言がオブジェクトリテラルで完結し、シンプル。
- **Cons**: `{n}` を job state から解決できない。iteration は実行時に state から計算する値であり、静的宣言に収まらない。
- **Why not**: メソッド形（D1）が唯一 state を受け取れる形式。

### Alternative 2: パターン文字列 + 中央解決エンジン（`"review-feedback-{n}.md"` を解釈）

- **Pros**: 宣言が人間可読な文字列テンプレートになり、中央で一元解決できる。
- **Cons**: 新しいパターン記法と解決エンジンが必要になり、`util/paths` と二重定義になる。`util/paths` の既存 helper（`reviewFeedbackPath(slug, iteration)` 等）がパターン文字列では表現しにくい命名規則を持つ。
- **Why not**: 既存 path helper を参照する D1 の方が重複が無く、`util/paths` の不変条件を保てる。

### Alternative 3: executor で直接 `fs.access` して検証する

- **Pros**: 実装が最小。`RuntimeStrategy` に seam を追加しない。
- **Cons**: managed runtime は CLI ローカルに agent 成果物を持たないため、executor 直 `fs.access` は managed で必ず false negative になり標準 pipeline を壊す。
- **Why not**: 検証を `RuntimeStrategy` seam に置けば、各 runtime が自分の artifact の在処を検証でき、`prepareStepArtifacts` / `finalizeStepArtifacts` と対称になる（D3）。

### Alternative 4: managed の `validateStepInputs` を no-op にする

- **Pros**: 実装が最小で managed の git fetch を回避できる。
- **Cons**: 明示 halt の保証を失い、欠落は cloud agent 側の読み取り失敗（暗黙 halt）に退化する。受け入れ基準「両 runtime で整合」に反する。
- **Why not**: managed も git state に対して検証することで、受け入れ基準を満たす（D3）。

### Alternative 5: 検証を state ベース（producer の StepRun 有無）で行う

- **Pros**: `fs.access` や `git cat-file` が不要で、state のみで完結する。
- **Cons**: state 逆引きの再導入であり、「state 逆引きを消す」という本変更の目的（D4）に反する。artifact の削除・欠落が state に反映されない欠点も残る。
- **Why not**: state ではなく artifact の在処を直接検証することが本変更の核心。

## Consequences

### Positive

- データフロー（誰が何を読み書きするか）が step 宣言に集約され、機械可読になる。
- `code-fixer` / `build-fixer` / `spec-fixer` の「state 逆引き＋見つからず halt」クラスが消え、欠落時の停止が `STEP_INPUT_MISSING` の 1 点に統一される。
- `required` を「全到達経路で producer が先行実行される入力のみ」に絞ることで、標準 pipeline 正常経路での検証は全件素通りし、挙動不変が保たれる。
- 将来の副作用クラス宣言（`sideEffect: pure / gitWrite / external`）や lineage 可視化の基盤となる。

### Negative

- `RuntimeStrategy` interface に `validateStepInputs` が追加され、実装クラス（`LocalRuntime` / `ManagedRuntime`）に実装コストが発生する。
- managed の `validateStepInputs` は `required` な file を持つ step で per-step の `git fetch` を実行するため、ネットワーク I/O が増える。fetch / cat-file は stdout に出さないことで画面出力は不変に保つ。
- `CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT` error code が廃止され、参照していたテストは `STEP_INPUT_MISSING` 経由の halt に更新される。

### Known Debt / Deferred

- `util/paths` の命名を宣言側へ全面移設し、全使い手（約 12 ファイル）を宣言経由に張り替えることは本変更のスコープ外。記述子が固まる記法導入段に一度で行う。
- 宣言された `writes` の事後検証（出力が宣言通り書かれたかの照合）は対象外。本変更は入力の事前検証のみ。
- 副作用クラス（`sideEffect: pure / gitWrite / external`）の宣言と cache / incremental・並列分岐は含めない。消費者が未存在のまま解禁すると不正な skip / 状態分裂を招くため、宣言を先行させる投機を避ける。
- 遷移内 `when` predicate に残る state 逆引きは対象外。

## References

- Request: `specrunner/changes/step-io-contracts/request.md`
- Design: `specrunner/changes/step-io-contracts/design.md`
- Spec: `specrunner/changes/step-io-contracts/spec.md`
- Related: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy seam の先行委譲）
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（AgentRunner port 設計）
- Related: `specrunner/adr/2026-04-29-step-abstraction-implementation.md`（Step 契約の原型）
- Implementation: `src/core/port/step-types.ts`・`src/core/port/runtime-strategy.ts`・`src/core/step/io-iteration.ts`・`src/core/step/executor.ts`・`src/core/runtime/local.ts`・`src/core/runtime/managed.ts`・`src/errors.ts`
