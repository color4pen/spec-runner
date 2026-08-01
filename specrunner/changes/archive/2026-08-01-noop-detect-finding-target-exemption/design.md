# Design: no-op 検知に finding 対象 path の免除を導入する

## Context

code-fixer の no-op 検知（sabotage 対策）は、「修正した」と申告しながら実変更が無い fixer の
verdict を `needs-fix` に override する。判定は「変更ファイルから artifact prefix 配下を一律除外し、
残った source file がゼロなら no-op」である。

- `src/core/step/no-op-detect.ts:16` — `ARTIFACT_PREFIXES = ["specrunner/changes/", ".specrunner/"]`。
  この prefix 一律除外が、change folder 内の canonical doc・補助 doc を含む**全ファイル**を「非ソース」に
  分類する。
- `src/core/step/no-op-detect.ts:64-77` — `sourceFiles = changedFiles.filter(not ARTIFACT_PREFIXES)`。
  `sourceFiles.length === 0` のとき、`findingsRoutingApproved === true`（approved findings-routing の
  legitimate な no-op）でない限り `"needs-fix"` を返す。
- `src/core/step/executor.ts:471-480` — `detectNoOp` の唯一の呼び出し元。呼び出し地点で `state` が
  在圏（`state.branch` / `codeReviewFindingsRoutingActive(state)` を使用済み）であり、finding の
  `file` 集合を state から導出して渡す経路が存在する。
- `src/core/step/code-fixer.ts:120` — `noOpDetect: true` は code-fixer のみ（spec-fixer / build-fixer は
  未設定）。

**問題**: reviewer の finding が change folder 内の doc（例: `implementation-notes.md`）の修正を求める
ケースでは、fixer が指摘どおり当該 doc を修正・commit しても、ARTIFACT_PREFIXES 一律除外により
「no source files changed」= no-op と判定され `needs-fix` に override される。再試行も同一修正は差分ゼロで
同様に消され、pipeline 内で構造的に halt する（毎回 operator 対応が必要）。

**実例（#927）**: regression-gate が「`implementation-notes.md` の記載が実装より stale」（low fixable）を
指摘 → code-fixer が当該節を正しく更新 → no-op 検知が発火し verdict を `needs-fix` に override → 再 fixer も
同様 → halt。この finding クラスは pipeline 内で構造的に解消不能。

**修正方針**: 「finding が名指しする path への変更は、artifact prefix 配下でも仕事として数える」。
免除は finding が実際に名指しした path に限定する point 免除とする。除外 prefix 自体の縮小（ARTIFACT_PREFIXES
を pipelineManagedPaths の個別列挙に置換する等）は採らない — prefix を狭めると「finding と無関係な change
folder doc への書き込み」でも no-op を免れる穴が開き、sabotage 検知の目的を弱めるため。

### 現状コードの前提（本設計で再検証済み）

- `src/core/step/fixer-helpers.ts:52-65` `getLatestJudgeFindings(state, judgeStepName)` — 直近 judge run の
  `toolResult.findings` を返す既存 seam。
- `src/core/pipeline/findings-ledger.ts:80-114` `collectParallelFixerFindings(state, members, canonScope?)` —
  並列 round の needs-fix member 由来 findings を集約する既存 seam。
- `src/core/step/code-fixer.ts:73-106` `isCoordinatorLoopActive(state)` / `getNeedsFixMembers(state)` —
  code-fixer 内の private predicate。coordinator（custom reviewer）loop 起動を識別する。
- `src/core/step/code-fixer.ts:126-345` `reads` / `buildMessage` — fixer に渡す findings を **3 分岐**の
  precedence で解決する:
  1. conformance 由来（`getConformanceFixContext(state, CODE_FIXER) !== null`）→ conformance findings
  2. coordinator loop（`isCoordinatorLoopActive(state)`）→ `collectParallelFixerFindings(state,
     getNeedsFixMembers(state), buildCanonWriteScope(state, deps))`
  3. 通常（active reviewer）→ `getLatestJudgeFindings(state, resolveActiveReviewer(state,
     deriveImplFixerChain(state)))`
  これが「当該 fixer run に routing された findings」を決める**正本の routing precedence**である。
- `src/core/pipeline/round-git-scope.ts:109-111` `pipelineManagedPaths(slug)` — state.json /
  events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md の個別列挙。
- `src/kernel/report-result.ts:40-44` `Finding.file` — 必須の worktree 相対 path。
- `src/core/step/canon-write-scope.ts:81-83` `buildCanonWriteScopeFromState(state)` — deps 無しで
  `getJobSlug(state)` から CanonWriteScope を構築する既存関数（並列 branch の canonScope 導出に使える）。
- `src/core/step/__tests__/executor-no-op.test.ts:190-212` — 「artifact のみ変更 → needs-fix」を固定。
  finding が change folder doc を名指しするケースの期待値は存在しない。

#927 は composed path（custom reviewer 群 + regression-gate）で発生する。regression-gate needs-fix が
fixer を起動すると `isCoordinatorLoopActive` は `false`（`code-fixer.ts:79-82`）→ 通常 branch（3）へ落ち、
`resolveActiveReviewer` が regression-gate を返し `getLatestJudgeFindings(regression-gate)` から finding を
得る。すなわち #927 は上記 branch 3 を通る。

## Goals / Non-Goals

**Goals**:

1. **finding 対象 path 集合を detectNoOp に注入する**。executor の no-op 判定地点で、当該 code-fixer run に
   routing された findings の `file` 集合を state から機械的に導出し（既存 seam の再利用）、`detectNoOp` に
   渡す。導出は agent の自己申告を入力にしない（要件 1）。
2. **finding 対象 path の変更を仕事として数える**。sourceFiles 判定で、変更ファイルが finding 名指し集合に
   含まれる場合は artifact prefix 配下でも除外しない（要件 2）。
3. **免除の上限**: `pipelineManagedPaths` は finding が名指ししても仕事に数えない（要件 3）。
4. **既存挙動の保存**: finding が名指ししない change folder ファイルのみの変更 → 従来どおり no-op。
   `findingsRoutingApproved` の抑止経路・`completionReason !== "success"` の早期 return・`noOpDetect` の
   適用範囲（code-fixer のみ）は不変（要件 4）。

**Non-Goals**（request のスコープ外に一致）:

- spec-fixer / build-fixer への `noOpDetect` の新規適用。
- ARTIFACT_PREFIXES の縮小・pipelineManagedPaths への置換（上記理由で却下）。
- no-op 検知以外の sabotage 対策（bite-evidence 等）の変更。
- code-fixer.buildMessage の prose / findingsPath / branch 構造の変更（挙動不変を維持する）。

## Decisions

### D1: 「当該 fixer run に routing された findings」を単一の純粋関数で導出する（免除集合の source of truth）

**決定**: code-fixer が実際に findings を解決する 3 分岐 precedence（Context 参照）を mirror する純粋関数
`collectRoutedFixerFindings(state): Finding[]` を追加し、その `file` 集合を免除集合とする。導出は既存 seam
（`getConformanceFixContext` / `collectParallelFixerFindings` / `getLatestJudgeFindings` /
`resolveActiveReviewer` / `deriveImplFixerChain` / `isCoordinatorLoopActive` / `getNeedsFixMembers` /
`buildCanonWriteScopeFromState`）の再利用のみで構成し、fixer agent の自己申告は入力にしない。

配置: 新モジュール `src/core/step/routed-findings.ts` を作り、`collectRoutedFixerFindings` と、code-fixer.ts
から移設した `isCoordinatorLoopActive` / `getNeedsFixMembers` を置く。code-fixer.ts はこの 2 predicate を
新モジュールから import して従来どおり使う（挙動不変）。

**なぜ faithful な導出が必須か**: 免除は「finding が**実際に**名指しした path」に限定しなければならない。
- 導出が routing の**上位集合**（例: 全 reviewer の全 finding を無条件 union）だと、当該 run に routing され
  ていない古い finding の path まで免除され、その doc だけ書いた fixer が「仕事あり」と誤判定される
  → **sabotage 検知の fail-open**。
- 導出が routing の**部分集合**（例: conformance / 並列 branch を落とす）だと、正当な doc 修正が免除され
  ず false escalation が残る。

したがって「code-fixer が findings を選ぶのと同一の precedence」で導出することが必要十分。分岐 SELECTION は
buildMessage と**同一の predicate 関数**を共有するため drift しない。branch 内の findings MAPPING（並列 branch
の `canonScope` 適用など）のみ再表現するため、drift surface は最小。両者に相互参照コメントを付す。

**なぜ新モジュールか**: `isCoordinatorLoopActive` / `getNeedsFixMembers` は code-fixer.ts の private。これを
executor から使うために code-fixer.ts を executor に import させると、executor の import graph に agent
definition / prompt など重い依存が流入する（executor は core 機構層）。中立な light モジュールへ移設し、
executor はそこだけを import することで層の分離と import graph の軽さを保つ。reviewer-chain.ts へ置く案は、
`isCoordinatorLoopActive` が要する `CUSTOM_REVIEWERS_STEP_NAME`（pipeline/types.ts）が reviewer-chain →
pipeline/types の循環を生むため不可（pipeline/types.ts:194 のコメントが同循環を明示）。

**代替案**:
- **buildMessage の routing を collectRoutedFixerFindings に一本化（buildMessage も消費）**: drift を完全消去
  できるが、buildMessage は branch identity（prose / 読む result file）も必要とするため、完全な collapse は
  message 出力の後退リスクを伴う。本 request は挙動不変を優先し却下（Open Questions に将来の hardening と
  して記す）。
- **agent の自己申告（「このファイルを直した」宣言）を免除入力にする**: 検知器の入力を被検知者の自己申告に
  すると sabotage 対策として fail-open。architect 却下判断に一致。

### D2: `detectNoOp` に免除集合と上限集合を注入し、免除・上限を検知器内で適用する

**決定**: `detectNoOp`（`no-op-detect.ts`）の params に 2 つの optional を追加する:
- `findingTargetPaths?: string[]` — 当該 run に routing された findings の `file` 集合（免除候補）。
- `pipelineManagedPaths?: string[]` — 免除の上限（この集合の path は finding が名指ししても仕事に数えない）。

sourceFiles 判定を次に変更する（意味: `exempt = findingTargetPaths − pipelineManagedPaths`。変更ファイルが
`exempt` に属せば artifact prefix 配下でも source として数え、そうでなければ従来どおり artifact prefix で除外）:

```
managed = Set(pipelineManagedPaths ?? [])
exempt  = Set((findingTargetPaths ?? []).filter(f => !managed.has(f)))
sourceFiles = changedFiles.filter(f =>
  exempt.has(f) ? true : !ARTIFACT_PREFIXES.some(p => f.startsWith(p))
)
```

両 param 省略時（`exempt = ∅`）は現行と完全一致（pipelineManagedPaths は元々 ARTIFACT_PREFIXES 配下なので
除外挙動不変）。上限の減算を**検知器内**で行うことで「pipelineManagedPaths は finding が名指しても仕事に
数えない」という不変を呼び出し元に依存せず局所化する（歯を検知器に置く）。`findingsRoutingApproved` の
抑止経路・`sourceFiles.length > 0` の早期 undefined・`completionReason !== "success"` の早期 return は不変。

**代替案**:
- **上限の減算を呼び出し元で行い detectNoOp には exempt のみ渡す**: 将来の呼び出し元が減算を忘れると
  pipelineManagedPaths が免除されうる（fail-open）。検知器内で減算する方が不変が強い。却下。
- **detectNoOp に `state` を渡して内部で導出**: generic な「source 変更ゼロ検出」責務に code-fixer 固有の
  routing 知識が流入する。導出は D3 の呼び出し側に置き、detectNoOp は path 集合を受け取るだけに保つ。

### D3: executor が免除集合を算出して渡す（`step.noOpDetect === true` ガード）

**決定**: `executor.ts:471-480` の `detectNoOp` 呼び出しに次を追加する:
- `findingTargetPaths: step.noOpDetect === true ? collectRoutedFixerFindings(state).map(f => f.file) : []`
- `pipelineManagedPaths: pipelineManagedPaths(deps.slug)`

import 追加: `collectRoutedFixerFindings`（`../step/routed-findings.js`）、`pipelineManagedPaths`
（`../pipeline/round-git-scope.js`）。`step.noOpDetect === true` ガードにより、非 code-fixer step で routing
導出を走らせない（既存 `findingsRoutingApproved` の算出と同じイディオム）。executor は既に reviewer-chain
routing の知識を持つ層であり、pipeline 知識の追加配置として整合する。

## Risks / Trade-offs

### [Risk] 免除導出が code-fixer.buildMessage の routing と drift する

drift すると、上位集合化 → sabotage fail-open、部分集合化 → false escalation のいずれかに倒れる。

**Mitigation**: `collectRoutedFixerFindings` は buildMessage と**同一の predicate 関数**を共有するため分岐
SELECTION は drift しない。branch 内 mapping（並列 branch の `canonScope`）を buildMessage と一致させ、両者に
相互参照コメントを付す。#927 相当を含む scenario をテストで固定する（T-04）。

### [Risk] pipelineManagedPaths を finding が名指ししたとき免除されてしまう

state.json 等を finding が名指しすると、上限が無ければ pipeline 自身の churn が「仕事」に数えられ sabotage を
素通りさせる。

**Mitigation**: D2 で `exempt = findingTargetPaths − pipelineManagedPaths` を検知器内で強制。finding が
state.json を名指しても needs-fix を返すことをテストで固定する（要件 3）。

### [Risk] 既存 no-op 挙動の後退

**Mitigation**: 新 param は optional（省略時 exempt=∅）。既存の 6 ケース（`executor-no-op.test.ts`）は
reviewer 履歴なし or finding が変更ファイルを名指ししない構成のため、`findingTargetPaths` の有無に関わらず
同一 verdict を返す（無変更で green）。`findingsRoutingApproved` 経路（Req 1）・#734 escalate（Req 2）・
conformance escalate（Req 4）も、変更ファイル集合が空 or 名指し外のため免除の影響を受けない。

### [Risk] executor → routed-findings の import による循環

**Mitigation**: `routed-findings.ts` は light な純粋 routing helper のみを import（agent/prompt 定義に非依存）。
`pipeline/types`（`CUSTOM_REVIEWERS_STEP_NAME`）・`regression-gate`・`fixer-helpers`・`findings-ledger`・
`reviewer-chain`・`canon-write-scope` はいずれも routed-findings を import し返さない（新モジュール）。
executor は routed-findings を単方向 import する。

## Open Questions

なし。将来の hardening として、code-fixer.buildMessage の findings 解決を
`collectRoutedFixerFindings` に一本化して drift surface を完全消去する案があるが、message 出力の挙動不変を
優先し本 request では採らない（Non-Goals）。
