# Design: design は Layer-1（構造が決めない振る舞い）だけを spec に書く

## Context

ADR `architecture/adr/2026-06-02-spec-model.md` の D2 で、振る舞いを Layer-0（構造が強制）と Layer-1（intent 由来の選択）に分け、spec は Layer-1 のみを対象とすると定義した。

現状の design step（`src/prompts/design-system.ts` の `DESIGN_BASE`）は delta spec の **format** を規定するが、**content の選別基準**（何を書き、何を書かないか）を持たない。そのため design agent が Layer-0 の振る舞い（型・FSM・invariant が既に強制する根の振る舞い）を Requirement / Scenario として重複記述しうる。

本 change は design system prompt に litmus を追加し、delta spec に書く内容を Layer-1 に限定する。

## Goals / Non-Goals

**Goals**:

- design system prompt に Layer-0 / Layer-1 の litmus を組み込み、delta spec の content を Layer-1 に絞る
- `architecture/` の構造（歯・型・FSM）を参照して litmus を適用する guidance を与える

**Non-Goals**:

- Layer-0 混入の機械検出（validator / rule）— 別 request
- Layer-0 を増やす構造投資（型 / FSM への振る舞い押し込み）— 別 request
- spec-merge 廃止 / baseline 撤廃 — 別 request
- design 以外の step（spec-fixer 等）への litmus 適用 — 本 change は design に限定

## Decisions

### D1: litmus を「Delta Spec Content Guidance」セクションとして DESIGN_BASE に追加

`DESIGN_BASE` 内の「Artifact 生成ガイドライン > delta spec」サブセクションの直後、「Delta Spec Format Rules」セクションの直前に、新セクション「Delta Spec Content Guidance (Layer-1 litmus)」を追加する。

format rules（構造・記法）と content guidance（何を書くか）を分離し、既存の format rules に干渉しない。

**Rationale**: delta spec の format（既存）と content（新規）は直交する関心事。format rules の中に混ぜると format 検証の文脈が汚れる。独立セクションとして隣接配置する。

**Alternatives considered**:
- format rules 内に litmus を埋め込む — 却下。format と content の関心が混在する
- rules.md に litmus を書く — 却下。litmus は design step 固有の content guidance であり、全 step 共有の rules.md に置くと他 step に不要な文脈を渡す

### D2: litmus の表現

litmus を以下の判断フローで表現する:

> **「この振る舞いは構造（型 / 状態機械 / 不変条件）が強制するか？」**
> - YES → Layer-0。spec に書かない（歯が担う）
> - NO → Layer-1。spec に書く（intent 由来の選択）

具体例を 1〜2 個示し、agent が litmus を適用する手がかりとする。

### D3: architecture/ 参照の guidance

design agent が litmus を適用する際に `architecture/` 配下の構造定義（歯・型・FSM）を Read して参照してよいことを明記する。既存の「Baseline Spec 参照」セクション（path-fence の Read 許可）と同じパターン。

## Risks / Trade-offs

- [Risk] prompt の guidance だけでは agent が litmus を正しく適用しない場合がある → Mitigation: spec-review が delta spec の Layer-0 混入を review で検出する（受け入れ基準 2 番目）。機械検出は別 request で対応予定
- [Risk] litmus の具体例が少なすぎると agent の判断精度が低い → Mitigation: 例を 2 個程度含め、過不足を spec-review 結果で評価する

## Open Questions

なし
