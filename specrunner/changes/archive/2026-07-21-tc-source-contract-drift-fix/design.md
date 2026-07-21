# Design: TC Source Contract Drift Fix

## Context

TC Source フィールドは test-case-gen（producer）が書き、test-materialize / implementer（consumer）が「Scenario 由来 TC か否か」の判別に使う step 間契約文字列。

2026-06 初旬の spec ファイルパス一元化（`specs/<capability>/spec.md` → `specrunner/changes/<slug>/spec.md`）で、producer 側の Source 形式は `spec.md > Requirement: <name> > Scenario: <name>` に更新された。しかし consumer 2 prompt は旧形式 `specs/<capability>/spec.md > ...` を判別条件として使い続けている。

同じ契約文字列が 3 prompt に独立複製されていることが drift の根本原因であり、文字列を手で揃え直すだけでは次の形式変更で再発する。

**変更対象ファイル（コード）:**
- `src/prompts/test-case-gen-system.ts:55` — Source 形式の hardcoded 記述（producer、現行正準形式）
- `src/prompts/test-materialize-system.ts:84-86` — Scenario 由来 TC 判別条件（consumer、旧形式）
- `src/prompts/implementer-system.ts:48-49` — Scenario 由来 TC 判別条件（consumer、旧形式）
- `src/prompts/judge-rules.ts` — leaf module パターンの参照例

## Goals / Non-Goals

**Goals**:
- TC Source 正準形式を単一定数（shared constant）に集約し、3 prompt が同一ソースから参照する
- consumer 2 prompt の Scenario 判別条件を現行形式に修正する（旧形式を排除）
- 回帰テストで contract を機械的に固定し、独立複製による drift 再発を防ぐ

**Non-Goals**:
- step prompt 全体の骨格再設計（別 request で実施予定）
- TC Source 契約以外の prompt fragment 統合・整理
- Source フィールドを機械 parse する機能の追加（判別は引き続き agent が行う）
- test-cases.md の過去 archive の修正

## Decisions

### D1: 共有定数を `src/prompts/tc-source-contract.ts`（leaf module）に定義する

`judge-rules.ts` が確立済みの同型パターン（project-internal import なしの leaf constants）であり、依存方向の新設は発生しない。3 prompt がこの定数を import することで、形式変更が 1 ファイルへの変更で伝播する。

**Rationale**: 独立複製が今回 drift の根本原因そのもの。定数化により次の形式変更でも 3 prompt が自動追従する。

**Alternatives considered**:
- *3 prompt の文字列を手で揃えるだけ* — 独立複製が残るため次の形式変更で同じ drift が再発する。却下。
- *rules.md（知識注入）で形式を伝える* — TC Source 形式は製品自身の step 間契約であり、プロジェクト固有知識ではない。CLI 組み込みの prompt モジュールが持つべき定義。却下。

### D2: エクスポートする定数は `TC_SOURCE_SCENARIO_FORMAT` 1 つとする

正準形式文字列 `"spec.md > Requirement: <name> > Scenario: <name>"` のみを定数化する。consumer 側の「Source が指すパスをどう Read するか」の文言（change folder の `spec.md` を Read する手順）は各 prompt が独自に記述する。変更頻度と変更理由が Format 定義と独立しているため、不必要な結合を避ける。

### D3: 回帰テストを新規ファイル `src/prompts/__tests__/tc-source-contract.test.ts` に追加する

既存 `fragment-coverage.test.ts` を改変しないことで「既存テストは無改変で通る」受け入れ基準を機械的に検証しやすくする。

## Risks / Trade-offs

[Risk] `test-materialize-system.ts` / `implementer-system.ts` への import 追加が循環依存を起こす
Mitigation: `tc-source-contract.ts` は project-internal import なし（leaf）のため依存サイクルは発生しない。`judge-rules.ts` が同じ構成で問題なく運用されている実績がある。

[Risk] consumer prompt 文言の修正が Scenario 由来 TC の agent 挙動に影響する
Mitigation: 変更内容は「判別に使う形式文字列の更新」のみ。現行形式の TC は既存 run で既に出力されており、修正後の判別条件は現実の TC と一致する。GWT 取得手順（Source が指す spec.md を Read する）は維持される。

## Open Questions

なし（architect 評価済み設計判断を採用）
