# judge 完了契約に evidence counts を追加し、確認ゼロ・全 skip を非 green にする

## Meta

- **type**: spec-change
- **slug**: typed-evidence-gate
- **base-branch**: main
- **adr**: true

## 要件出典

- **正典**: この request.md（発火 issue なし）

## 背景

judge 系 step の verdict は typed findings から CLI が決定的に導出するが、現行の導出は「blocking findings が無ければ approved」である。このため **findings: [] は「検証して問題なし」と「何も検証していない」を区別できない**。空集合・全 skip の検査が green として素通りする経路が機械的に開いている。

prompt 側には既に evidence 規律（「空集合・全 skip は判定不能として報告する」）が導入済みだが、これは agent への指示であって機械の強制ではない。agent が規律を無視して findings: [] を返せば approved になる。

本変更は judge 系の typed 完了契約に evidence counts を追加し、確認ゼロの approved を機械的に不成立にする。

## 現状コードの前提

- `src/core/step/judge-verdict.ts` — deriveJudgeVerdict 系は findings の severity / resolution のみから verdict を導出する（decision-needed ≥ 1 → escalation、critical|high ≥ 1 → needs-fix、それ以外 → approved）。検証量の概念は存在しない
- `src/state/helpers.ts:71` — toolResult の型は `BaseReportResult & { findings?: Finding[]; observations?: Observation[] }`
- judge 系 step の完了は report_result 相当の typed toolResult で受理される（プロンプトは findings 配列の報告を要求する）
- `src/prompts/fragments.ts` — EVIDENCE_DISCIPLINE fragment（「空集合は判定不能」）が全 agent step の system prompt に注入済み（prompt 規律としてのみ存在）
- 判定チャネルは typed findings に一本化済みで、result md は evidence report（機械 parse されない）

## 要件

1. **evidence counts の追加**: judge 系 step の typed 完了契約に `evidence: { checked: number; skipped: number; unverified: number }` を追加する。checked = 実際に検証した項目数、skipped = 対象だが検証しなかった項目数、unverified = 検証できず未確認と申告する項目数。
2. **必須化**: 新規の judge 完了報告で evidence フィールドを必須とする（tool schema で強制し、欠落は完了として受理しない）。
3. **vacuous 判定**: verdict 導出を拡張し、`checked === 0` の場合は findings の内容に関わらず **approved にしない**（escalation として扱い、理由に「検証実績ゼロ」を明示する）。`checked > 0` の従来経路の導出は不変。
4. **プロンプト側の記入指示**: judge 系 prompt の Completion 節に evidence フィールドの記入指示を単一ソース fragment で追加する（EVIDENCE_DISCIPLINE と整合する文言）。
5. **後方互換**: 既存 state / events の過去 record（evidence フィールド無し）は再評価しない。resume 時に過去 record を読む経路では evidence 欠落を旧形式として許容する（新規報告のみ必須）。
6. **producer 系 step は対象外**: implementer / design 等の完了契約は変更しない（judge 系のみ）。

## スコープ外

- checked の**内容**の真正性検証（agent が数を偽る可能性への対処は anchor 照合として別 request）
- custom reviewer の skip 設定機構自体の変更（全 skip 時の合流判定が checked=0 として非 green になることのみ本変更の範囲）
- 承認の revision 束縛・reopen（後続 request）
- producer 系 completion の拡張

## 受け入れ基準

- [ ] `checked: 0` + `findings: []` の judge 完了が approved にならない（escalation になる）ことをテストで固定する
- [ ] `checked > 0` + `findings: []` は従来どおり approved であることをテストで固定する
- [ ] `checked > 0` + blocking findings の導出（needs-fix / escalation）が不変であることを既存テストで確認する（deriveJudgeVerdict の既存テストのうち、evidence 概念の追加により入力形が変わるものは追随修正し、判定規則そのものの期待は変えない）
- [ ] evidence フィールド欠落の新規報告が完了として受理されないことをテストで固定する
- [ ] 旧形式 record（evidence 無し）を含む state の読み取り・resume が正常動作することをテストで固定する
- [ ] judge 系 prompt の出力に evidence 記入指示が含まれることを drift-guard 系テストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: checked === 0 → escalation**。「新 verdict 値（indeterminate 等）の追加」より、既存 3 値の意味を保ったまま escalation ルート（人間判断）に載せる方が、routing・resume・表示の波及がない。
- **採用: judge 系のみ**。producer の完了は成果物の存在契約（output gate）が既に担っており、検証量の概念は judge に固有。
- **却下: evidence を optional にして warning 扱い** — 任意フィールドは書かれなくなる。#872 型の素通りを機械で塞ぐという目的に対し、必須化以外は目的を達成しない。
- **却下: counts でなく検証項目リスト（文字列配列）の必須化** — 内容の真正性は counts でもリストでも機械検証できない（それは anchor 照合の領分）。counts は vacuous 検出に十分で、schema が最小。
- **却下: 過去 record の遡及再評価** — 完走済み job の verdict を変えると archive 済み証跡と矛盾する。新規報告のみを対象とする。
