# adr-gen が fixer 適用後の最終実装から ADR を導出する — pre-fix design 文脈による事実逆転を解消する

## Meta

- **type**: spec-change
- **slug**: adr-gen-postfix-context
- **base-branch**: main
- **adr**: false

## 背景

実運用で、code-fixer が code-review の指摘を受けて fail-closed guard を実装した後、adr-gen がその guard を Alternatives Considered で「却下した代替案」として記述する ADR を生成した。ship 済みの機構を「採らなかった」と断言する ADR は、後続の読者・レビュー・設計判断を実装と逆方向に誘導する。

原因は adr-gen の入力が design 確定時点の静的成果物に固定されていることにある。adr-gen は design.md を設計判断の主出典として読むが、review loop で fixer が適用した変更を知る経路が存在しないため、design.md と実装が乖離した run では pre-fix の設計叙述をそのまま ADR 化する。step の実行順序自体は正しい（adr-gen は review loop 収束後にのみ走り、以後 fixer は走らない）。問題は入力の鮮度である。

## 現状コードの前提

- adr-gen の判断材料は request.md / design.md / spec.md / review-feedback + agent 自身が実行する `git diff {base}..HEAD --stat` のみ（`src/core/step/adr-gen.ts:89-97`）。`buildMessage` は `dynamicContext` を参照しない（`src/core/step/adr-gen.ts:169-177`）
- system prompt は design.md を「設計判断の主出典。『なぜこの設計を選んだか』『何を選ばなかったか』を読む」と指定している（`src/prompts/adr-gen-system.ts:52`）
- `reads()` は review-feedback を最新 iteration のみ宣言している（`src/core/step/adr-gen.ts:144-147`）。一方 message 本文は `review-feedback-*.md (any numbered files)` を読めと指示しており不整合がある
- code-fixer は summary 成果物を生成しない（`resultFilePath` → null / `NULL_PARSE_RESULT`、`src/core/step/code-fixer.ts:303-310`）。また design.md は保護 canon path であり code-fixer は書けない（`src/core/step/write-scope.ts:64-74`）。よって fixer が実装を変えても design.md は pre-fix のまま残る
- `prepareRoundContext` hook は core が全 step で best-effort 呼び出す汎用機構（`src/core/step/step-context-builder.ts:152-160`）。実装例は spec-review の周回間 context（`src/core/step/prior-round-context.ts`）で、導出失敗の全経路が null 縮退し step を止めない
- adr-gen から fixer への戻り edge は存在しない（`src/core/pipeline/types.ts:270,277-280`: conformance approved → adr-gen → pr-create）
- `listCommitChangedFiles(oid, cwd)` port が存在する（`src/core/port/runtime-strategy.ts:651`）。prior-round-context が同 port で fixer commit の changed files を機械導出している

## 要件

1. **post-fix context の機械導出と注入**: adr-gen の message に「design 確定後に適用された修正」の context block を追加する。state 上の fixer 系 StepRun（code-fixer を必須対象とし、他 fixer の含め方は設計判断）の `commitOid` 全件から `listCommitChangedFiles` で changed files を機械導出する。全 round 分を含める（最新 round のみではない）
2. **finding との対応付け**: block には fixer round ごとに、対応する review-feedback の指摘要約と changed files を併記する。agent の自己申告ではなく、state（findings）と git（commit）の機械事実のみから構成する
3. **縮退規律**: prior-round-context と同じ規律に従う。導出のどの失敗（port 不在・commitOid 欠落・git 失敗）でも block なしに縮退し、step 実行を止めない・throw しない
4. **prompt の優先順位規律**: system prompt の Contract に追加する — post-fix block が存在する場合、最終実装が正であり、fixer が実装した機構を Alternatives Considered（却下した代替案）として記述してはならない。ship 済み機構は Decision / Consequences 側に記述する。design.md と最終実装が乖離している箇所は block 側を正とする
5. **fixer なし run の無変更**: fixer が一度も走っていない run では block を注入せず、従来の message を維持する

## スコープ外

- code-fixer に summary 成果物（実施内容の自己申告ファイル）を持たせること
- design.md を fixer が追随更新する機構
- adr-gen の step 配置変更（順序は正しい）
- ADR 本文の機械 validator

## 受け入れ基準

- [ ] fixer StepRun（commitOid あり）が存在する state で、adr-gen の message に機械導出の post-fix block（round ごとの changed files + 指摘要約）が含まれることをテストで固定する。破壊確認込み
- [ ] fixer が走っていない run では block が注入されず従来 message のままであることをテストで固定する
- [ ] 導出失敗の各経路（`listCommitChangedFiles` 不在・commitOid 無し・port エラー）が null 縮退で step 実行を止めないことをテストで固定する
- [ ] system prompt の優先順位規律（post-fix block 存在時は最終実装が正、ship 済み機構を却下案として書かない）の存在をテストで固定する
- [ ] 既存テスト `TC-ADR-STEP-02` は本契約変更に伴う期待更新のみ許容。それ以外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: `prepareRoundContext` hook の再利用** — core が既に全 step で best-effort 呼び出しており、新規 port・新規 hook が不要。spec-review で確立済みのパターンと縮退規律をそのまま踏襲する
- **却下: adr-gen の step 再配置** — adr-gen は既に review loop 収束後にのみ走る。順序の問題ではなく入力の問題
- **却下: code-fixer に summary 成果物を持たせる** — fixer 契約の変更は影響が広く、agent 自己申告は信頼できない。commit という機械事実からの導出で十分かつ信頼できる
- **却下: design.md の fixer 追随更新** — design.md は spec phase の正典で write-scope 保護されている。impl phase の fixer に開けると正典汚染の経路になる
- **却下: agent への「git log を読め」指示のみ** — prompt 指示は agent の裁量で縮退し、注入の有無をテストで固定できない。機械注入が確実
