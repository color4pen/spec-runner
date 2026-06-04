# Design: 各 step が入出力を宣言し、実行前に入力の存在を検証する

## Context

pipeline の**制御フロー**は記述子（`PipelineDescriptor` + `STANDARD_TRANSITIONS`）で宣言済みだが、**データフロー**（各 step が読み書きするファイル）は 3 箇所に散在している:

1. **prompt 散文** — `buildMessage` 内に "Read `…/tasks.md`" 等が文章として埋め込まれている。
2. **state 逆引き** — 直し工程が直前の成果物の在処を `getLatestStepResult(state, X).findingsPath` で job state から逆引きし、無ければ halt する。
   - `code-fixer`: `getLatestStepResult(state, "code-review").findingsPath` → 無ければ `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` で halt。
   - `build-fixer`: `getLatestStepResult(state, "verification").findingsPath` → 無ければ `SpecRunnerError(BUILD_FIXER_NO_VERIFICATION_RESULT)` で halt。
   - `spec-fixer`: `getLatestStepResult(state, "spec-review").findingsPath ?? specReviewResultPath(slug, 1)`（halt せず fallback）。
3. **path helper** — `src/util/paths.ts` の純粋関数（`reviewFeedbackPath(slug, iteration)` 等）と、`getOutputTemplates` が書き込み先を導出するロジック。

この「探して見つからず halt」は、データ依存が暗黙であることに起因する。各 step に入出力を宣言させ、実行前に必須入力の存在を検証することで、依存を明示にし、halt の根を消す。

### 現状の実行土台（関係する seam）

- `Step` は discriminated union `AgentStep | CliStep`（`src/core/port/step-types.ts`）。`buildMessage` / `parseResult` は **pure（I/O 禁止＝不変条件 B-5）**。
- `StepExecutor`（`src/core/step/executor.ts`）が実行を統括し、agent step では `runner.run()` の直前に `RuntimeStrategy.prepareStepArtifacts()` を呼んでいる（artifact lifecycle の seam）。
- `RuntimeStrategy`（port）は runtime 差を吸収する: `Local` は worktree 上の fs に対して `prepareStepArtifacts` / `captureHeadSha` / `finalizeStepArtifacts` を実装し、`Managed` は **すべて no-op**（cloud agent が origin/branch 上で artifact を所有するため、CLI のローカル作業ツリーに artifact は無い）。
- iteration 番号は既に各所で `(state.steps?.[name]?.length ?? 0) + 1` として算出されている（`getOutputTemplates` / `computeCodeReviewIteration` 等）。

## Goals / Non-Goals

**Goals**:

- 各 step が `reads`（入力）/ `writes`（出力）を「その工程が読む / 書くファイルの正典リスト」として宣言する。
- 宣言は `util/paths` の既存関数を参照 / そこから導出する。`{n}`（反復番号）は job state 由来の iteration に解決する。
- step 実行前に、宣言された**必須入力の存在**を検証し、欠落時は明示エラー（`STEP_INPUT_MISSING`）で停止する。
- 「state 逆引き＋無ければ halt」している 3 箇所を、宣言入力＋事前検証に置換する。
- managed / local 両 runtime で artifact の扱いを整合させる（存在検証は各 runtime が所有する artifact の在処に対して行う）。
- 標準 pipeline の挙動（実行・画面出力・PR）を不変に保つ。

**Non-Goals**:

- 副作用クラス（`sideEffect: pure / gitWrite / external`）の宣言、および cache / incremental・並列分岐（消費者が未存在）。
- 成果物の lineage / cost 可視化。
- 遷移内 `when` predicate に残る state 逆引き。
- `StepName` の string 化。
- `util/paths` の命名を宣言側へ全面移設し、全使い手（雛形・PR 本文・検証・プロンプト・実行土台の約 12 ファイル）を宣言経由に張り替えること。`getOutputTemplates` も含め、既存使い手の呼び出し箇所は据え置く。
- 宣言された `writes` の事後検証（出力が宣言通り書かれたかの照合）。本変更は**入力の事前検証のみ**。

## Decisions

### D1: I/O 契約を Step に追加する（reads / writes の 2 メソッド）

`Step` 契約に、解決済み I/O 参照を返す 2 つの **pure メソッド**を追加する（`AgentStep` / `CliStep` の共通契約）:

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

- メソッド形（`(state, deps) => IoRef[]`）にするのは、`{n}` の解決に state が必要なため。`resultFilePath(state, deps)` と同じ純粋メソッドパターンに揃える。
- 各 step は内部で `util/paths` を呼び `{n}` を解決して**解決済み path** を返す。executor / runtime は path 文字列のみを消費し、domain 結合を持たない。
- `writes` は「正典の出力リスト」を明示する宣言であり、本変更では事前検証に使わない（D5 の Non-Goal）。`getOutputTemplates` とは当面共存する（移設は記法導入段で行う）。

**Rationale**: 「why メソッドで宣言、why not 中央 path レジストリ」— 中央レジストリ化は `util/paths` の全使い手張り替えを伴い波及が広い（スコープ外）。各 step が自分の I/O を宣言する形なら、追加は契約記述の精緻化に留まり、層・DSM・不変条件を変えない。`buildMessage` が散文で語っていた依存を、機械可読な同一 step 上の宣言へ寄せる。

**Alternatives considered**:
- *静的配列 `reads: IoRef[]`*: `{n}` を state から解決できないため不可。
- *パターン文字列 + 中央解決エンジン（`"review-feedback-{n}.md"` を解釈）*: 新しい記法と解決器が必要で `util/paths` と二重定義になる。既存 path helper を参照する D1 の方が重複が無い。

### D2: `{n}`（iteration）の解決規則

2 つの pure helper（例: `src/core/step/io-iteration.ts`）に集約する:

- `nextIteration(state, stepName)` = `(state.steps?.[stepName]?.length ?? 0) + 1` — **自 step の `writes`**（現在の反復＝過去実行回数 + 1）。
- `latestIteration(state, stepName)` = `state.steps?.[stepName]?.length ?? 0` — **他 step の出力を読む `reads`**（その producer の最新反復）。

各 step はこの helper で iteration を解決し、`util/paths`（`reviewFeedbackPath(slug, iter)` 等）に渡す。既存の inline 算出（`getOutputTemplates`・`computeCodeReviewIteration`）と同一規約。

**producer が未実行のとき**（`latestIteration` = 0）、解決される read path は `…-000.md` 等の存在しない path となり、D3 の事前検証が `STEP_INPUT_MISSING` で停止する。これが state 逆引き halt の置換である（暗黙の「見つからない」を明示の「在処が無い」に変える）。

**Rationale**: 既存の iteration 算出規約に一致させることで、宣言から導く path と、producer が実際に書いた path（`resultFilePath`）が一致し、挙動が不変になる。

### D3: 実行前検証を RuntimeStrategy の seam として追加する

`RuntimeStrategy`（port）に、`prepareStepArtifacts` と対になる検証 seam を追加する:

```ts
// port DTO（domain 非依存）
interface RequiredInput { path: string; artifact: "file" | "gitState"; }

validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>;
```

`StepExecutor` は実行直前に `step.reads?.(state, deps)` を解決し、`required !== false` のものを `RequiredInput[]` に射影して strategy に渡す。strategy は artifact の在処に応じて存在を検証し、欠落時は `SpecRunnerError("STEP_INPUT_MISSING", hint, message)` を throw する。

- **LocalRuntime**: artifact は worktree 上にある。`file` は `fs.access(path.join(cwd, relPath))`、`gitState` は worktree が git repo として有効か（最小チェック）。
- **ManagedRuntime**: cloud agent が origin/branch 上に artifact を push する（CLI のローカル作業ツリーには無い）。よって**git 状態**に対して検証する: `git fetch origin <branch>` 後に `git cat-file -e <branch-ref>:<relPath>`。これにより local が fs で見る対象と managed が git で見る対象が「同じ宣言 path」となり、両 runtime が整合する。

検証は executor の失敗記録エンベロープ内で呼び、欠落 halt は既存の build-fixer / code-fixer halt と同様に「failed StepRun 記録 + `store.fail` + state 添付」で停止する（挙動の連続性）。

**Rationale**: 「why RuntimeStrategy、why not executor で直接 fs.access」— managed は CLI ローカルに agent 成果物を持たないため、executor 直 fs チェックは managed で必ず false negative になり標準 pipeline を壊す。検証を artifact lifecycle と同じ seam に置けば、各 runtime が自分の artifact の在処を検証でき、`prepareStepArtifacts` / `finalizeStepArtifacts` と対称になる。

**Alternatives considered**:
- *managed を no-op にする*: 実装は最小だが、明示 halt の保証を失い、欠落は cloud agent 側の読み取り失敗（暗黙 halt）に退化する。受け入れ基準「両 runtime で整合」に反するため不採用。
- *検証を state ベース（producer の StepRun 有無）で行う*: state 逆引きの再導入であり、要件 3 の趣旨（state 逆引きを消す）に反する。architect 判断「存在検証は git 状態として扱う」とも不一致。

### D4: state 逆引き halt の置換（fixer 3 箇所）

`code-fixer` / `build-fixer` / `spec-fixer` の `buildMessage` から `getLatestStepResult(...).findingsPath` 逆引きと halt（throw / fallback）を除去し、findings path を**宣言と同じ導出**（`util/paths` + D2 helper）で計算する:

- `code-fixer.reads` = `[ reviewFeedbackPath(slug, latestIteration(state, "code-review")) ]`（required file）。`buildMessage` は同じ式で path を得る。`CODE_FIXER_NO_REVIEW_RESULT` の throw と error code を削除。
- `build-fixer.reads` = `[ verificationResultPath(slug) ]`（required file。iteration 無し）。`BUILD_FIXER_NO_VERIFICATION_RESULT` の throw と error code を削除。
- `spec-fixer.reads` = `[ specReviewResultPath(slug, latestIteration(state, "spec-review")) ]`（required file）。`?? specReviewResultPath(slug, 1)` fallback を削除。

存在保証は D3 の事前検証が担うため、`buildMessage` に到達した時点で path は必ず存在する。導出式は producer の `resultFilePath` と一致するため、生成される prompt（埋め込まれる path）は不変。

**Rationale**: findings path の真理を「state が記録した値の逆引き」から「宣言と同じ純粋導出」に移し、検証を 1 点（事前検証）に寄せる。`getLatestStepResult` 自体は他用途（transition の `when` 等）で残す。

### D5: 全 12 step の reads / writes（正典リスト）

各 step が以下を宣言する（`required` 未指定の read は既定 true。`writes` は宣言のみ）:

| step | reads（required file 中心） | writes |
|------|------|------|
| design | `request.md` | `design.md`, `tasks.md`, `spec.md` |
| spec-review | `spec.md`, `design.md`, `tasks.md` | `spec-review-result-{next}.md` |
| spec-fixer | `spec-review-result-{spec-review latest}.md` | `design.md`, `spec.md`（mutate） |
| test-case-gen | `design.md`, `tasks.md` | `test-cases.md` |
| implementer | `tasks.md`（+ `spec.md`） | source code (`gitState`), `tasks.md`（mutate） |
| verification | source/worktree (`gitState`) | `verification-result.md` |
| build-fixer | `verification-result.md` | source code (`gitState`) |
| code-review | `design.md`, `tasks.md`, `test-cases.md`, diff (`gitState`) | `review-feedback-{next}.md` |
| code-fixer | `review-feedback-{code-review latest}.md` | source code (`gitState`) |
| conformance | `tasks.md`, `design.md`, `spec.md`, `request.md` | `conformance-result-{next}.md` |
| adr-gen | `request.md`, `design.md`, `spec.md`（+ `review-feedback-*.md` optional） | ADR 成果物（path は adr-gen が所有・宣言） |
| pr-create | branch / commits (`gitState`) | `pr-create-result.md` |

**required の原則**: 標準 pipeline で「その step に到達するすべての経路で producer が必ず先行実行される」入力のみ `required: true`。それ以外（adr:false 時に読まれない `review-feedback` 等、欠落し得る入力）は `required: false`。これにより既存の標準 pipeline 経路では検証が必ず通り、挙動が不変に保たれる。

**Rationale**: 受け入れ基準「各 step が reads / writes を宣言」を満たしつつ、required を保守的に絞ることで「標準 pipeline 不変」を守る。検証の主眼は fixer の halt 置換（D4）にある。

> ADR の具体 path は adr-gen 内の宣言にのみ置く（プロジェクト規律: 他 step / 設計文書に ADR path を書かない）。

## Risks / Trade-offs

- [Risk] required を広げすぎて、ある経路で欠落し得る入力を必須にし、標準 pipeline を halt させる → **Mitigation**: required は「全到達経路で producer 先行」が成り立つ入力のみ。判断は transition グラフで検証し、pipeline 統合テスト + 既存 step テストで回帰確認。
- [Risk] managed の git 検証で参照する `<branch-ref>` が、cloud agent の push 反映前で未解決になり false negative → **Mitigation**: 検証前に `git fetch origin <branch>` を実行してから `git cat-file -e` する。producer step 完了後（agent push 済み）に次 step の検証が走る順序を前提とする。
- [Risk] managed の per-step `git fetch` が画面出力 / 実行時間を変える → **Mitigation**: fetch / cat-file は stdout に出さない（warning 経路のみ stderr）。検証は required file read を持つ step でのみ走るため発火は限定的。スナップショットテストで stdout 不変を確認。
- [Risk] findings path 導出の置換（D4）で、稀に producer の記録 iteration と再計算 iteration がずれて別 path を生成 → **Mitigation**: D2 helper は producer の `resultFilePath` と同一規約。等価性を unit テストで固定。
- [Risk] 既存 halt error code（`CODE_FIXER_NO_REVIEW_RESULT` 等）を参照するテストが壊れる → **Mitigation**: 当該テストを `STEP_INPUT_MISSING` 経由の halt に更新（タスクに含む）。

## Open Questions

- なし（managed の ref 解決は Risk の mitigation で確定。gitState read の検証深度は「branch / worktree の有効性」最小チェックに留める）。
