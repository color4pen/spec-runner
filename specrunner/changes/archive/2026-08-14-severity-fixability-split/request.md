# severity と fixability の分離: LOW も fixable なら直す

## Meta

- **type**: spec-change
- **slug**: severity-fixability-split
- **base-branch**: main
- **adr**: true

## 背景

severity(pipeline を止める強さ)と resolution(修正対象かどうか)は別概念だが、現行は LOW severity の fixable finding を fixer の対象から一律に落としている。指摘として妥当で修正方法も明確な finding が、深刻度が低いという理由だけで放置され、regression-gate は「LOW は意図的に未修正」という ledger 除外で辻褄を合わせている。

この LOW 除外は、過去に存在した livelock(LOW 修正 → 再レビュー → 同じ LOW 再指摘 → 無限ループ)への対策として入った。しかし livelock の原因は「LOW を直すこと」ではなく「直した後に再レビューへ回すこと」にある。現行構造は既に「approved 経路の fixable は修正後に再レビューへ戻さない」(observation auto-fix、approve は stop gate)を実装しており、この経路に LOW を含めれば livelock は構造的に起きない。

整理後の対応表:

- CRITICAL / HIGH + fixable → 修正 + 再レビュー(現行どおり)
- MEDIUM / LOW + fixable → 修正 + 再レビューなし(observation auto-fix 経路。現行 MEDIUM のみ → LOW も含める)
- decision-needed → escalation(現行どおり)

## 現状コードの前提

- `src/core/step/judge-verdict.ts:199-202` — `selectFixerTargetFindings`: `fixable && severity !== "low"`。LOW 除外の唯一の正典(routing 層)。コメントに「code-fixer prompts must NOT re-filter by severity」
- `src/core/step/judge-verdict.ts:58` / `:106-112` — needs-fix(再レビュー要)の発火条件は critical|high のみ。low/medium fixable は approved 経路に落ち observation auto-fix で処理される(spec 系 `:69-82` に明文)
- `src/core/step/judge-verdict.ts` の `deriveRegressionGateVerdict` — 呼び出し側が `excludeKnownUnfixedRegressions`(fixer に回されなかった LOW の ledger 項目除外)を先に適用する前提。残った fixable は severity 不問で needs-fix
- `collectFixableFindings`(`:187-189`)— resolution === "fixable" の全件収集。severity フィルタなし

## 要件

1. **LOW 除外の削除** — `selectFixerTargetFindings` から `severity !== "low"` フィルタを外し、fixable 全 severity を fixer 対象とする。verdict 導出(needs-fix は critical|high のみ、low/medium は approved 経路)は変更しない — 再レビューの有無は現行の意味論のまま。
2. **regression-gate の未修正 LOW 前提の除去** — LOW も修正されるため「意図的に未修正の LOW」という概念が消える。`excludeKnownUnfixedRegressions` による ledger 除外を廃止し、regression-gate は ledger 全件を最終コードに対して再検証する。fixable 検出時 needs-fix の判定は不変。
3. **LOW を無視する特例の全除去** — routing 層のフィルタ以外にも LOW を落とす箇所が実在する。すべて更新対象として design で列挙し除去する:
   - code-fixer の step message の修正指示が「HIGH/CRITICAL 必須、MEDIUM 条件付き」で LOW に言及しない(`src/core/step/code-fixer.ts:149-150` / `:192-193` / `:218-219` / `:271` 等)。fixer 対象の finding は severity を問わず修正義務として指示する
   - fixer の no-op を正常完了として扱う特例。修正機会は一度きり・再レビューなしだが、それは「直さなくてよい」ではない。対象 finding への no-op を無条件に正常扱いする特例は LOW を含む形に温存しない
   - regression-gate の known-unfixed(意図的未修正 LOW)特例(要件 2)
4. **fixer prompt の規律維持** — code-fixer / spec-fixer prompt に severity による再フィルタを持ち込まない(routing 層が唯一の判定点、という現行規律の維持)。

## スコープ外

- verdict 種別・escalation 条件の変更
- 再レビュー要否の基準変更(critical|high = 再レビュー、の線は動かさない)
- conformance / custom reviewers の挙動変更
- fixer の write scope 変更

## 受け入れ基準

- [ ] LOW fixable finding が fixer 対象に含まれることをテストで固定する
- [ ] fixer の step message が対象 finding を severity 不問で修正義務として指示する(LOW の欠落がない)ことをテストで固定する
- [ ] critical|high fixable の needs-fix(修正 + 再レビュー)経路が不変であることをテストで固定する
- [ ] low/medium fixable が approved 経路(修正 + 再レビューなし)で処理され、修正後に再レビューが走らないことをテストで固定する
- [ ] regression-gate が ledger 全件(旧・既知未修正 LOW 相当を含む)を検証対象にすることをテストで固定する
- [ ] LOW 除外を pin していた既存テストの更新対象を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **livelock 対策は「直さない」から「再レビューしない」へ置換** — LOW 除外は livelock への対症で、原因(修正後の再レビュー再入)は既に observation auto-fix + approve stop gate が塞いでいる。除外を残す理由が消えている。LOW/MEDIUM に与えるのは「一度きりの修正機会 + 再レビューなし」であり、no-op の容認ではない。「LOW も直す」と宣言しながら直らなくても通す設計にはしない。
- **regression-gate の除外廃止は簡素化** — 「fixer に回されなかった LOW」という状態が消えるため、除外機構は保守対象としてだけ残る死んだ複雑さになる。ledger 全件検証に戻すのが一貫する。
