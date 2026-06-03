# ADR-20260603: conformance review を pipeline の最終 acceptance gate として追加する

## ステータス

accepted

## コンテキスト

pipeline には「実装が upstream artifact（request.md / design.md / spec.md / tasks.md）を達成したか」を判断する gate が存在しなかった。

- `verification`: 機械的ビルド検証（build / test / test-coverage）
- `code-review`: コード品質（可読性・設計整合・コーディング規約）
- `spec-review`: spec 自体の品質（Scenario の明確さ・網羅性）

上記はいずれも「upstream artifact に対する実装の達成・整合」を LLM 判断で確認するものではなく、tasks.md の完了確認は implementer の self-report に留まっていた。

また、code-review approved → adr-gen という直行辺が 2 本存在し、implementer が request を達成できていない場合でも adr-gen に到達できた。

## 決定

### D1: conformance step を AgentStep として実装する

`AgentStep` として実装し、verdict 報告には既存の `JUDGE_REPORT_TOOL`（`approved` boolean のみ）を使用する。spec-review と同型の judge step として位置づける。

**採用理由**: conformance には fix 分類がない（一律 implementer 戻し）ため、`fixableCount` を持つ `CODE_REVIEW_REPORT_TOOL` は schema 余剰になる。新 tool を作ることは判断場面を増やすだけで利益がない。

**却下案**:
- `CODE_REVIEW_REPORT_TOOL` を使う → `fixableCount` が不要で schema 余剰
- 専用 tool を新設する → 既存 judge primitive と機能が同一であり YAGNI

### D2: 遷移テーブルを変更し、adr-gen への唯一経路を conformance approved にする

以下の辺を変更する:

| 変更 | 辺 |
|---|---|
| 削除 | `code-review approved (no fixable) → adr-gen` |
| 削除 | `code-fixer approved (observation-fix 完了) → adr-gen` |
| 追加 | `code-review approved (no fixable) → conformance` |
| 追加 | `code-fixer approved (observation-fix 完了) → conformance` |
| 追加 | `conformance approved → adr-gen` |
| 追加 | `conformance needs-fix → implementer`（後方ジャンプ） |

`code-review approved + fixableCount > 0 → code-fixer` の辺は変更しない。

**採用理由**: 既存の `to:` 後方ジャンプ（`spec-fixer → spec-review` と同型）を再利用し、新規 loop 機構を追加しない。`conformance needs-fix → implementer` により実装再修正 → verification → code-review → conformance の再循環が自然に実現する。

**却下案**:
- conformance 専用の fixer step を作る → 違反レベル分類が必要になり複雑化。request の「一律 implementer 戻し」方針に反する

### D3: conformance を loop step として登録し、反復上限超過で escalate する

`STANDARD_LOOP_NAMES` に `conformance` を追加する。`LOOP_ERROR_CODES` に `CONFORMANCE_RETRIES_EXHAUSTED` を追加する。`STANDARD_LOOP_FIXER_PAIRS` への追加は不要（conformance の fixer は implementer であり、他ループの fixer でもあるため衝突するリスクがある）。

conformance の retry 経路（conformance needs-fix → implementer → verification → code-review → conformance）は `verification` を経由するため、共有 loop counter の競合が発生する。verification の `loopIters` が `maxIterations` に先に達し、`VERIFICATION_RETRIES_EXHAUSTED` が先行して発火してしまう問題が実装段階で判明した。

これを解消するため、paired fixer を持たない loop step（conformance）が non-positive verdict を返した時点で、次ステップへの遷移前に `loopIters[currentStep] >= maxIterations` を即時チェックする early-exit guard を `pipeline.ts` に追加した。このガードにより、verification カウンタが上限に達する前に conformance カウンタを評価でき、`CONFORMANCE_RETRIES_EXHAUSTED` が確実に到達可能になる。

**採用理由**: implementer で直らない（upstream の design / spec / request が誤り）ケースは loop exhaustion → human escalate で吸収する。conformance 側でエラー分類・routing しない（判断場面を増やさない）。

### D4: conformance の判断観点を 4 upstream artifact に限定する

system prompt で以下 4 項目を check させる:

1. `tasks.md` — 全タスクのチェックボックスが完了状態か
2. `design.md` — 設計決定が実装に反映されているか
3. `spec.md` — Requirements の SHALL/MUST が満たされているか
4. `request.md` — 受け入れ基準が達成されているか

4 項目全て合格 → `approved`、1 項目でも不合格 → `needs-fix`（具体的な不合格箇所を findings として記録）。結果ファイルは `conformance-result-NNN.md`（既存パターン踏襲）。

### D5: code-review-system.ts の stale `specs/` 参照を `spec.md` に修正する

`code-review-system.ts` の system prompt 内 `specs/` 参照を `spec.md` に修正する。`specs/` は旧 capability 分割 path であり現在は存在しない（`2026-06-03-self-contained-spec-model` ADR で廃止済み）。

## 検討した代替案

### A1: conformance を code-review の前に配置する

実装を upstream artifact に照らして先に確認し、問題があれば code-review に進まない案。

- **Pros**: code-review 実行コストを節約できる可能性がある
- **Cons**: code-review の指摘修正が反映されていない段階で conformance が判断する。修正前コードを「実装が design に沿っているか」で評価することになり、判断対象が不完全
- **Why not**: conformance は code-review 指摘が修正済みの最終コードを判断対象にする必要がある。code-review の後に置くことで最終状態のコードを評価できる

### A2: conformance needs-fix 時に違反レベルを分類して routing を分岐する

違反の重大度（実装 bug / design misalignment / spec 不満足）で routing を変える案。

- **Pros**: 重大度に応じた効率的な修正が可能
- **Cons**: conformance 側での判断場面が増える。routing 分岐が増えると pipeline の理解コストが上がる。「判断場面を増やさない」方針（`feedback_llm_uncertainty_principle`）に反する
- **Why not**: 違反は一律 implementer に戻し、既存 loop で再判断する。upstream が誤りのケースは loop exhaustion → escalate で吸収する

### A3: conformance の fixer pair に implementer を登録する

`STANDARD_LOOP_FIXER_PAIRS` に `conformance → implementer` を追加する案。

- **Pros**: fixer pair の構造が明示される
- **Cons**: implementer は verification loop の fixer でもあり、pair 衝突のリスクがある。bypass 制御（review→fixer 間の中間スキップ）の意味が conformance→implementer には当てはまらない
- **Why not**: fixer pair 登録は review→fixer 間の bypass 制御用であり、conformance→implementer は bypass 不要のため登録しない方が安全

### A4: loop counter 競合の解消方法（conformance needs-fix → implementer 経路の共有カウンタ問題）

conformance retry 経路が `verification` を経由することで、`CONFORMANCE_RETRIES_EXHAUSTED` が `VERIFICATION_RETRIES_EXHAUSTED` に先取りされる問題が実装段階で発覚した。解消方法として以下 3 案が検討された。

**案 A4-a: conformance needs-fix → code-review への短絡（implementer / verification をスキップ）**

- **Pros**: verification / code-review カウンタを経由しないため counter 競合が発生しない
- **Cons**: implementer で実装を修正せずに code-review → conformance を再実行する。修正なしの再レビューは無意味であり、実装不備が永続する
- **Why not**: conformance needs-fix の本質は「実装が不十分」であり、実装修正（implementer）を省略することはサイクルの目的を破壊する

**案 A4-b: conformance-triggered retry 時に verification / code-review カウンタをリセットする**

- **Pros**: 既存の loop guard 機構を変更せずに counter 競合を回避できる
- **Cons**: カウンタのリセットは「過去の iteration 実績を消す」操作であり、loop guard の exhaustion 設計（N 回で人間に上げる）と意味論が矛盾する。リセット条件の判断コードが pipeline に混入する
- **Why not**: loop guard の exhaustion 意味論を壊すリスクが大きく、リセット判断ロジックが pipeline の複雑度を上げる

**案 A4-c: paired fixer を持たない loop step が non-positive verdict を返した時点で即時カウンタチェック（採用）**

- **Pros**: 既存の loop guard 機構を拡張する最小変更。conformance 固有の処理でなく「paired fixer なし loop step」の汎化として実装でき、将来同型の step が増えても機能する
- **Cons**: pipeline.ts に early-exit guard 条件分岐が追加される
- **Why not（却下せず採用）**: counter 競合を pipeline の transition 処理の外でなく内部で確実に解消できる。他案のトレードオフより影響範囲が局所的

## 影響

### Positive

- upstream artifact への実装整合確認が pipeline 内で完結し、tasks 完了の self-report 依存が構造的に解消される
- adr-gen への唯一経路が `conformance approved` のみになり、未達実装が adr-gen に到達できなくなる
- implementer で直らない（upstream 設計の誤り）ケースが loop exhaustion → human escalate で可視化される
- 既存の `Transition` / loop guard 機構を再利用するため、新規 loop 機構の追加がない

### Negative

- pipeline に新ステージが追加されるため、全体の iteration 回数が増加する（最悪ケースで verification + code-review + conformance の 3 ループ）
- conformance needs-fix → implementer 戻しで前回と同じコードを出す無限ループが理論上発生する（loop guard の exhaustion で吸収）

### Known Debt

- conformance loop の反復上限は共有の `maxIterations` を使用。将来 phase ごとに独立した budget を持つ設計変更が必要な場合は別 request で扱う

## 参照

- Request: `specrunner/changes/conformance-review-step/request.md`
- Design: `specrunner/changes/conformance-review-step/design.md`
- Related: `specrunner/adr/2026-05-26-observation-auto-fix-pipeline.md`（code-review / code-fixer 遷移の先行変更）
- Related: `specrunner/adr/2026-04-29-spec-fixer-iteration-loop.md`（pipeline loop primitive の確立）
- Related: `specrunner/adr/2026-06-03-self-contained-spec-model.md`（`specs/` 廃止・`spec.md` への一本化）
