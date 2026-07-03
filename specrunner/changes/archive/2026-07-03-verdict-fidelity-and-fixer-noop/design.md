# Design: verdict 忠実性の修正（表示/導出/記録の食い違い・code-fixer no-op 空振り）

## Context

2026-07-03 の実運用（aozu リポジトリ job 70a24f62 / d7d3793e）で確認された 3+1 系統のバグ。

### 現状コードの構造（grep 再検証済み）

**verdict 導出経路**（`src/core/step/executor.ts:finalizeStep`）:

- agent step の verdict は `agentResult.toolResult` の findings から純粋関数で導出される
  - judge steps（spec-review / custom-reviewer / regression-gate）: `deriveJudgeVerdict(findings, ok)`
  - request-review: `deriveRequestReviewVerdict(findings, ok)`
  - conformance: `deriveConformanceVerdict(findings, ok)`
  - producer steps（code-fixer 等）: `completionVerdict`（通常 `"approved"`）
- `toolResult` が null（tool 非呼び出し）の場合:
  - judge step → `"escalation"`
  - request-review → `"needs-discussion"`
  - producer → `completionVerdict ?? "success"`
- `verdict:parsed` イベントで表示；`progress.ts:onVerdictParsed` がコンソールに `[step] verdict: <x>` を書く

**`parseRequestReviewReportInput`**（`src/core/port/report-result.ts:parseRequestReviewReportInput`）:

`ok=true` の場合 `findings` 配列が必須。存在しないか invalid なら `{ ok: false, missingFields: ["findings"] }` を返す。
ツール呼び出し時に `ok: false` が返ると `DEFAULT_TOOL_RETRY`（max 2 回）のリトライ後 `toolResult = null` → `"needs-discussion"` にフォールバックする。

**regression-gate の verdict 導出**:

`createRegressionGateStep`（`src/core/step/regression-gate.ts`）は `reportTool: JUDGE_REPORT_TOOL` を使用。
executor は `isJudgeStep = true` と判定し `deriveJudgeVerdict(findings, ok)` を適用する。
`deriveJudgeVerdict` は `critical|high` か `decision-needed` がある場合のみ `needs-fix`/`escalation` を返す。
MEDIUM 以下の fixable findings → `approved`。

**iteration 表示**（`src/core/pipeline/pipeline.ts:runInternal`）:

`pipeline:iteration:start` イベントに `maxIterations: this.maxIterations`（グローバル値）を渡す。
実際の exhaustion 判定は `resolveMaxIterations(stepName)`（step 別上書きあり）を使う。
regression-gate は `REGRESSION_GATE_MAX_ITERATIONS = 3` だが、グローバルが 2 の場合 `/2` が表示に出る。

**`code-fixer` の no-op**:

`CodeFixerStep.completionVerdict = "approved"`。session が完了すれば常に `approved` になる。ファイル変更有無の確認はない。

**archive orchestrator のドラフト warning**（`src/core/archive/orchestrator.ts:272`）:

`git add draftsDir()` を存在確認なしに実行する。ディレクトリが無ければ `fatal: pathspec ...` で exit 非 0 → warning 表示。

### 根本原因（症状別）

| 症状 | 根本原因 |
|------|----------|
| 症状1: regression-gate が console `approved`、file `needs-fix` | agent が MEDIUM/LOW severity の fixable findings で `report_result` を呼ぶ → `deriveJudgeVerdict` は HIGH/CRITICAL がないと `approved` を返す。regression-gate で fixable finding は回帰そのものを意味するが severity 閾値でフィルタされる |
| 症状2: request-review が MEDIUM/LOW のみで escalation | 初期メッセージが `{ ok: true, verdict: "..." }` フォーマット（findings なし）を指示するのにシステムプロンプトは findings 配列を必須とする。`parseRequestReviewReportInput` は findings がないと parse 失敗 → リトライ後 toolResult=null → `"needs-discussion"` フォールバック |
| 症状3: code-fixer の no-op 空振り | `completionVerdict = "approved"` が無条件に適用され、ソース変更の有無を確認しない |
| iteration 表示 `iter 3/2` | `pipeline:iteration:start` イベントがグローバル `maxIterations` を使い、step 別上書き値を反映しない |
| 症状4: archive の drafts warning | `git add draftsDir()` を無条件に実行。ディレクトリ不在で git エラー |

---

## Goals / Non-Goals

**Goals**:

1. regression-gate において任意の `fixable` finding を `needs-fix` として扱う（severity に依らず）
2. `parseRequestReviewReportInput` で `findings` を任意項目として扱う（ok=true でも findings 省略を許容）
3. code-fixer がソースファイルを変更しなかった場合（成果物ファイルのみ変更 or 変更ゼロ）を検出し `approved` 扱いしない
4. `pipeline:iteration:start` イベントに step 別 `maxIterations` を渡す
5. `git add draftsDir()` を drafts ディレクトリ存在時のみ実行する

**Non-Goals**:

- verdict 導出規則（findings 由来優先）自体の変更
- regression-gate / request-review のレビュー内容・プロンプトの変更
- aozu リポジトリ側のアーティファクト修正
- `deriveJudgeVerdict` / `deriveRequestReviewVerdict` のグローバルシグネチャ変更

---

## Decisions

### D1: regression-gate 向け独立 verdict 導出関数 `deriveRegressionGateVerdict` を追加する

**問題**: `deriveJudgeVerdict` は critical/high severity のみ `needs-fix` を返す。regression-gate では fixable finding は回帰（previously-fixed finding の再出現）を意味するため、severity に関わらず `needs-fix` とすべき。

**決定**: `src/core/step/judge-verdict.ts` に `deriveRegressionGateVerdict` を追加する。

```
deriveRegressionGateVerdict(findings, ok):
  ok=false → "escalation"
  decision-needed ≥ 1 → "escalation"
  fixable ≥ 1 → "needs-fix"  ← severity 不問で fixable を needs-fix 扱い
  else → "approved"
```

**wire 方法**: `AgentStep` に任意フィールド `judgeVerdictFn?: (findings, ok) => verdict` を追加し、regression-gate がこれを設定する。`executor.ts` は `isJudgeStep` 判定後に `step.judgeVerdictFn ?? deriveJudgeVerdict` を使う。

**代替案**:
- executor.ts で `step.name === REGRESSION_GATE_STEP_NAME` をハードコード: executor にステップ名の知識を持ち込む設計汚染
- グローバルに fixable → needs-fix へ変更: 他の judge step（spec-review 等）の挙動を変更してしまう（スコープ外）

**理由**: `judgeVerdictFn` は「step as data」パターンに従い、executor に知識を埋め込まない。他の step が将来独自の判定ロジックを持つ拡張点にもなる。

---

### D2: `parseRequestReviewReportInput` で findings を省略可能にする

**問題**: 初期メッセージの step 6 指示（`{ ok: true, verdict: "..." }`）にはfindings が含まれていない。システムプロンプトの findings 指示と矛盾するため、エージェントは findings なしで呼ぶケースがある。現状は `{ ok: false, missingFields: ["findings"] }` でリトライを誘発し、最終的に toolResult=null → `needs-discussion` になる。

**決定**: `parseRequestReviewReportInput` を変更し、`ok=true` 時に `findings` が省略された場合も parse 成功扱いとする（`result.findings = undefined`）。findings が存在するが invalid な場合は従来通り parse 失敗（リトライ誘発）。

```
ok=true の場合:
  findings が "findings" in obj かつ obj["findings"] !== undefined の場合:
    parse を試みる → invalid なら { ok: false, missingFields: ["findings"] }
  findings が省略の場合:
    result.findings を設定しない（undefined のまま）→ parse 成功
```

導出: `tr.findings ?? [] = []` → `deriveRequestReviewVerdict([], true) = "approve"` ✓

**代替案**:
- プロンプトを修正して findings を含む形式に統一: スコープ外（プロンプト変更禁止）
- toolResult=null のとき結果ファイルを読んで verdict をパース: I/O を executor に追加する複雑化、かつ prose-parse は R4 で廃止済み

**理由**: findings の省略 ≒ 指摘なし、という意味論はシンプルで correct。invalid な findings（型エラー）は引き続きエラー扱いにすることで故意の誤魔化しには保護できる。

---

### D3: code-fixer にソース変更ゼロ検出（no-op detect）を追加する

**問題**: code-fixer は session 完了 = `approved` を無条件に記録する。fixable findings が入力に指定されているのに変更ゼロ（成果物ファイル `events.jsonl`/`state.json`/`usage.json` のみ）で `approved` を返すと、ループが消費されて halt に至る。

**決定**: `AgentStep` に `noOpDetect?: boolean` フィールドを追加する。`CodeFixerStep.noOpDetect = true`。

executor は step 完了後（verdict が `approved`/`success` の場合）、`noOpDetect === true` かつ `runtimeStrategy` および `headBeforeStep` が利用可能な場合:

1. `runtimeStrategy.listChangedFiles(headBeforeStep, cwd, branch)` でコミット後の変更ファイル一覧を取得
2. **成果物ファイルフィルタ**: `specrunner/changes/<slug>/` 配下のファイル（events.jsonl, state.json, usage.json 等）を除外
3. フィルタ後の変更が 0 件 → verdict を `"needs-fix"` に差し替え（`approved` を上書き）

フィルタ条件: `f.startsWith("specrunner/changes/") || f.startsWith(".specrunner/")`

**no-op 判定のイベント**: フィルタ後変更 0 件のとき `verdict:parsed` に到達する前に verdict を差し替える。イベントには差し替え後の verdict が伝わる。`stepResult` にも差し替え後が記録される。

**代替案**:
- `BranchFixerFixableInput` をチェック（state から fixable findings 有無を確認してから no-op 判定）: より正確だが state から active reviewer の findings を引く ロジックが複雑化。no-op 状態で approved を返すこと自体が問題なので入力チェックなしの方がシンプル
- code-fixer 専用 post-completion hook: step-types に新たな生存点を作るより flag + executor 内ロジックの方が軽量

**理由**: 「変更ゼロ = 作業なし」はシンプルな不変条件。fixer は必ず何かを変更するはず。変更ゼロを needs-fix とすることでループが消費されるのを防ぎ、exhaustion でユーザーに認知を促す。

---

### D4: `pipeline:iteration:start` イベントに step 別 maxIterations を使用する

**問題**: `runInternal` が `pipeline:iteration:start` を発火するとき `maxIterations: this.maxIterations`（グローバル）を渡す。regression-gate は `REGRESSION_GATE_MAX_ITERATIONS = 3` で step 別上書きされているが表示は `/2`（グローバル値）になる。

**決定**: `pipeline:iteration:start` を発火する箇所を `maxIterations: this.resolveMaxIterations(currentStep)` に変更する。

`resolveMaxIterations` は既存プライベートメソッドで `maxIterationsByStep[stepName] ?? maxIterations` を返す。これを再利用するだけ。

**理由**: exhaustion 判定と表示が同じ値を参照すれば `iter N/M` の `/M` が正確になる。

---

### D5: archive orchestrator で drafts ディレクトリ存在確認を行う

**問題**: `orchestrator.ts` は `specrunner/drafts/` の有無を確認せずに `git add draftsDir()` を実行する。ディレクトリが存在しない job では `fatal: pathspec` エラーで warning が毎回出る。

**決定**: `git add draftsDir()` の前に `fs.exists(path.join(recordDir, draftsDir()))` を確認し、存在する場合のみ `git add` を実行する。

**理由**: `fs.exists` は既に `FinishFs` インターフェースに定義されており（`archive.ts` の `buildRealFs` でも実装済み）、追加依存なし。

---

## Risks / Trade-offs

### [Risk] D2: findings 省略許容で高 severity 指摘を見落とす

findings なしで `ok=true` を呼ぶと、本来 HIGH 指摘があったとしても `approved` になる。

**Mitigation**: findings が *存在するが invalid* な場合は従来通り parse 失敗とするため、故意に findings を省略した場合のみ影響を受ける。エージェントがシステムプロンプトどおり findings を付けていれば影響なし。agent が findings 付きで正しく呼ぶ場合は挙動変化なし（後退なし）。

### [Risk] D3: no-op 判定でリドライブ扱いが変わる

変更ゼロ = needs-fix となると、code-fixer が "正当に何もしなかった"（例: conformance からの conformance-only finding で既に修正済み）ケースでもループが回る可能性がある。ただし exhaustion ガードがあるので無限ループはしない。

**Mitigation**: pipeline の exhaustion ガードが最悪ケースを制御する。"正当に変更ゼロ"な場合は code-fixer が呼ばれないはずであり（verdictルーティングが正常なら）、実用上のリスクは低い。また no-op needs-fix は loop iteration カウンタを消費するため、誤判定が繰り返されても halt に収束する。

### [Risk] D1: 新関数の適用範囲（regression-gate のみ）

`deriveRegressionGateVerdict` は regression-gate にのみ wire される。他の judge step（spec-review 等）への影響はゼロ。

**Mitigation**: `judgeVerdictFn` を設定していない step は `deriveJudgeVerdict` を使い続ける（現行と同じ）。型チェックで保証。

---

## Open Questions

なし（全症状について根本原因と実装方針が確定済み）
