# Design: conformance-review-step

## Context

Pipeline には実装が upstream artifact（request.md / design.md / spec.md / tasks.md）を達成したかを検証する gate が存在しない。verification は機械的ビルド検証、code-review はコード品質判断、spec-review は仕様品質判断であり、「実装と仕様の整合」を LLM 判断で確認するステップが欠落している。

現在の遷移:
- `code-review approved (no fixable)` → `adr-gen`
- `code-fixer approved (observation-fix 完了)` → `adr-gen`

これらを `conformance` 経由に付け替え、adr-gen への唯一の入口にする。

## Goals / Non-Goals

**Goals**:
- code-review 完了後に conformance step を実行し、upstream artifact への整合を LLM 判断する
- needs-fix 時は implementer に戻し既存 loop（verification → code-review）を再走させる
- loop step として反復上限を持ち、超過で human escalate する
- code-review-system.ts の stale `specs/` 参照を `spec.md` に修正する

**Non-Goals**:
- 違反レベル分類・ルーティング分岐（一律 implementer 戻し）
- spec→test 網羅 gate
- 新規 loop 機構の追加

## Decisions

### D1: conformance step の agent 設計

conformance は `AgentStep` として実装する。既存の judge step（spec-review）と同型で、`JUDGE_REPORT_TOOL` を使用し verdict を `approved` / `needs-fix` / `escalation` で報告する。

- **Rationale**: code-review は `CODE_REVIEW_REPORT_TOOL`（fixableCount 付き）を使うが、conformance には fix 分類がない（一律 implementer 戻し）。spec-review と同じ `JUDGE_REPORT_TOOL`（approved boolean のみ）が適合する。
- **Alternatives**: CODE_REVIEW_REPORT_TOOL を使う → fixableCount が不要で schema 余剰。新 tool を作る → 判断場面を増やすだけで利益なし。

### D2: 遷移テーブル変更

STANDARD_TRANSITIONS を以下のように変更する:

1. **削除**: `code-review approved → adr-gen`（直行辺）
2. **削除**: `code-fixer approved → adr-gen`（observation-fix 完了辺）
3. **追加**: `code-review approved (no fixable) → conformance`
4. **追加**: `code-fixer approved (observation-fix 完了) → conformance`
5. **追加**: `conformance approved → adr-gen`
6. **追加**: `conformance needs-fix → implementer`（後方ジャンプ）

`when` predicate の構造は既存パターンを踏襲。code-review approved + fixableCount > 0 → code-fixer の辺はそのまま残る。

- **Rationale**: 既存の `to:` 後方ジャンプ（spec-fixer → spec-review と同型）を再利用し、新規 loop 機構を追加しない。
- **Alternatives**: conformance 専用の fixer step を作る → 違反レベル分類が必要になり複雑化。request 本体が求める「一律 implementer 戻し」に反する。

### D3: loop step 登録

`STANDARD_LOOP_NAMES` に `conformance` を追加する。Pipeline の既存 loop guard 機構（`loopNames` + `loopIters` + exhaustion 検知）がそのまま適用され、反復上限を超えたら escalate する。

`LOOP_ERROR_CODES` に conformance 用エントリを追加する:
- code: `CONFORMANCE_RETRIES_EXHAUSTED`
- message: `conformance did not approve after N iterations`

conformance には paired fixer がない（implementer に戻すだけ）ので `STANDARD_LOOP_FIXER_PAIRS` への追加は不要。

- **Rationale**: loop guard は `loopNames` に名前を追加するだけで発動する。fixer pair 登録は review→fixer 間の bypass 制御用であり、conformance→implementer は bypass 不要。
- **Alternatives**: fixer pair に implementer を登録する → implementer は他ループ（verification）の fixer でもあり衝突。登録しない方が安全。

### D4: conformance の判断観点と prompt

system prompt で以下 4 項目を check させる:
1. `tasks.md` — 全タスクのチェックボックスが完了状態か
2. `design.md` — 設計決定（D1, D2, ...）が実装に反映されているか
3. `spec.md` — Requirements の SHALL/MUST が満たされているか
4. `request.md` — 受け入れ基準が達成されているか

verdict 判定:
- 4 項目全て合格 → `approved`
- 1 項目でも不合格 → `needs-fix`（具体的な不合格箇所を findings として記録）

結果ファイル: `conformance-result-NNN.md`（iteration ベース、既存パターン踏襲）

- **Rationale**: 既存の review step は全て iteration 付き result file を produce する。conformance も同じパターンで crash resilience を保つ。
- **Alternatives**: result file なしで verdict のみ → crash 時に判断根拠が失われる。

### D5: STEP_NAMES / AGENT_STEP_NAMES への追加

`src/kernel/step-names.ts` に以下を追加:
- `AGENT_STEP_NAMES` に `"conformance"` を追加
- `STEP_NAMES` に `CONFORMANCE: "conformance"` を追加

- **Rationale**: StepName 型は STEP_NAMES から派生するため、ここに追加するだけで型安全性が保たれる。
- **Alternatives**: なし（これが唯一の追加箇所）。

### D6: code-review-system.ts の spec 参照修正

system prompt 内の `specs/` 参照を `spec.md` に修正する。具体的には:
- L32: `(design.md, tasks.md, specs/)` → `(design.md, tasks.md, spec.md)`

- **Rationale**: `specs/` は旧 capability 分割 path であり現在は存在しない。`spec.md` が正しい参照先。
- **Alternatives**: なし（単純な文字列修正）。

## Risks / Trade-offs

[Risk] conformance loop が verification / code-review loop と重複し、全体の iteration 回数が掛け算になる可能性
→ Mitigation: conformance の反復上限は共有の `maxIterations`（config 由来）を使用。実質的に 2-3 回で escalate するため、最悪ケースでも MAX × 3 ループ（verification + code-review + conformance）。

[Risk] conformance needs-fix → implementer 戻しで、implementer が前回と同じコードを出す無限ループ
→ Mitigation: loop guard の exhaustion で human escalate される。また conformance result file に具体的な不合格箇所を記録するため、implementer が参照できる。

## Open Questions

なし（architect 評価済みの設計判断により解決済み）。
