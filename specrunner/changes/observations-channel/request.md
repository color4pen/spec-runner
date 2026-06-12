# judge report tool に observations チャネルを追加し、非アクション観察を verdict 駆動から分離する

## Meta

- **type**: spec-change
- **slug**: observations-channel
- **base-branch**: main
- **adr**: true

## 背景

test-placement-convention の run（job c1f9dd5d、2026-06-12）で、custom reviewer cross-boundary-invariants が prose では approved・findings 3 件すべて [INFO] 見出しで報告したにもかかわらず、うち 2 件の resolution が decision-needed だったため pipeline が escalation で停止した。2 件の内容は「現状問題なし・設計文書に記載済みの既知リスク」で、人間の判断は実質不要だった。

同じ run で、built-in code-review は FYI 級の指摘（union error message の文言重複、機能影響なし）を「迷ったら fixable」の規律に従って fixable/low で報告し、直すもののない code-fixer が 27 秒の no-op 起動をした。

つまり「**対応不要だが記録したい観察**」の置き場が schema に存在せず、丁寧な reviewer ほど FYI を decision-needed（→ 偽 halt）か fixable（→ fixer 空回り）のどちらかに詰めるしかない。prompt 規律による誘導はすでに実装済みで、reviewer はそれに文字通り従った上でこの結果なので、prompt 側の対処は上限に達している。

## 現状コードの前提

- `src/kernel/report-result.ts:15` — `FindingResolution = "fixable" | "decision-needed"` の二択。観察カテゴリなし
- `src/core/step/report-tool.ts:84` — tool schema も同じ union literal
- `src/core/step/judge-verdict.ts:37` — decision-needed が 1 件でもあれば severity 無視で escalation（request-review では needs-discussion）
- `src/prompts/judge-rules.ts` — DECISION_NEEDED_DEFINITION（「作成者でなければ決められない事項に限る」「迷ったら fixable」）が存在し、`code-review-system.ts:88` / `spec-review-system.ts:106` / `custom-reviewer-system.ts:99` に注入済み — 規律は届いた上で本事象が起きた
- `src/core/step/judge-verdict.ts:60-79` — blocking 判定と collectFixableFindings。approved + fixable → code-fixer の条件遷移が pipeline に存在
- `src/core/pipeline/findings-ledger.ts` / `src/core/step/regression-gate.ts` — 累積 findings を最終コードと再照合する（#631）。findings に観察が混ざると照合対象が汚染される
- events.jsonl は toolResult を丸ごと永続化するため、tool に新フィールドを足せば観察は追加実装なしで構造化記録に残る

## 要件

1. judge 系 report tool（judge / request-review）に optional な `observations: []` フィールドを追加する。要素は `{ severity, file, line?, title, rationale }`（resolution は持たない）
2. **findings の契約は不変**: verdict 導出・fixer への findings 注入・findings-ledger・regression-gate はいずれも observations を読まない。「findings = actionable、verdict を駆動する」を維持したまま観察を別チャネルに分離する
3. observations の severity は記録用であり routing に使われないことを型・テストで明示する
4. prompt 定義を対で更新: observation の定義（「対応不要だが記録すべき観察。**再現手順を構成できる問題を observation に入れることは禁止** — それは finding」）を judge-rules.ts に追加し、DECISION_NEEDED_DEFINITION を注入している全 prompt に同梱する
5. 旧形式 toolResult（observations フィールドなし）の読み込みは後方互換とする

## スコープ外

- resolution enum への第三値追加（findings を走査する全消費箇所に除外判断が散在し、1 箇所の漏れが silent 誤動作になるため不採用）
- verdict 導出規則の変更（low の decision-needed を escalate しない案は decision-needed の契約を骨抜きにするため不採用）
- regression-gate で observations を走査する拡張（将来検討）
- job show 等での observations の表示整形

## 受け入れ基準

- [ ] observations を含む report で verdict 導出が変化しない（findings が空なら approved のまま）ことをテストで固定する
- [ ] observations が code-fixer への findings block に含まれないことをテストで固定する
- [ ] observations が findings-ledger / regression-gate の照合対象に含まれないことをテストで固定する
- [ ] observations なしの旧形式 toolResult が従来通り読めることをテストで固定する
- [ ] judge-rules に observation 定義が追加され、DECISION_NEEDED_DEFINITION を注入する全 prompt に同梱されることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 別チャネル（observations フィールド）** — R7 契約（findings が verdict を駆動）を不変に保ち、既存の gate・fixer 経路・ledger・regression-gate への影響を構造的にゼロにする
- **却下: resolution 第三値** — 影響面が findings 全消費箇所に拡散する
- **却下: prompt 規律の強化のみ** — 本事象で上限を実証済み
- **却下: 導出規則の severity 緩和** — 人間ゲート契約の破壊

## 関連

- 発端: test-placement-convention run の escalation（job c1f9dd5d）
- #631（regression-gate、findings 照合の汚染回避が本件の要件 2/3 に直結）
- #561（conformance-fix-target、同一ファイル群の先行変更。本件は #561 の取り込み後に着手する）