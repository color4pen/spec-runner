# decision-needed に選択肢の提示を必須化し、人間の判断を構造化して記録・尊重する

## Meta

- **type**: spec-change
- **slug**: decision-options-ledger
- **base-branch**: main
- **adr**: true

## 要件の動機

escalation への人間判断が自由テキスト（/resume コメントの prose）で運ばれており、三重に脆い: ①文面の書き方で再レビューが通ったり通らなかったりする（2026-06-12 #662 で実証 — 「AC を追加せよ」と読める判断文は正しくブロックされ続けた）②再 resume のたびに別の reviewer instance が prose を再解釈する③判断済みの論点を構造的に「決定済み」として扱う機構がなく、同一指摘の蒸し返しを防げない。

また reviewer 側にも「fixable で済む指摘を decision-needed と申告する」過剰申告が観測されており（他プロジェクトの 0.3.0 運用 2 件）、「選択肢を書けないならそれは decision ではない」という定義の機械化が抑止になる。

## 現状コードの前提

- `src/kernel/report-result.ts` — Finding は severity / resolution / file / line? / title / rationale。選択肢を運ぶ構造はない
- `src/core/step/report-tool.ts` — judge 系 report tool の findingSchema（同上）
- `src/core/step/judge-verdict.ts:32-40` — verdict 導出。`:37` decision-needed ≥ 1 で severity 無視の escalation。「決定済み」の概念はない
- `src/core/notify/issue-notifier.ts:88` — escalation 通知（marker / step / reason / Diff URL / resume コマンド）。findings の内容は含まれない
- `src/core/inbox/planner.ts` — `parseResumePrompt` は /resume 後の全文を prose として渡すのみ
- `src/state/schema.ts` — 人間判断を記録するフィールドはない

## 要件

1. **schema**: decision-needed の finding に `options: [{ label, consequence }]`（2 件以上）を必須化する。options を構成できない指摘は定義上 fixable である、という規律を schema で強制する（prompt 規律の DECISION_NEEDED_DEFINITION と対で更新）
2. **通知**: escalation 通知コメントに decision-needed findings の選択肢を番号付きで描画し、「/resume <番号指定> で選択」の案内を含める
3. **入力**: /resume コメントで選択（例: `/resume 1=2 2=1` のような finding × option の指定。書式は design で決定）を受理し、prose は補足として従来通り resumePrompt に載る
4. **記録と尊重**: 選択結果を state に判断台帳（decisions）として記録し、**verdict 導出は決定済み finding を blocking として数えない**。reviewer が同一論点を再報告しても、決定済みに合致するものは escalation を再発させない（合致判定の方式は design で決定）
5. 旧形式（options なし decision-needed）の読み込みは後方互換とする（移行中の reviewer 出力を壊さない）

## スコープ外

- observations チャネル（#644 で導入済み）の変更
- resume の再開コンテキスト自動生成（別 request: resume-context-auto-injection）
- approve 後の再レビュー抑止全般（本 request は決定済み finding の蒸し返しのみを扱う）

## 受け入れ基準

- [ ] options なしの decision-needed が schema 検証で拒否される（または fixable に降格される — 方式は design）ことをテストで固定する
- [ ] escalation 通知に選択肢が描画されることをテストで固定する
- [ ] /resume の選択指定が解釈され state に記録されることをテストで固定する
- [ ] 決定済み finding と合致する再報告が verdict を escalation にしないことをテストで固定する
- [ ] 旧形式 toolResult の読み込みが後方互換であることをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実測: 2026-06-12 #662（prose 判断の 3 回書き直し）、他プロジェクト 0.3.0 運用での decision-needed 過剰申告 2 件
- #644 / #651（observations チャネル — 「対応不要」の置き場。本 request は「要対応・要判断」の構造化で対をなす）
- resume-context-auto-injection（決定台帳は将来そちらの注入対象に含まれる）
