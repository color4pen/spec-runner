# code-fixer への approved 時 routing を fixableCount 申告ではなく findings から導出する

## Meta

- **type**: spec-change
- **slug**: fixable-routing-from-findings
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

judge-verdict-from-findings により judge 系 step の verdict は構造化 findings から CLI が導出する形になったが、「code-review approved + fixableCount > 0 → code-fixer」の typed routing（`src/core/pipeline/types.ts:151-160`）だけは agent 申告の `toolResult.fixableCount` を読んだまま残っている。このため findings と fixableCount が食い違うと、approved 時の observation-fix パス（低 severity の fixable findings を code-fixer で掃除してから conformance に進む経路）が、findings があるのに飛ばされる・findings がないのに余計に回る、というブレが起き得る。verdict と同じ原則 — agent の判断は finding 単位のラベル付けに限定し、集計は CLI が行う — をこの routing にも適用して、自己申告由来の判定を pipeline から完全に消す。

## 要件

1. `types.ts:151-160` の when 条件を、`toolResult.fixableCount` ではなく直前 code-review run の `toolResult.findings` から導出した値に置き換える: `resolution: "fixable"` の finding が 1 件以上あれば true（approved verdict 時点で critical/high は存在しないため、対象は実質 low/medium の fixable findings）
2. fixableCount の報告要求を撤去する: CODE_REVIEW_REPORT_TOOL の tool description と code-review system prompt から fixableCount への言及を外す。zod スキーマと parse（`parseCodeReviewReportInput`）は受け取っても無視する形で残し、旧 prompt キャッシュや再実行との互換を保つ
3. routing 導出に使う集計関数は `src/core/step/judge-verdict.ts` の純関数群と同じ場所・同じ規約（pure, no I/O）で実装する
4. approved + fixable findings ありで code-fixer に入った場合、code-fixer が受け取る prompt 埋め込み findings（`getLatestJudgeFindings`）に当該の low/medium findings が含まれることを確認する（既存実装で満たされている場合は変更不要、テストで固定する）

## スコープ外

- needs-fix / escalation 側の routing（judge-verdict-from-findings で導出済み）
- spec-review / request-review の routing（fixableCount 相当の分岐が存在しない）
- `CodeReviewReportResult.fixableCount` フィールドの型定義からの削除（互換のため残す）

## 受け入れ基準

- [ ] `src/` から fixableCount を読む routing / 判定ロジックが消えている（型定義と parse の受け口は残ってよい）
- [ ] code-review approved + fixable findings ≥ 1 → code-fixer、fixable findings = 0 → conformance の遷移がテストで検証されている
- [ ] fixableCount の申告値と findings が矛盾する入力（fixableCount=0 + fixable findings あり、逆も）で routing が findings 側に従うことがテストで示されている
- [ ] code-fixer の prompt 埋め込み findings に low/medium の fixable findings が含まれることがテストで固定されている
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 設計原則は judge-verdict-from-findings の ADR（agent 判断を finding 単位に限定し集計を CLI に移す）に既出であり、本変更は同原則の適用漏れ箇所の解消。新しい設計選択を含まないため adr: false とする
