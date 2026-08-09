# Design: regression-gate を新規退行の検出に限定し low/medium 偽ループを解消する

## Context

custom reviewer が存在する job では、code-review + custom reviewer が収束した後に
`regression-gate` が走り、レビュー中に指摘された fixable findings（findings ledger）が
最終コードでも残っているかを台帳照合する。現状 3 箇所が相互に矛盾しており、
`approved + fixable` の one-shot 前進経路で処理されるはずの low finding が gate に
引き戻され、修正されないことが確定している対象を最大 3 周（`REGRESSION_GATE_MAX_ITERATIONS = 3`）
再検証する偽ループが発生する（issue #952、直近 12 job で needs-fix 5/5 が偽・真の退行 0）。

コード上の事実（実測で確認済み）:

- `reviewer-chain.ts:165-186` — reviewer `approved` かつ fixable findings ありのとき
  `code-fixer → next` へ one-shot で前進する（設計意図通り）。`approved` 到達点では
  critical/high は needs-fix、decision-needed は escalation に落ちているため、
  ここで routing される fixable は実質 low/medium。
- `judge-verdict.ts:188-190` `collectFixableFindings` — `resolution === "fixable"` のみ、severity 不問。
- `routed-findings.ts:113` — 上記を Branch 3（standard reviewer path）の code-fixer routing に使用。
- `code-fixer.ts` の prompt 全 5 変種 — 「Ignore LOW severity findings」で入力を severity 再フィルタして捨てる。
  つまり「渡してから無視させる」二重フィルタ。
- `no-op-detect.ts:98` + `executor.ts:482` — `approved` findings-routing 経路で
  code-fixer が何も変更しなくても `findingsRoutingApproved === true` により no-op は escalation されない。
  したがって偽ループは **code-fixer 段では起きず**、gate 段で起きる。
- `findings-ledger.ts:35 collectFindingsLedger` / `:131 collectSpecReviewLedger` —
  reviewer の fixable finding を severity・修正実績不問で全件収集。未修正 low もここに残る。
- `regression-gate.ts:112-122 skipWhen` / `:143-150 buildMessage` — `collectSpecReviewLedger` +
  `collectFindingsLedger` を `dedupeFindings` で合成した ledger を gate 入力にする。
- `judge-verdict.ts:210-224 deriveRegressionGateVerdict` — `findings.some(f => f.resolution === "fixable")`
  で needs-fix（severity・既知性不問）。gate agent は退行を severity=high / resolution=fixable で報告し、
  未修正 low もこの規則で needs-fix を誘発する。
- `regression-gate-system.ts:25` — ledger を「code-fixer が修正した fixable findings の完全リスト」と
  記述するが、実装は「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」を渡している。
  `regression-gate.ts:58 buildLedgerBlock` の "The following findings were fixed during this job" も同様に虚偽。

fingerprint（既知性判定）は既存機構を流用する: `dedupeFindings` の dedupe key
`${f.file}|${f.line ?? ""}|${f.title}`（`findings-ledger.ts:170`）が唯一の同一性キー。

## Goals / Non-Goals

**Goals**:

- regression-gate が needs-fix を返すのは **新規検出の退行**（既知未修正 finding と同一と判定されない
  fixable finding）に限定する。approved の one-shot 経路へ routing 済みで未修正のまま残る finding は
  needs-fix の事由にしない（要件 1）。
- code-fixer への routing 対象集合と code-fixer prompt の指示対象を一致させ、「渡してから無視させる」
  二重フィルタを解消する。severity 別の LOW 除外を routing 層 1 箇所で表現し、prompt 全 5 変種から
  `Ignore LOW severity findings` 行を除去する（要件 2）。
- regression-gate の ledger 説明を実装の実態に一致させる（要件 3）。
- gate の本務を保つ: 既知未修正と同一でない fixable finding には従来通り needs-fix を返す（要件 4）。

**Non-Goals**:

- one-shot 前進経路（reviewer-chain の transition 構造・`approved+fixable→code-fixer` の発火条件）自体の再設計。
  `reviewer-chain.ts:176` の transition `when`（fixable 有無で code-fixer を起動する条件）は変更しない。
- reviewer/fixer 収束ロジックの循環依存整理（#812）。
- findings ledger の jobId キー化（#944）。
- code-fixer が「修正した finding の一覧」を構造化報告する仕組みの導入（fixer 自己申告依存を増やすため不採用）。
- ledger を fixed-only に変える案（同上の理由で不採用。ledger は全件のまま、除外は gate 判定層で行う）。
- `Fix MEDIUM ... only if they do not require design changes` の再設計（agent の意味判断であり
  routing の機械フィルタに移せない。本変更では現状維持。Risks の残存ループ参照）。

## Decisions

### D1: 既知未修正の除外は gate の判定層で指紋照合により行う（要件 1・4）

gate の入力 ledger（`collectSpecReviewLedger` + `collectFindingsLedger`）は全件のまま維持し、
gate agent は従来通り全 ledger エントリを検証してよい。除外は **verdict 導出の直前の入力整形**で行う:

- gate agent が報告した findings のうち、fingerprint が **既知未修正集合**に一致するものを
  verdict 導出の入力から落とす。残った findings に対して従来の `deriveRegressionGateVerdict` を適用する。
- **既知未修正集合** = gate の ledger のうち routing 層の severity policy で code-fixer に routing
  されない finding = **severity `low` の ledger エントリ**（ledger は既に fixable のみ）。
- fingerprint は `dedupeFindings` と同一キー `${file}|${line}|${title}` を流用する（要件 1 の「既存
  dedupe / 指紋機構を流用」）。gate agent は退行を ledger の元 file/line/title で報告するため
  （`regression-gate-system.ts:43-46`）、既知未修正エントリの fingerprint と一致する。

配置: `deriveStepCompletion`（`step-completion.ts:195-211` の isJudgeStep 分岐）で、
`step.name === REGRESSION_GATE_STEP_NAME` のときのみ、`verdictFn` 呼び出し前に findings を整形する。
既存の `step.name === STEP_NAMES.SPEC_REVIEW` 特別扱い（`:208-209`）と同じパターン。
既知未修正集合の算出と除外は純関数として `findings-ledger.ts` に置き、単体テスト可能にする。

**import cycle への注意**: `computeRegressionLedger` のシグネチャは
`computeRegressionLedger(reviewerChain: string[], state, canonScope?)` とし、
`deriveImplReviewerChain` を内部で呼ばない。理由: `findings-ledger.ts` が `reviewer-chain.ts` を
import すると `findings-ledger.ts` → `reviewer-chain.ts` → `regression-gate.ts` → `findings-ledger.ts`
の間接循環が成立するため。呼び出し元 `step-completion.ts` が `deriveImplReviewerChain(state)` を
実行して reviewerChain を求め、`computeRegressionLedger` に渡す。

`step-completion.ts` が import するのは: `computeRegressionLedger` / `excludeKnownUnfixedRegressions`
（`findings-ledger.ts`）、`REGRESSION_GATE_STEP_NAME`（`regression-gate.ts`）、`deriveImplReviewerChain`
（`reviewer-chain.ts`）。import cycle なし（`findings-ledger.ts` は `reviewer-chain.ts` を参照しない。
`findings-ledger.ts` / `regression-gate.ts` は `step-completion.ts` を参照しない）。

**Rationale: why not code-fixer 自己申告 / not ledger 判定基準変更。**
gate 判定層に置くのは、（a）ledger を fixed-only にする案・fixer 自己申告を根拠にする案は
agent 自己申告を検証なしに信頼するため architect が却下済み、（b）gate agent 出力の severity は
一律 `high`（`regression-gate-system.ts:43-45`）なので severity では既知未修正を判別できず、
fingerprint 照合が必要（gate finding は high だが元 ledger エントリは low）、
（c）`deriveRegressionGateVerdict` を純粋なまま保てば既存単体テスト（`judge-verdict.test.ts:170-204`）が
無改変で green を維持できる（要件 5 のテスト churn 最小化）。

**Alternatives considered**:

- `deriveRegressionGateVerdict` のシグネチャに既知未修正集合を追加（「判定自体」案）。
  → `judgeVerdictFn` の 4 引数契約（`step-types.ts:307`）を全 judge step で拡張することになり、
  executor の generic 呼び出し（`:206`）に state 依存の第 5 引数を通す必要がある。入力整形案の方が
  影響が局所的で、`deriveRegressionGateVerdict` の契約と既存テストを保てる。採らない。
- gate の ledger 構築段（`regression-gate.ts` buildMessage）で low を除外して gate に渡す。
  → architect の「gate は従来通り全件を検証してよい」に反し、また要件 1 の「判定層で除外」から外れる。採らない。

### D2: LOW 除外を routing 層 1 箇所で表現し、prompt の severity 再フィルタを撤去する（要件 2）

severity policy を単一関数 `selectFixerTargetFindings(findings)`（＝ fixable かつ severity ≠ low）として
`judge-verdict.ts` に新設し、これを LOW 除外の唯一の表現箇所とする。

適用:

- `routed-findings.ts:113`（Branch 3, standard reviewer path の no-op 免除集合導出）を
  `collectFixableFindings` から `selectFixerTargetFindings` に差し替える。
- `code-fixer.ts` の standard path が code-fixer に見せる findings（`getLatestJudgeFindings` 由来、`:241`）を
  `selectFixerTargetFindings` で絞る。これにより「routing 対象集合＝prompt 指示対象」が一致する。
  Branch 3 と code-fixer standard path が同じ policy を通るため、既存の「routing precedence を一致させる」
  不変（`code-fixer.ts:19-20` / `routed-findings.ts:83-85`）を保つ。
- prompt 全 5 変種（`code-fixer.ts:151,194,221,272,293` の `Ignore LOW severity findings`）を除去する。
  残る `Fix all HIGH and CRITICAL ...` / `Fix MEDIUM ... only if ...` は非 LOW findings への指示として
  引き続き有効。

D1 の既知未修正集合（ledger の low）は本 policy の裏返し（`severity === "low"`）であり、
同一 severity 述語を参照する。「routing で落とした LOW は ledger 側でも needs-fix 事由にならない」
（要件 1 と一貫）が単一述語で保証される。

**Rationale**: 二重フィルタ（routing は渡す・prompt は捨てる）の解消は、片方（routing）に判断を集約し
他方（prompt）から判断を消すのが最小。severity 述語を 1 関数に固定することで、routing と gate 判定の
LOW 定義が drift しない。

**Alternatives considered**:

- prompt の `Ignore LOW` 行だけ消し routing に絞りを入れない案。→ prompt が全 findings を「修正せよ」と指示し
  LOW も修正対象になる。要件の「LOW を修正対象外とする」に反する。採らない。
- 実装を fixed-only ledger に寄せて prompt 記述を正とする案。→ D3 参照、architect 却下。採らない。

**Scope 限定（coordinator / conformance path）**: coordinator path（`collectParallelFixerFindings`）と
conformance path（`getConformanceFixContext`）の finding 集合には `selectFixerTargetFindings` を適用せず、
prompt からの `Ignore LOW` 行除去のみ行う。理由: (a) 偽ループは standard reviewer→gate 経路であり、
これらは needs-fix 判定（critical/high 必須）を経て routing されるため one-shot low 経路を持たない、
(b) 仮にこれらの経路の low が gate ledger に入っても D1 の既知未修正除外が backstop となりループしない、
(c) `collectParallelFixerFindings` / `getConformanceFixContext` を触らないことで findings-ledger 系
既存テストの改変を避ける。coordinator/conformance の code-fixer は routing 済み findings を全件対象にする
（LOW 行の除去は「実在する非適合を無視しない」方向で無害）。

### D3: ledger 説明を実装の実態に一致させる（要件 3）

- `regression-gate-system.ts:25` の「code-fixer が修正した fixable findings の完全リスト」を
  「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」に修正する。
- 同ファイル内で「修正した findings」を前提にした表現（Question `:21`、Method `:43` の「修正が消えた」等）を、
  「reviewer が指摘した fixable finding が最終コードにも該当しているか（＝退行していないか）」の
  実態表現に揃える。ただし gate の Method（各 ledger エントリを検証し退行を報告）自体は変えない。
- `regression-gate.ts:58 buildLedgerBlock` の "The following findings were fixed during this job" も
  実態（reviewer が指摘した fixable findings。全てが修正済みとは限らない）に合わせて修正する。

**Rationale**: 「修正した findings」という虚偽記述が残っていないこと（受け入れ基準）を満たす。gate の
振る舞いは D1 の判定層で担保されるため、prompt は説明の正確性のみを直す。

**Alternatives considered**: 実装を「fixed-only ledger」に変えて現 prompt 記述を真にする案。
→ 修正済み判定を fixer 自己申告か diff 推測に依存させることになり architect 却下。記述側を実装に寄せる。

### D4: 既存テストの期待値変更（要件 5）

期待値変更が必要な既存テスト: **TC-FF-C-005（`tests/unit/step/fixer-findings.test.ts`）の 1 件**。

- TC-FF-C-005 は standard path の buildMessage が LOW findings を prompt の findings block に
  埋め込むことを期待している。D2 により buildMessage にも `selectFixerTargetFindings` を適用する
  ため、期待値を「LOW findings は埋め込まれない」に変更する。routing 対象集合と prompt 対象集合の
  一致（要件 2）はこの変更で成立する。

根拠:

- `judge-verdict.test.ts:170-204`（`deriveRegressionGateVerdict`）: 純関数は無改変のため
  `low fixable → needs-fix`（`:193-195`）等を含め全て green のまま。既知未修正除外は判定層の
  入力整形（新規純関数）で行うため raw 関数の期待値は変わらない。
- `judge-verdict.test.ts:349-384`（TC-021 regression-gate + medium fixable → needs-fix）: state に ledger 無し
  → 既知未修正集合 空、finding は medium → 除外対象外 → needs-fix 維持。green。
- `step-completion-missing-file-finding.test.ts`（step name "regression-gate"）: state.steps 空
  → 既知未修正集合 空 → 除外 no-op → 従来の verdict 維持。green。
- `routed-findings.test.ts`（Branch 3 テスト）: helper が生成する finding は severity `high`（`:66,123,184`）
  → `selectFixerTargetFindings` で保持 → 全 assertion green。TC-005-extended の informational は
  fixable でないため元から除外されており挙動不変。
- `regression-gate-step.test.ts`（buildMessage / reads / writes）: ledger 構築は無改変、buildLedgerBlock の
  前置き文言変更のみで、テストは finding title/file の包含と empty-ledger notice を見る（`:171,200,214,231`）
  → green。
- `findings-ledger.test.ts`: `collectFindingsLedger` / `collectSpecReviewLedger` / `collectParallelFixerFindings`
  のシグネチャ・挙動を変えないため green。
- prompt 文字列（`Ignore LOW` / 「修正した」）を assert するテストは存在しない（全文検索で 0 件）ため
  prompt 変更でのテスト破綻はない。

追加する新規テストは spec.md の Scenario に対応し、既存テストの改変ではない（Tasks T-04 参照）。

## Risks / Trade-offs

- [Risk] MEDIUM で「design change を要する」finding は routing 済み（非 low）だが code-fixer が
  `Fix MEDIUM ... only if they do not require design changes` により修正を見送ることがある。この finding は
  既知未修正集合（low のみ）に入らないため、gate が退行として needs-fix を返し残存ループを起こしうる。
  → Mitigation: 本 request の scope は LOW（issue #952 実測 needs-fix 5/5 は全て low 偽ループ、
  medium-design-change 起因は観測 0）。medium-design-change の routing 化は agent の意味判断であり
  機械フィルタに移せないため Non-Goal とする。将来 medium も対象化する場合は D2 の severity 述語を
  拡張し既知未修正集合の定義も連動させる 1 箇所改修で済む。
- [Risk] gate agent が退行報告時に ledger の file/line/title を正確に転記しないと fingerprint が一致せず、
  既知未修正 low が新規退行と誤判定され needs-fix になる。
  → Mitigation: 誤判定の向きは fail-safe（gate が拾い過ぎる側）で、退行見逃しにはならない。file/line/title
  照合は「修正済み」自己申告に依存しないため architect の却下理由（自己申告信頼）には該当しない。
- [Trade-off] approved + low-only の reviewer では transition（scope 外・不変）が依然 code-fixer を起動し、
  非 low target が空のため 1 セッションを消費する。ただし `findingsRoutingApproved` により no-op は
  escalation されず前進する（現状と同じ挙動、gate の 3 周ループのみが解消される）。

## Open Questions

- なし（architect 評価で主要分岐は決定済み: 判定層除外・prompt を実装に寄せる・LOW 除外は routing 1 箇所）。
