# Cross-Boundary Invariants Review — Evidence Report

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

Reviewer: cross-boundary-invariants  
Iteration: 1  
Scope: 「実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグ」の検出

---

## 検証対象ファイル

diff 範囲（`git diff main...HEAD --stat` より）:

- `src/core/step/no-op-detect.ts` — detectNoOp に findingTargetPaths / pipelineManagedPaths 追加
- `src/core/step/executor.ts` — detectNoOp 呼び出しに 2 param 追加 + import 2 件
- `src/core/step/routed-findings.ts` — 新モジュール（isCoordinatorLoopActive / getNeedsFixMembers を移設 + collectRoutedFixerFindings を追加）
- `src/core/step/code-fixer.ts` — isCoordinatorLoopActive / getNeedsFixMembers をローカル定義から import に切り替え

---

## 検証した不変条件

### INV-1: noOpDetect ゲートは code-fixer にのみ適用される

**検証対象**: `executor.ts:483` `step.noOpDetect === true` ガード

```typescript
findingTargetPaths: step.noOpDetect === true ? collectRoutedFixerFindings(state).map((f) => f.file) : [],
```

既存の `findingsRoutingApproved` 算出と同一イディオム（`step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false`）を踏襲。`noOpDetect: true` を持つのは `code-fixer.ts:112` のみであることを確認。

→ **不変: 既存と同一、侵害なし** ✓

---

### INV-2: findingsRoutingApproved 抑止経路は新ロジックの影響を受けない

**検証対象**: `no-op-detect.ts:97-104`

```typescript
if (sourceFiles.length === 0) {
  if (params.findingsRoutingApproved === true) {
    return undefined;
  }
  return "needs-fix";
}
```

`findingsRoutingApproved` の判定は `sourceFiles.length === 0` の後。exemption（exempt.has(f)）は `sourceFiles` の構成に影響するが、分岐構造は不変。

TC-008 をトレース: code-review approved + fixable finding (implementation-notes.md 名指し)、変更ファイル = state.json:
- exempt = {implementation-notes.md}
- state.json → artifact、exempt に不在 → sourceFiles = []
- findingsRoutingApproved = true → return undefined ✓

→ **不変: 既存の approved-path 抑止は完全保持** ✓

---

### INV-3: pipelineManagedPaths は finding が名指ししても免除されない

**検証対象**: `no-op-detect.ts:91-92`

```typescript
const managed = new Set(params.pipelineManagedPaths ?? []);
const exempt = new Set((params.findingTargetPaths ?? []).filter((f) => !managed.has(f)));
```

上限減算を検知器内で行う。呼び出し元（executor）が減算を忘れても safe: `detectNoOp` 自身が `managed` から exempt を削る。

TC-004: finding が state.json を名指し、changedFiles = [state.json]:
- pipelineManagedPaths("example") = [..., "specrunner/changes/example/state.json", ...]
- managed = {state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md}
- exempt = findingTargetPaths.filter(f => !managed.has(f)) = {} (state.json が managed に含まれるため除外)
- sourceFiles = [] → needs-fix ✓

→ **不変: pipeline-managed パスの保護は実効的** ✓

---

### INV-4: collectRoutedFixerFindings は code-fixer.buildMessage と同一の分岐 SELECTION を使う

**検証対象**: `routed-findings.ts:96-114` vs `code-fixer.ts:buildMessage`

両者の predicate 関数を共有しているため SELECTION は drift しない:

| Branch | collectRoutedFixerFindings | code-fixer.buildMessage |
|--------|---------------------------|------------------------|
| 1 (conformance) | `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) !== null` | 同一 |
| 2 (coordinator) | `isCoordinatorLoopActive(state)` | 同一（import 経由） |
| 3 (default) | `resolveActiveReviewer(state, deriveImplFixerChain(state))` | 同一 |

→ **不変: 分岐 SELECTION は共有 predicate で担保、drift 不可** ✓

---

### INV-5: isCoordinatorLoopActive / getNeedsFixMembers の移設後の挙動等価性

**検証対象**: `code-fixer.ts` の削除ブロック vs `routed-findings.ts` の新ブロック

`git diff main...HEAD -- src/core/step/code-fixer.ts` でロジック本文を照合:

削除された `isCoordinatorLoopActive`:
```typescript
function isCoordinatorLoopActive(state: JobState): boolean {
  if (!state.reviewers?.length) return false;
  if (getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) !== null) return false;
  const gateRuns = state.steps?.[REGRESSION_GATE_STEP_NAME] ?? [];
  if (gateRuns.length > 0) {
    const lastGate = gateRuns[gateRuns.length - 1];
    if (lastGate?.outcome.verdict === "needs-fix") return false;
  }
  const coordinatorRuns = state.steps?.[CUSTOM_REVIEWERS_STEP_NAME] ?? [];
  if (coordinatorRuns.length === 0) return false;
  const lastCoordinator = coordinatorRuns[coordinatorRuns.length - 1];
  return lastCoordinator?.outcome.verdict === "needs-fix";
}
```

`routed-findings.ts` に移設された実装: **文字単位で同一**。Pure function（副作用なし）であることも不変。

`getNeedsFixMembers` も同様に確認。

→ **不変: 移設後の code-fixer.buildMessage / reads の挙動は完全保持** ✓

---

### INV-6: import グラフの無循環性

**検証対象**: `routed-findings.ts` の import 一覧

```typescript
import { getConformanceFixContext, getLatestJudgeFindings } from "./fixer-helpers.js";
import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";
import { collectParallelFixerFindings } from "../pipeline/findings-ledger.js";
import { buildCanonWriteScopeFromState } from "./canon-write-scope.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../pipeline/types.js";
import { REGRESSION_GATE_STEP_NAME } from "./regression-gate.js";
import { collectFixableFindings } from "./judge-verdict.js";
```

これらのモジュールは `routed-findings.ts` を逆 import しない（新モジュールのため）。`code-fixer.ts` は `routed-findings.ts` を単方向 import する（`code-fixer.ts` → `routed-findings.ts`）。executor も単方向（`executor.ts` → `routed-findings.ts`）。

`pipeline/types.ts` と `reviewer-chain.ts` の既知の循環懸念: `pipeline/types.ts:194` に明記されている既存の制約。`routed-findings.ts` は `reviewer-chain.ts` ではなく `pipeline/types.ts` のみを import しているため回避済み。

→ **不変: import 無循環を維持** ✓

---

### INV-7: Branch 2 の canonScope 等価性

**検証対象**: `routed-findings.ts:104` vs `code-fixer.ts:buildMessage:164`

- `collectRoutedFixerFindings` Branch 2: `buildCanonWriteScopeFromState(state)` → `getJobSlug(state)` → `state.request.slug` → `buildScopeForSlug(slug)`
- `code-fixer.buildMessage` Branch 2: `buildCanonWriteScope(state, deps)` → `deps.slug` → `buildScopeForSlug(slug)`

`buildCanonWriteScope` の `_state` param は未使用（`deps.slug` のみ使用）。`state.request.slug` と `deps.slug` は同一 request から導出される同一値。`buildScopeForSlug` はメモ化なし pure function。

→ **不変: Branch 2 の canonScope は等価** ✓

---

### INV-8: #927 regression-gate シナリオの経路

**検証対象**: regression-gate → code-fixer 起動時の `collectRoutedFixerFindings` 経路

#927 は composed path（custom reviewers + regression-gate）。regression-gate が needs-fix → code-fixer 起動:

1. Branch 1: `getConformanceFixContext` = null（conformance 未起動）→ スキップ
2. `isCoordinatorLoopActive`:
   - `state.reviewers.length > 0` → 標準 path に非ず
   - `gateRuns` 非空 + `lastGate.outcome.verdict === "needs-fix"` → **return false**
3. Branch 3: `resolveActiveReviewer` が regression-gate を選択（最新 startedAt）
4. `getLatestJudgeFindings(state, "regression-gate")` → fixable finding (implementation-notes.md) を返す
5. `collectFixableFindings` → resolution=fixable → 通過
6. exempt = {implementation-notes.md}
7. changedFiles = [implementation-notes.md] → exempt に存在 → sourceFiles 長 > 0 → no-op 発火せず

→ **不変: #927 の経路が正しく免除される** ✓

---

## 意図的な設計上の非対称性（Finding ではないが文書化）

### Branch 3: collectFixableFindings フィルタ vs buildMessage 全 findings の差異

`collectRoutedFixerFindings` Branch 3 は `collectFixableFindings`（resolution === "fixable"）でフィルタするが、`code-fixer.buildMessage` Branch 3 はフィルタなしで全 findings を agent に渡す。

この非対称性は**意図的な設計選択**（design.md 記載）であり、不変条件の侵害ではない:

- `informational` finding が名指しする変更フォルダ doc を fixer が変更しても exempt に入らない
- fixer が critical/high fixable finding を修正した上で doc も更新した場合 → source file が sourceFiles に残る → no-op 発火なし（問題なし）
- fixer が critical/high finding を無視して informational doc だけ更新した場合 → sourceFiles = [] → needs-fix（**correct: sabotage 検知が正常動作**）

approved path（findingsRoutingApproved = true）では informational finding が exempt に入らなくても `findingsRoutingApproved` が抑止するため実害なし。

この非対称性の存在・意図・帰結は `routed-findings.ts:107-109` のコメントで文書化されている。

---

## 不変条件の総括

| 不変条件 | 確認結果 |
|---------|---------|
| noOpDetect ゲート（code-fixer のみ） | 保持 ✓ |
| findingsRoutingApproved 抑止経路 | 保持 ✓ |
| pipelineManagedPaths 保護（finding 名指しでも免除不可） | 保持 ✓ |
| completionReason !== "success" 早期 return | 保持（変更なし） ✓ |
| code-fixer.buildMessage / reads の出力挙動 | 保持（predicate 移設のみ） ✓ |
| import 無循環 | 保持 ✓ |
| collectRoutedFixerFindings 分岐 SELECTION = buildMessage 分岐 SELECTION | 共有 predicate で担保 ✓ |
| Branch 2 canonScope 等価性 | 等価 ✓ |
| #927 経路（regression-gate → branch 3 → fixable finding） | 正常動作 ✓ |
| ARTIFACT_PREFIXES 定義の不変 | 変更なし ✓ |
| pipelineManagedPaths 定義の不変 | 変更なし ✓ |

---

## Findings 詳細

### [LOW] `.specrunner/` 配下の pipelineManaged 外パスが finding 名指しで免除候補になる

**対象ファイル**: `src/core/step/no-op-detect.ts`

**証拠**:

`pipelineManagedPaths(slug)` は以下の 5 パスのみを管理対象とする:
- `specrunner/changes/<slug>/state.json`
- `specrunner/changes/<slug>/events.jsonl`
- `specrunner/changes/<slug>/usage.json`
- `specrunner/changes/<slug>/bite-evidence-result.md`
- `specrunner/changes/<slug>/pr-create-result.md`

`ARTIFACT_PREFIXES` には `".specrunner/"` も含まれる。`.specrunner/local/<slug>/liveness.json` のような `.specrunner/` 配下のファイルは `pipelineManagedPaths` に列挙されていない。

もし reviewer が `.specrunner/local/<slug>/liveness.json` を finding の file として名指しした場合:
- `managed` セットに不在 → `exempt` に入る
- fixer が liveness.json を変更すると `sourceFiles` に入り no-op 発火を抑制

**評価**:

通常の reviewer（code-review / custom reviewer / regression-gate）が `.specrunner/` 配下の内部 sidecar ファイルを finding の対象として名指しする動機はなく、現実的な攻撃パスは存在しない。finding の発信源は pipeline が実行する judge であり、fixer 自身（攻撃者）ではない。

liveness.json への fixer の書き込み自体も、実際には code-fixer の write scope 外（gitState = change folder のみ）で発生しないため、多重の防護が機能する。

spec-review で記載された `.specrunner/` 配下への言及（spec-review-result-001.md:70）と同一の観察。

**Resolution**: informational（設計認識済み、対処不要）

---

*この report に verdict 行はない。CLI が typed findings から verdict を導出する。*
