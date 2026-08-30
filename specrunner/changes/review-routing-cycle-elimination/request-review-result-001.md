# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. Cycle の実在確認（コードアサーション）

**Cycle 1: `pipeline/reviewer-chain ↔ step/fixer-helpers`**

- `src/core/pipeline/reviewer-chain.ts:19`  
  `import { getConformanceFixContext } from "../step/fixer-helpers.js"` — value import ✓
- `src/core/step/fixer-helpers.ts:14`  
  `import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js"` — value import ✓

直接の双方向 value-import SCC を確認。

**Cycle 2: `pipeline/reviewer-chain → step/regression-gate → pipeline/findings-ledger → step/fixer-helpers → pipeline/reviewer-chain`**

- `src/core/pipeline/reviewer-chain.ts:18`  
  `import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js"` — value import ✓
- `src/core/step/regression-gate.ts:27`  
  `import { computeRegressionLedger, computeLedgerRef } from "../pipeline/findings-ledger.js"` — value import ✓
- `src/core/step/regression-gate.ts:28`  
  `import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js"` — value import ✓
- `src/core/pipeline/findings-ledger.ts:14`  
  `import { getLatestJudgeFindings } from "../step/fixer-helpers.js"` — value import ✓
- `src/core/step/fixer-helpers.ts:14`  
  `import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js"` — value import ✓

SCC が `reviewer-chain → regression-gate → findings-ledger → fixer-helpers → reviewer-chain` を形成することを確認。

**追加観察（cycle への意識）**:  
`pipeline/findings-ledger.ts` のコメント（L213–218, L264–268）に「findings-ledger.ts → reviewer-chain.ts → regression-gate.ts → findings-ledger.ts という import cycle を避けるため reviewerChain を呼び出し元から受け取る」と明示されており、開発チームが既にこの構造負債を認識していることを確認。

---

### 2. 既存 Architecture Test の適用範囲

`tests/unit/architecture/core-invariants.test.ts` を読み込み確認:

- **B-1〜B-18 / DSM closure**: 層間（domain ↔ adapter、core/ ↔ shared-kernel 等）の import 方向を検査するが、**同一 domain 層内（core/pipeline ↔ core/step）の intra-domain SCC は検査対象外**。
- DSM whitelist では `domain` 層の自己参照（同層 import）を常に許可しているため、`pipeline/` ↔ `step/` 間の cycle は構造的に検出されない。

request の主張「既存の architecture tests は B-1〜B-18 と DSM closure の違反を検知しているが、同一 domain 層内の value-import SCC は対象外」を確認。

---

### 3. Base Commit の照合

`git log --oneline` で `96f4db6a feat: test-materialize 廃止後に保証モデルが成立していない bite-evidence を削除する (#1098)` を確認。  
request 記載の `96f4db6a49d3936c99a9f62bcbaa531a096db2e4`（PR #1098 merge 後 main）と一致。

---

### 4. Requirements の実現可能性検証

**Requirement 1（中立 pure boundary）**:  
移動対象の識別子（`REGRESSION_GATE_STEP_NAME`, chain 導出・解決関数群, `getConformanceFixContext`, ledger 変換）はいずれも pure 関数であり、I/O 依存なし。`core/` 内に新規 module ファイルを配置して cycle を断ち切れる設計。  
`pipeline/types.ts:199` では `CUSTOM_REVIEWERS_STEP_NAME` の circular import リスクを既に string literal で回避しており、同様の手法が確立済み。

**Requirement 2（一方向依存）**:  
`review-routing` モジュールを `core/pipeline` および `core/step` の両方から参照される共通層として配置することで、`pipeline → review-routing ← step` の一方向依存に収束できる。新規 layer 追加は不要（既存 `core/` domain 層内）。

**Requirement 3（振る舞い不変）**:  
対象が pure 関数のみのため、関数シグネチャと実装を維持すれば observable behavior は変わらない。STANDARD_TRANSITIONS・FAST_TRANSITIONS の生成は `buildReviewerChainTransitions` 呼び出しで確認済み（`types.ts:267`, `types.ts:318`）。

**Requirement 4（cycle 検査）**:  
静的解析（`fs.readFileSync` + import path regex / AST parse）で import graph を構築し SCC 検出（Tarjan / Kosaraju）する architecture test は実装可能。`import type` を除外する必要があり、TypeScript AST を使うか正規表現で `import type` を除外するかで実装コストが異なるが、どちらも "既存 production module の読み込みや副作用を必要としない" という制約を満たせる。

**Requirement 5（transition parity）**:  
`buildReviewerChainTransitions` / `buildParallelReviewerTransitions` の出力を関数呼び出しで取得し、step / on / to / when の有無を比較するテストは straightforward に実装可能。既存の `compose-reviewers.test.ts`・`parallel-review-round-canon.test.ts` が手本として使える。

---

### 5. Stop Conditions の妥当性

Stop conditions（振る舞い変更、公開契約変更、新 layer、無関係な大規模変更）は適切に定義されており、実装境界を明確に制限している。

---

## 検証できなかった項目

None。コード・テスト・git 履歴のすべてについて read-only で確認できた。

---

## Findings 詳細

None。報告すべき critical / high / medium 指摘はない。

request は以下を満たしている:

- サイクルの実在を正確に記述している（コードで確認済み）
- 要件が明確・実現可能であり、曖昧な仕様による implementation 崩壊リスクはない
- Non-goals と Stop conditions が適切に定義されており、スコープ逸脱を防げる
- observable behavior を変えないリファクタリングであることが構造的に担保されている
