# reviewer approve + observation を auto-fixer で消化する pipeline 拡張

## Meta

- **type**: spec-change
- **slug**: observation-auto-fix
- **base-branch**: main
- **adr**: true

## 背景

PR #402 / #403 の事後 audit で **二重 review 問題**を観察した:

```
現状 pipeline:
reviewer → needs-fix → fixer → reviewer → ... loop
reviewer → approved (+ observation 残置) → finish
                       ↑ 無視される、もしくは skill audit で後追い fix
```

reviewer が **approve verdict + observation/finding (= non-blocking 指摘)** を出すパターンが頻出 (= PR #402 で finding 3 件 / PR #403 で 4 件)。observation が残置のまま finish に流れ、skill `acceptance-and-issue-audit` で後追い fix する **二重作業**が発生している。

「approve + observation 残置」が semantically 曖昧 — approve = 完全終了 / needs-fix = 修正必要 の 2 値で表現できるはずなのに、中間状態が運用で発生している。

## 提案

reviewer approve + observation がある場合、**自動的に fixer step を発火** → observation を全消化 → finish へ進む:

```
提案 pipeline:
reviewer → needs-fix → fixer → reviewer → ... loop
reviewer → approved (only) → finish                       ← observation 無し: 既存挙動
reviewer → approved + observation あり → fixer → finish
                                          ↑ observation を消化、1 PR 完結
```

= 人間が reviewer の細かい finding を読まなくても、verdict (approve / needs-fix) だけで pipeline が回る。

## 要件

### 1. reviewer approve + observation 時に fixer を自動発火する pipeline 拡張

reviewer (= code-review step) が verdict `approved` を出したとき、出力に **fix 対象の finding (= `fix: true`) が含まれていれば** fixer step を発火する。

**統一原理**: fixer の処理自体は **needs-fix の場合と同じ単一処理** (= `fix: true` の finding を消化する)。違うのは **fixer 出口の遷移先**のみ:

```
fixer 出口で「直前 review の verdict」を state から参照:
  - verdict === "approved"  → next step (= delta-spec-validation 等、再 review に戻らない)
  - verdict === "needs-fix" → review (= 既存 loop、変更なし)
```

= 新規 `observation-fixer` step や fixer の `mode` flag は **不要**、transition table の追加 + reviewer 出力 format の対応で足りる。fixer の processing logic 自体は変更しない方向。

ケース整理:

| 直前 review verdict | fixer 結果 | 次のステップ |
|---|---|---|
| approved | success | next step (= delta-spec-validation) |
| approved | failed | escalation (= 既存と同じ) |
| needs-fix | success | code-review (= loop、既存) |
| needs-fix | failed | escalation (= 既存) |

具体的判定箇所 (= transition table での分岐 / state 参照の実装方法) は **design step で確定**する。

### 2. reviewer 出力の format 強制を緩和、machine-readable な finding list を必須化

reviewer の出力 `review-feedback-NNN.md` に **machine-readable な finding list** を必須要素として加える。各 finding entry は fixer が消化判定可能な field (= severity / fix 可否 / file 位置 / description 等) を含む。

table / score / AC 突合せ table / severity 別 heading 等の装飾要素は **agent が任意で含める自由を残す** (= 禁止せず、強制もせず、判定材料にも使わない)。

具体的な field 定義 / 必須・任意の line / parse 仕様は **design step で確定**する。

### 3. CLI 側の verdict 判定で score 計算を廃止

`src/core/step/code-review.ts` の `determineVerdict()` から **score table を parse して verdict を再計算する logic を廃止**し、**agent が出力した verdict をそのまま採用**する造りに簡素化する。

= 要件 2 で table を判定材料にしない方針と整合。reviewer LLM uncertainty (= score table 書き忘れ等) の主要源を構造的に消す。

## スコープ外

- **reviewer / fixer 以外の step の出力 schema 統一** — 本 request は code-review + fixer 系統のみ
- **skill `acceptance-and-issue-audit` の完全廃止** — 本 request で skill の主要責務は消えるが、別議論
- **過去 PR の遡及 audit** — 本 request は今後の pipeline 拡張

## 受け入れ基準

- [ ] reviewer approve + fix 対象の observation あり の場合、自動で fixer step が発火する
- [ ] fixer 適用後、reviewer 出力に含まれた `fix: true` の finding が実際に resolve されている (= 該当 file の修正が commit に含まれる、fixer 発火だけで観察を満たさない)
- [ ] reviewer 出力に machine-readable な finding list が必須要素として含まれる (= fixer が消化判定可能な field)
- [ ] reviewer 出力の table / score / 装飾要素は agent が任意で含めて良い (= 禁止せず、CLI 判定材料にしない)
- [ ] `code-review.ts` の `determineVerdict()` が agent verdict をそのまま採用する造りに簡素化されている (= CLI 側 score 計算廃止)
- [ ] 既存 pipeline (= reviewer needs-fix → fixer → reviewer の loop) は変更なしで動く (= regression なし)
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **table を廃止せず format 強制を緩和する方針**: agent が思考補助として table を描く自由を維持しつつ、CLI / fixer 側の機械的依存を切る。reviewer LLM uncertainty (= table format 強制違反) を構造的に消すが、agent の表現力は奪わない
- **agent verdict をそのまま採用 (= CLI 側 score 計算廃止)**: score table parse の前提が消える → CLI 側の判定 logic を simplify、agent 自身の判断を信頼する設計
- **fix 可否は agent (= reviewer) が判定して `fix: true/false` で出力**: agent の意図 (= 「pre-existing で別 issue」「設計判断による意図的選択」) を尊重する設計。CLI 自動判定 (severity rule) は agent の個別判断を消すので不採用
- **fixer の処理は単一、出口遷移のみ verdict ベースで分岐**: 「needs-fix mode」「observation mode」のような分岐を fixer 内部に持たない。fixer は単に `fix: true` の finding を消化、次のステップは transition table が「直前 review verdict」を参照して決める。**新規 step / mode flag / 入力 source 分岐は yagni** (= 構造上の変更なし)。
- **fixer prompt の更新 (= `fix: true` 優先ロジック) は design step の範囲**: 現状 fixer prompt は severity-based ルール (= HIGH 必須 / LOW 無視) で動作している。本 request の方向性 (= `fix: true` の全 finding 消化) を実現するため prompt の調整が要る可能性が高いが、具体的な変更範囲は design で確定する。本 request で「変更しない」と書いているのは **step 構造・mode flag・処理 logic の話**であって、prompt の文言までは含意しない
- **1 request で 3 軸 (= pipeline 拡張 + reviewer 出力 schema + CLI verdict 判定) をまとめる**: 互いに密接で別 request に切ると semantic conflict が出る (= PR #401 と同型の判断)
- **詳細な実装方針 (= transition の具体的配線、state 参照の実装方法、reviewer prompt の具体的更新文言、finding field の正確な定義) は design step で確定**: request body 段階で過剰に決め打ちしない
