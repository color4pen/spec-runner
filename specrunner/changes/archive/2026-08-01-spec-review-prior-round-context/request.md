# spec-review の周回間 context 注入 — 解消済み指摘の stale 再指摘を情報構造から潰す

## Meta

- **type**: spec-change
- **slug**: spec-review-prior-round-context
- **base-branch**: main
- **adr**: true

## 背景

spec-review → spec-fixer → spec-review の反復ループで、reviewer が**前周の fixer が修正済みの内容を「未修正」として再指摘する** stale 誤検出が実運用で発生した（issue #936: T-07 は前周 spec-fixer が修正済みで実行時点の HEAD にも入っていたが、再指摘の escalation で operator 対応が必要になった）。

構造的原因: reviewer は毎 round フレッシュな agent session で起動し worktree（= HEAD）を読み直すため、**古い内容を読んでいるのではない**。問題は reviewer が「前周に何が指摘され、fixer が何を直したか」を知る経路を一切持たず、毎回ゼロから再導出することにある。判断が揺れれば同一箇所を再指摘し、それを検出・抑制する機構も無い（既存の finding-recency ＝ #925 は「後出し」検出の逆方向であり、かつ観測専用）。

修正方針は **iteration ≥ 2 の reviewer message への前周 context 注入**: 前周 findings（state 由来の構造化データ）と前周 fixer の変更 file 集合（commit から機械導出）を注入し、再指摘プロトコル（再指摘するなら現在の内容を確認した上で「なぜ修正が不十分か」を rationale に明示する）を課す。stale 再指摘の機械 auto-reject は採らない — 「fixer がファイルを触ったが修正は不十分」という**正当な再指摘**を機械では区別できず、殺してしまうため。

## 現状コードの前提

- `src/core/step/spec-review.ts:82-90` — `reads()` は request.md / spec.md / design.md / tasks.md の 4 ファイルのみ。前周の spec-review-result-NNN.md は含まれない
- `src/core/step/spec-review.ts:102-114` + `src/prompts/spec-review-system.ts:174-196` — `buildSpecReviewInitialMessage` が埋め込むのは slug / requestType / requestContent / branch / iteration / findingsPath / mode のみ。**前周 findings は一切渡らない**
- `src/core/step/step-context-builder.ts:96-98` — session 継続は `FIXER_STEP_NAMES`（spec-fixer / build-fixer / code-fixer）のみ。spec-review は毎 round フレッシュ session
- `src/core/step/spec-fixer.ts:150` — fixer 側は `getLatestJudgeFindings(state, SPEC_REVIEW)` で最新 findings を受け取る既存 seam がある（reviewer 側には無い）
- `src/core/port/runtime-strategy.ts:651,810` — `listCommitChangedFiles(oid, cwd)` が commit 単位の変更 file 集合を返す既存 seam。前周 fixer の commit OID は state の stepRuns 記録から取れる（`src/core/step/commit-orchestrator.ts:277-278` が同じ方法で priorOid を解決する前例）
- `src/core/step/finding-recency.ts` + `src/core/step/commit-orchestrator.ts:271-299` — #925 の finding-recency（後出し検出）は spec-review の iteration ≥ 2 でのみ発火する観測専用機構。方向が逆（本 request の対象外）で、`specrunner/adr/2026-07-24-spec-review-full-enumeration.md` D2 が gate 化を将来送りにしている
- `src/core/pipeline/types.ts:235-246` — spec-review ⇄ spec-fixer のループ遷移。maxIterations 既定 2

## 要件

1. **前周 context の機械導出と注入**。spec-review の iteration ≥ 2 のとき、reviewer の initial message に以下を注入する: (a) 前周 spec-review の findings（state 由来の構造化データ。severity / resolution / file / title）、(b) 前周 spec-fixer が変更した file 集合（fixer の commit OID から `listCommitChangedFiles` で機械導出）。iteration 1 では注入しない。導出できない場合（OID 欠落・diff unavailable）は注入を省略し、黙って壊れない
2. **再指摘プロトコルの明示**。注入ブロックに指示を添える: 「前周指摘と同一対象を再指摘する場合、現在のファイル内容を読み直した上で、修正がなぜ不十分かを rationale に明示すること。現在の内容で解消を確認できた指摘は再指摘しないこと」。**全量列挙規律（ADR 2026-07-24）は弱めない** — 「前回 approve 済みの観点は省略してよい」という免除は与えない
3. **自己申告を真実源にしない**。注入する fixer 変更 file 集合は commit diff 由来の機械導出のみとし、fixer agent の報告文を真実源にしない
4. **寿命は one-shot**。注入はその round の message にのみ載せる（state への永続追加・後続 step への伝播はしない）

## スコープ外

- stale 再指摘の機械 auto-reject / verdict 上書き — 「fixer が触ったが修正不十分」の正当な再指摘を機械では区別できないため採らない
- finding-recency（後出し検出）の gate 化（ADR 2026-07-24 D2 の将来送りを維持）
- code-review / conformance 等、spec-review 以外の review ループへの同機構の展開（効果確認後の将来 request）
- reviewer の session 継続化（フレッシュ session 前提は維持）

## 受け入れ基準

- [ ] iteration ≥ 2 の spec-review message に前周 findings と fixer 変更 file 集合が含まれることをテストで固定する（fixer 変更 file は `listCommitChangedFiles` の mock 経由で機械導出であることを検証）
- [ ] iteration 1 では注入されないことをテストで固定する
- [ ] 前周 fixer の commit OID が解決できない・diff unavailable の場合、注入が省略され step が正常続行することをテストで固定する
- [ ] 再指摘プロトコル文言（読み直し・不十分理由の明示・全量列挙維持）が注入ブロックに含まれることをテストで固定する
- [ ] 既存テスト（spec-review prompt / routing / finding-recency 系）は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 情報ギャップの解消（reviewer に前周 findings + fixer 変更 file を機械導出で渡す）。stale 誤検出の根は「reviewer が解消を知る経路が無い」ことであり、そこを直接埋める
- **採用**: one-shot 注入（resume-context 注入と同じ寿命規律）。state を汚さない
- **却下**: stale 再指摘の機械 auto-reject — fixer がファイルを触ったことと修正が十分なことは機械で等値にできず、正当な「修正不十分」再指摘を殺す fail-open（検査空洞化）になる
- **却下**: reviewer session の継続化で文脈を保たせる — フレッシュ session は「毎回 HEAD を読み直す」保証の裏面であり、継続 session は逆に古い読みの持ち越し（本 issue の別の顔）を招く
- **却下**: 前周 result ファイル（spec-review-result-NNN.md）を reads に足すだけ — 構造化 findings でなく自由文の再解釈になり、fixer 変更 file 集合も欠く。state 由来の構造化注入が正確
