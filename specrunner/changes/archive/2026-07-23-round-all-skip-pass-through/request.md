# custom reviewer round の全員 skip をエラーでなく構造的 skip として通す

## Meta

- **type**: spec-change
- **slug**: round-all-skip-pass-through
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer の担当判定（activationPaths / requestTypes）は agent 起動前の決定的計算であり、担当外のレビュワーは agent session を生成せず skip する。しかし現状は「全 member が skip した round」を ROUND_ALL_MEMBERS_SKIPPED というエラーとして記録し、pipeline 終端で job を awaiting-resume に停止させる。

この結果、担当領域外の変更（例: 全レビュワーの paths に含まれないディレクトリのみを触る request）は、実装・PR 作成まで完走した後に必ず operator 介入を要求する。担当判定は設定（宣言的 glob）が正であり、「全員担当外」は設定どおりの正当な帰結である。runtime がこれをエラー扱いして停止するのは、設定の敷き漏れ検査（別レイヤの責務）を運転時の halt で代行する層違いであり、自律収束を壊す。

全員 skip の round は「構造的に発生しなかった round」として green で通し、代わりに誰がなぜ skip したかの証跡を journal に残して第三者検証可能にする。

## 現状コードの前提

- src/core/step/executor.ts:270-294 — 活性化ゲート。step.activation の glob 照合で不一致なら agent 生成前に `{kind: "skipped"}` を返す。diff が導出不能な場合は skip でなく活性化に倒す（fail-closed、:262-268 に明記）
- src/core/pipeline/parallel-review-round.ts:353-354 — `allMembersSkipped` の判定（全 member verdict が "skipped"）
- src/core/pipeline/parallel-review-round.ts:468-478 — allMembersSkipped のとき member statuses を適用せず（pending 維持）、roundError に ROUND_ALL_MEMBERS_SKIPPED を設定する
- src/core/pipeline/pipeline.ts:395-413 — 終端 seam で state.error.code === ROUND_ALL_MEMBERS_SKIPPED を検出し awaiting-resume に落とす（PR 作成後に停止）
- src/core/pipeline/reviewer-chain.ts:446-464 — all-members-skipped escalation を検出して coordinator escalation を後続 step に routing する遷移がある
- member session の error は produceResult で halt に正規化され、skip とは別 verdict である
- 全員 skip で停止した job の resume は round を再 fan-out し、同一条件では再び全員 skip → 同一エラーで再停止する（回復経路が存在しない — issue #911 の実測）

## 要件

1. 全 member が活性化条件不一致で skip した round は、エラーでなく**構造的 skip** として成立させる: roundError を設定せず、round verdict は gate を塞がない値（approved 相当）とし、pipeline は停止せず後続 step へ進む。終端 seam の ROUND_ALL_MEMBERS_SKIPPED → awaiting-resume 分岐は発火しない
2. skip の証跡を journal に残す: coordinator は per-member の skip 事実と理由（どの活性化条件が当該 diff に不一致だったか）を journal event として記録し、run 後に「どのレビュワーがなぜ走らなかったか」を第三者が機械的に確認できる
3. **error と skip の区別を維持する**: member session の error / halt は従来どおり非 green（skip 扱いにしない）。skip と error が混在する round は従来どおり停止する
4. **diff 導出不能時の fail-closed を維持する**: 変更ファイルが導出できない場合に paths 条件付きレビュワーを活性化に倒す既存挙動（executor の活性化ゲート）は変更しない
5. member statuses の扱いは「skip が恒久 free-pass にならない」ことを保証する: 後続の再 round（fixer 適用後など）では活性化条件が新しい diff に対して再評価される
6. ROUND_ALL_MEMBERS_SKIPPED エラーで awaiting-resume に停止している**既存 job の resume は、新仕様で round を再評価して停止せず完走する**（後方回復経路）

## スコープ外

- 担当敷き漏れの静的検査（coverage floor: 「src/core/** は最低 1 レビュワーが担当」等の起動時検証）— 別 request で扱う
- resume が reviewer 定義 / snapshot を再読込する機構（issue #911）
- activationPaths の設定値の変更・拡張
- 活性化ゲート自体（executor.ts）の判定ロジック変更

## 受け入れ基準

- [ ] 全 member が担当外 skip の round で、job が停止せず後続 step を経て awaiting-archive まで到達することをテストで固定する
- [ ] per-member の skip 理由が journal event として記録されることをテストで固定する
- [ ] skip と error が混在する round（例: 1 member skip + 1 member error）は従来どおり非 green で停止することをテストで固定する
- [ ] diff 導出不能時に paths 条件付きレビュワーが活性化する既存テストが無変更で green
- [ ] state.error.code === ROUND_ALL_MEMBERS_SKIPPED を持つ awaiting-resume 状態からの resume が、新仕様で awaiting-archive に到達することをテストで固定する（後方回復経路）
- [ ] `typecheck && test` が green（ROUND_ALL_MEMBERS_SKIPPED の停止を期待していた既存テストは新仕様の期待に更新し、更新対象を implementation-notes に列挙する）

## architect 評価済みの設計判断

- **採用**: 全員 skip = 設定どおりの正当な帰結として green で通し、証跡（per-member skip 理由の journal event）で検証可能性を担保する。「止めて人に聞く」から「通して記録する」への変更
- **却下**: 現状維持（全員 skip をエラーとして停止）— 担当判定は宣言的設定が正であり、敷き漏れの検知は設定層（coverage floor）の責務。runtime の停止で代行すると担当外の正当な変更が毎回 operator を要求し、自律収束を壊す
- **却下**: 全員 skip のとき round 自体を pipeline から除去（遷移をバイパス）— round の実行痕跡（誰が skip 判定されたか）が journal から消え、第三者検証ができなくなる。round は実行し、構造的 skip として記録する
- **却下**: skip を approved と同値に統合 — error / skip / approved の区別が失われ、mechanism 故障（session error）が skip に紛れる fail-open を作る。verdict 語彙は維持し集約だけを変える
