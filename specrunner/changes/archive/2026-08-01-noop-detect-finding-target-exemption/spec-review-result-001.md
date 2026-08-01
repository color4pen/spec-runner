# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 現状コードの前提確認（request.md 記載 8 箇所）

| 前提 | 確認結果 |
|------|---------|
| `no-op-detect.ts:16` — `ARTIFACT_PREFIXES = ["specrunner/changes/", ".specrunner/"]` | ✓ 一致 |
| `no-op-detect.ts:64-77` — `sourceFiles.filter(not ARTIFACT_PREFIXES)`、`.length === 0` → `"needs-fix"` | ✓ 一致（lines 64-76） |
| `no-op-detect.ts:34-50` — `detectNoOp` の引数に finding 情報なし | ✓ 一致（params に finding 集合フィールドなし） |
| `executor.ts:471-480` — `detectNoOp` の唯一の呼び出し元、`state` が在圏 | ✓ 一致 |
| `code-fixer.ts:120` — `noOpDetect: true` は code-fixer のみ | ✓ 一致 |
| `fixer-helpers.ts:52-65` — `getLatestJudgeFindings(state, judgeStepName)` seam | ✓ 一致 |
| `report-result.ts:40-75` — `Finding.file` 必須フィールド | ✓ 一致（line 44: `file: string`） |
| `round-git-scope.ts:109-111` — `pipelineManagedPaths(slug)` の 5 パス列挙 | ✓ 一致 |

### Design.md 設計判断の検証

**D1: `collectRoutedFixerFindings` の 3 分岐 precedence**

`code-fixer.ts:buildMessage` の実装（lines 167, 206, 276）を照合した:

- Branch 1（conformance）: `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER)` → `Finding[] | null` を返す。D1 の `if (conformance !== null) return conformance;` と一致 ✓
- Branch 2（coordinator）: `isCoordinatorLoopActive(state)` → `collectParallelFixerFindings(state, needsFixMembers, buildCanonWriteScope(state, deps))`。`buildCanonWriteScope(state, deps)` は `deps.slug` 由来、`buildCanonWriteScopeFromState(state)` は `getJobSlug(state)` 由来 — 同じ slug を使うため等価 ✓
- Branch 3（active-reviewer）: `deriveImplFixerChain(state)` → `resolveActiveReviewer(state, chain)` → `getLatestJudgeFindings(state, active)` と一致 ✓

**D1: import 循環懸念**

`pipeline/types.ts` が `pipeline/reviewer-chain.ts` を import（line 5 確認）するため、`reviewer-chain.ts` への移設は循環を生む。新モジュール `routed-findings.ts` で回避する判断は正当。

**D2: `detectNoOp` パラメータ拡張**

`exempt = findingTargetPaths − pipelineManagedPaths` の減算を検知器内で行う設計を確認。呼び出し元が減算を忘れると `pipelineManagedPaths` が免除されるリスクを検知器側で封じる正当な判断 ✓

**D3: `step.noOpDetect === true` ガード**

`executor.ts:478` の既存 `codeReviewFindingsRoutingActive` 算出と同じイディオムであることを確認 ✓

### spec.md シナリオ vs tasks.md T-04 対応確認

| spec.md シナリオ | T-04 テストケース |
|---|---|
| #927 実例（implementation-notes.md 名指し → approved） | T-04 scenario 1 ✓ |
| 名指し外の change folder ファイルのみ → needs-fix | T-04 scenario 2 ✓ |
| finding が state.json を名指し → needs-fix | T-04 scenario 3 ✓ |
| finding が src/foo.ts を名指し、変更もソースのみ → approved | T-04 scenario 4 ✓ |
| artifact のみの変更（#734 維持） | 既存 6 ケース維持 ✓ |
| approved findings-routing no-op の抑止 | 既存 Req 1 テスト ✓ |

### 既存テスト後退の検証

既存 `executor-no-op.test.ts` ケースを変更後の挙動でトレース:

- **「artifact のみ変更 → needs-fix」**: `steps: {}` → `getLatestJudgeFindings` returns null → `findingTargetPaths = []` → `exempt = ∅` → sourceFiles = [] → needs-fix ✓
- **「Req 1 approved findings-routing → approved」**: `codeReviewFindingsRoutingActive = true` の経路は変更後も維持。`findingTargetPaths = ["src/foo.ts"]` となるが変更ファイルが state.json のみ → exempt に state.json なし → sourceFiles = [] → findingsRoutingApproved=true → 抑止 ✓
- **「Req 4 conformance no-op → needs-fix」**: `getConformanceFixContext` が非 null → branch 1 → conformance findings（file: "src/bar.ts"）→ changedFiles = [] → sourceFiles = [] → findingsRoutingApproved=false（conformance 判定）→ needs-fix ✓

### セキュリティ観点

- **finding.file 由来のパス注入**: 免除は `listChangedFiles`（git 実績）と finding.file の Set 交差。finding が任意のパスを名指しても、fixer が実際に git コミットしない限り効果なし ✓
- **pipelineManagedPaths キャップ**: state.json / events.jsonl 等を finding が名指しても `managed` セットでブロック。検知器内部で強制（呼び出し元依存なし） ✓
- **fixer 自己申告を入力にしない**: 免除集合は `collectRoutedFixerFindings(state)` = state seam 経由の機械的導出。fixer agent の宣言は入力にならない ✓
- **`.specrunner/` 配下の非 pipelineManaged パス**: `pipelineManagedPaths` に含まれない `.specrunner/` 配下ファイルは finding が名指しすると免除対象になりうる。ただし通常 reviewer がこれを名指しすることはなく、finding の発信源（judge）の責務。既存の design 判断範囲内

## 検証できなかった項目

- `collectParallelFixerFindings` の canonScope フィルタリングが coordinator branch で `implementation-notes.md` を正しく通過させることを **runtime で** 確認できていない（spec.md に coordinator branch のシナリオなし）。静的分析（`protectedCanonPaths` に `implementation-notes.md` が含まれないことを確認）では問題なし
- `resolveActiveReviewer` の tie-break（同一 startedAt）が regression-gate を正しく選択することを regression-gate 固有のテストで確認していない（既存テストで間接的に担保）

## Findings 詳細

### [LOW] `collectRoutedFixerFindings` の conformance・coordinator 分岐にシナリオ歯がない

**対象ファイル**: `specrunner/changes/noop-detect-finding-target-exemption/tasks.md`

T-01 の受け入れ基準は「3 分岐を code-fixer.buildMessage と同一 precedence で解決する」と記述するが、T-04 のシナリオはすべて branch 3（active-reviewer）を経由する構成である。

- **branch 1（conformance-triggered）**: finding が change folder doc を名指し、`collectRoutedFixerFindings` が conformance findings からそれを拾い、fixer が当該ファイルだけを修正した場合に no-op が発火しないことを検証するシナリオが存在しない
- **branch 2（coordinator-loop）**: 同様に coordinator branch 経由でのシナリオが存在しない

既存 predicate（`getConformanceFixContext` / `collectParallelFixerFindings`）を再利用するため regression リスクは低く、また conformance-triggered code-fixer が change folder doc を名指しするケースは実例が少ない。ただし 3 分岐を持つ純粋関数の正当性は単体テストで担保するのが望ましく、T-01 の acceptance criteria に `routed-findings.test.ts` を含めるか、T-04 に conformance・coordinator パスのシナリオを追加することで強化できる。

**Resolution**: fixable（テストシナリオの追加で対処可能）
