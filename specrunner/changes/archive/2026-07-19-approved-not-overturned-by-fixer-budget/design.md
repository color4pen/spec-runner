# Design: reviewer の approved を fixer 予算切れで覆さない

## Context

`Pipeline.runInternal`（`src/core/pipeline/pipeline.ts`）は宣言的 transition table を駆動する state machine である。impl フェーズの reviewer（`code-review` / custom reviewer / `regression-gate`）は verdict を返し、findings から導出された `approved` の場合でも「low/medium の fixable finding が 1 件以上ある」と findings-routing により paired fixer（`code-fixer`）へ遷移する。これは approved 済みコードに対する任意の観察修正パスである。

### 現状の発火経路（バグ）

reviewer が `approved`（blocking な critical/high/decision-needed が無い）で fixable finding を持つとき、transition table の findings-routing 行（`buildReviewerChainTransitions`: reviewer-chain.ts:152-164、`buildParallelReviewerTransitions`: reviewer-chain.ts:379-392／regression-gate:434-447）が `to: code-fixer` を選ぶ。その直後、`runInternal` の fixer 突入前 exhaustion 検査（pipeline.ts:493-499）が `budget.getFixerIter(fixer) >= effectiveMax` を判定し、paired fixer が予算切れなら `tryExhaust(..., phase: "review-after-final-fix")` → `handleExhausted` を呼ぶ。

この検査は**直前の reviewer verdict を参照していない**（pipeline.ts:563 の `tryExhaust` も iteration しか見ない）。結果:

1. **承認が覆る**: verdict は approved なのに escalation され `awaiting-resume` で停止し、手動 resume が必要になる。
2. **表示が事実と異なる**: `LOOP_ERROR_CODES[code-review].message`（types.ts:179）の `code-review did not approve after N iterations` が出力されるが、実際は approve 済みで、停止原因（fixer 予算切れ）が読み取れない。

verdict は findings から決定的に導出される（`deriveJudgeVerdict`: judge-verdict.ts:32-40。decision-needed→escalation、critical/high→needs-fix、それ以外→approved）。この regime は変更しない。

### 再現の budget 力学（maxIterations=2 の例）

```
code-review#1 needs-fix → code-fixer#1(fixerIter=1)
code-review#2 needs-fix → code-fixer#2(fixerIter=2)
code-review#3 (bypass 許可で +1 review) approved + fixable
   → findings-routing で to=code-fixer
   → fixer 突入前 exhaustion: getFixerIter(code-fixer)=2 >= max=2 → 現状 escalation（バグ）
```

bypass（pipeline.ts:482-486）は「fixer が上限到達済みなら +1 review を許す」。その +1 review が approved を返しても、fixable があると exhausted fixer へ routing され escalation する。これが承認を覆す構造である。

### 制約

- verdict 導出規則（blocking rules）は変更しない。verdict は所与として routing のみ扱う。
- `maxIterations` の既定値・解決ロジック・bypass 力学は変更しない。
- `needs-fix` 予算切れの escalation 挙動・停止メッセージは変更しない。
- reviewer 以外の loop step（`verification` 等）の exhaustion 挙動は変更しない。
- `handleExhausted` の内部ロジック（escalation verdict 上書き / awaiting-resume 遷移 / resumePoint / `LOOP_ERROR_CODES`）は変更しない。

## Goals / Non-Goals

**Goals**:

- reviewer verdict が `approved` の場合、paired fixer の budget 切れでも exhaustion escalation を発火させない（standard 経路・parallel 経路の両方）。
- 予算切れで省略された fixable finding を破棄せず、reviewer の成果物（findings / review-feedback）を保持する。
- 「任意修正を予算切れで省略した」ことを history と event に、対象 step 名・省略した fixable finding 件数付きで明示する。
- verdict が approved のとき `did not approve` の停止メッセージが出ない状態にする（要件1 の帰結として達成）。

**Non-Goals**:

- verdict 導出規則（blocking rules）の変更。
- `code-fixer` の `maxIterations` 既定値の変更。
- 停止時 hint 文言の全面見直し（要件5 の矛盾解消を超える範囲）。
- reviewer 以外の loop step（verification 等）の exhaustion 挙動の変更。
- managed runtime での parallel custom reviewer サポート拡張（既存 Non-Goal を踏襲）。

## Decisions

### D1: exhaustion 検査を「直前の reviewer verdict」で条件付ける（transition table は変更しない）

修正は **`Pipeline.runInternal`（engine）に閉じる**。transition table の `approved → code-fixer`（findings-routing）行は**削除しない**。理由: 予算に余裕がある通常時は、この行が任意修正を実行する正規パスであり、削除すると通常時の観察修正まで失われる（architect 却下案）。

budget（`ConvergenceBudget` の fixer iteration 数）は `runInternal` のローカル状態にあり `state` には無いため、transition の `when` 述語からは参照できない。よって budget を見た判断は engine 内に置くのが構造的必然である。

engine に閉じる修正は `buildReviewerChainTransitions`（standard）と `buildParallelReviewerTransitions`（parallel）の**両経路を同時に**塞ぐ。どちらの table も「reviewer approved を fixer へ送る findings-routing 行」と「reviewer approved を clean な次段へ送る pass-through 行」を持つ（reviewer-chain.ts:152/167、379/394、434/449）。engine はこの構造を利用する。

- Rationale: budget 依存の判断は engine にしか置けない。engine に置けば table 二経路を一度に塞げる。
- Alternatives considered:
  - transition 行の削除（architect 却下）: 通常時の任意修正まで失う。
  - `code-review` の行だけ修正: custom/parallel 構成で同じ停止が残る（architect 却下）。

### D2: 「approved が exhausted fixer へ routing された」ときは clean approved 遷移先へ再 routing する

`runInternal` で transition を解決した直後（`nextStep` 確定後、episode-reset / exhaustion 検査の**前**）に次を評価する:

条件（すべて満たすとき発火）:

1. `outcome === "approved"`（直前 step = reviewer の verdict が approved）。
2. `nextStep` が fixer（`loopFixerPairs` の値集合に含まれる）。
3. paired fixer の budget が枯渇（`budget.getFixerIter(nextStep) >= resolveMaxIterations(pairedReviewer)`。`pairedReviewer` は既存 `resolvePairedReviewForFixer` で解決。exhaustion 検査 pipeline.ts:495-497 と同一の閾値計算を用いる）。

発火時の動作:

- transition table から `currentStep` の **clean approved 遷移先**を引く（`step === currentStep && on === "approved" && to が fixer でない && (when 無し or when(state)==true)`）。両 table で clean 行はちょうど 1 本存在する（standard: `next(reviewer)`、parallel: code-review→coordinator / regression-gate→conformance）。
- clean 遷移先が得られたら、省略を記録（D3）した上で `nextStep` をその遷移先へ差し替える。`handleExhausted` は**呼ばない**（verdict は approved のまま、reviewer の StepRun は上書きしない）。
- clean 遷移先が得られない（防御的に想定外）場合は差し替えず、従来どおり後続の fixer 突入前 exhaustion 検査に委ねる（fail-safe: 従来挙動 = escalation）。

**なぜ transition 解決直後に置くか**: `nextStep` を差し替えた後、既存の episode-reset（pipeline.ts:433-460）と loop/fixer 突入前 exhaustion 検査（pipeline.ts:482-499）は差し替え後の `nextStep` に対して正しく走る。これにより再 routing 先は「reviewer が fixable 無しで approved した場合」と**完全に同一の bookkeeping**を受ける。すなわち本修正は「approved(+fixable) だが fixer 予算切れ」を「approved(fixable 無し)」と同じ clean pass-through に畳み込むだけであり、下流の budget リセット・遷移・完了処理は既存挙動と一致する。

approved→fixer の間には episode reset が挟まらない（`nextStep`=fixer は loopNames に非該当かつ `currentStep`=reviewer は `loopFixerPairs` の key のため pipeline.ts:433/454 の両ブロックが no-op）。したがって transition 解決直後に読む `getFixerIter(nextStep)` は既存 exhaustion 検査（pipeline.ts:497）が読む値と一致し、両者の枯渇判定は必ず一致する。

- Rationale: 既存の clean approved 行を再利用することで、下流 bookkeeping を一切追加せずに正しい遷移先を得る。畳み込みにより回帰面を最小化する。
- Alternatives considered:
  - fixer 突入前 exhaustion ブロック（pipeline.ts:493-499）内で分岐: 再 routing 先が同ブロック直前の loop 突入検査（pipeline.ts:482）を飛ばすため、順序依存の穴が残る。解決直後に置く方が安全。

### D3: 省略を history と event に明示する（step 名 + 省略件数）

再 routing 発火時、黙って進めず次を記録する:

- **history**: `appendHistoryEntry`（pipeline.ts:5 で import 済み）で `status: "warning"`、`step: currentStep`、対象 step 名・省略した fixable finding 件数・paired fixer 名・遷移先を含む message を追加する。これは branch-borne な state journal に載る恒久記録で、後から「なぜ適用されなかったか」を追える。
- **event**: 新規 DomainEvent `pipeline:fixer:budget-skipped` を emit する。payload に `step`（reviewer）/ `fixer` / `omittedFixableFindings`（件数）/ `maxIterations` を持つ。`PipelineLogger` が購読し verbose log（JSONL）に落とす。CLI progress への表示は任意（黙認回避の観点で望ましいが本 request の必須ではない）。

省略件数は reviewer の直近 findings から算出する。`reviewer-chain.ts` に純関数 `lastReviewerFixableCount(state, reviewer): number` を追加し（既存 private `lastFindingsOf` + 既存 import `collectFixableFindings` を再利用）、`runInternal` から呼ぶ。

- Rationale: history は恒久 & テスト可能、event は run 中の可視化に有効。両方に残すことで要件3「history / event に明示」を確実に満たす。
- Alternatives considered: 黙って進める（architect 却下、暫定省略が追えない）。

### D4: `needs-fix` の停止挙動は不変・停止メッセージは verdict と整合する

再 routing は `outcome === "approved"` に限定する。verdict が `needs-fix` のまま fixer budget を使い切った場合は条件2以降に到達せず、従来どおり pipeline.ts:493-499 → `handleExhausted` で escalation し、`CODE_REVIEW_RETRIES_EXHAUSTED` / `code-review did not approve after N iterations` を出す。

要件5（メッセージが verdict と矛盾しない）は D2 の帰結として自動的に満たされる: approved では exhaustion escalation に到達しなくなるため、`did not approve` は verdict が approved でない場合にのみ出力される。`LOOP_ERROR_CODES`（types.ts:177-181）や hint 文言は**変更しない**。

- Rationale: blocking な指摘を予算切れで素通しさせない（exhaustion 全体を緩める案は architect 却下）。要件5 を追加コードなしで満たす。

## Risks / Trade-offs

- [Risk] 再 routing 条件が広すぎて needs-fix / conformance からの fixer 突入まで抑止する
  → Mitigation: `outcome === "approved"` を必須にする。conformance→fixer は `needs-fix:*`、reviewer→fixer(needs-fix) は `needs-fix`。approved で fixer へ向かうのは findings-routing 行だけであり、この行のみを対象化する。
- [Risk] budget 判定が既存 exhaustion 検査とずれ、通常時の任意修正まで抑止する
  → Mitigation: D2 の通り approved→fixer 間に episode reset は挟まらず、`getFixerIter` は pipeline.ts:497 と同値。閾値計算も同一（`resolvePairedReviewForFixer` + `resolveMaxIterations`）。budget に余裕があれば条件3 が偽となり従来どおり fixer が走る。
- [Risk] parallel 経路（`buildParallelReviewerTransitions`）で clean 遷移先の取り違え
  → Mitigation: engine は table を読むだけで経路を区別しない。両経路とも clean approved 行は 1 本。T1（standard）と T2（parallel）を独立テストとして固定し、片方の green を他方の証拠にしない。
- [Risk] 新規 event 追加で型の網羅性が壊れる
  → Mitigation: `DomainEvent` union（kernel）と `EventPayloadMap`（core/event）の両方に追加する。`PipelineLogger` の購読は additive で既存挙動を変えない。

## Open Questions

- なし（設計判断は architect 評価済み。progress 表示への露出は任意実装として tasks で optional 扱い）。
