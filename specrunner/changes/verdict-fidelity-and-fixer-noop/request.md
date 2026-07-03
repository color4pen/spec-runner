# パイプラインの verdict 忠実性を直す（表示/導出と記録の食い違い・code-fixer の no-op 空振り）

## Meta

- **type**: bug-fix
- **slug**: verdict-fidelity-and-fixer-noop
- **base-branch**: main
- **adr**: false

## 背景

aozu リポジトリでのパイプライン実運用（2026-07-03、job 70a24f62 = prompt-session / job d7d3793e = ci-and-publish）で、step の verdict について「コンソール表示・機械導出・結果ファイルの記録」が食い違う症状を 2 系統、および code-fixer が残 findings を放置したまま approved を返して halt に至る症状を 1 系統、実地で確認した。いずれも利用者が halt の原因を結果ファイルまで遡らないと判断できない状態を生む。

## 症状（実地の証跡つき）

証跡はすべて aozu リポジトリ（github.com/color4pen/aozu）のコミット済みアーティファクト。

- **症状 1 — gate 表示が記録と逆**: regression-gate の全 4 iteration で結果ファイル（`specrunner/changes/archive/2026-07-03-prompt-session/regression-gate-result-001..004.md`）の verdict 行は `needs-fix` なのに、コンソールは毎回 `[regression-gate] verdict: approved` と表示した。最終的に「Pipeline halted at step 'code-fixer': regression-gate did not approve after 3 iterations」で halt し、表示と halt 理由が矛盾した。また iteration 表示が `[iter 3/2]` `[iter 4/2]` と上限を超えて進んだ
- **症状 2 — request-review の導出が記録と逆**: request-review の結果ファイル（同リポジトリ `specrunner/changes/canceled/ci-and-publish-d7d3793e/request-review-result-001.md`）は verdict 行 `approve`、findings は MEDIUM 1 + LOW 2（HIGH なし・decision-needed なし）。結果ファイル冒頭に埋め込まれた導出規則（`decision-needed ≥ 1 → escalation` / `high ≥ 1 → needs-fix` / それ以外 → approved）に照らせば approved になるはずが、コンソールは `verdict: needs-discussion` を表示しパイプラインは escalation で halt した
- **症状 3 — code-fixer の no-op 空振り**: regression-gate が「fixable」と明示した残 findings（F2/F3/F6/F7）がある状態で、code-fixer が iteration 3・4 において**ソースを 1 行も変更せず**（変更は events.jsonl / state.json / usage.json のみ。regression-gate-result-004.md の Verification Summary が commit 単位で記録）verdict `approved` を返し、リトライを消費して halt に至った。実行時間も 11〜58 秒と極端に短い
- **症状 4（低優先・ノイズ）**: `job archive` が worktree に `specrunner/drafts/` が無い場合に毎回 `Warning: git add specrunner/drafts/ failed: fatal: pathspec ...` を出す

## 現状コードの前提

- 本 request は症状駆動であり、RCA（表示経路・導出経路・code-fixer の verdict 判定のどこで食い違うか）は修正作業の一部とする
- 結果ファイルの導出規則コメントは「markdown の verdict 行と報告された findings が矛盾した場合、findings 由来の導出が優先される。verdict 行は人間向けの要約であり、機械ルーティングには使用されない」と明記している（symptom 2 の結果ファイル冒頭に現物）。この仕様自体は妥当で、問題は導出結果・表示・halt 理由の三者が一致しないこと

## 要件

1. **verdict の三点一致**: 各 step についてコンソール表示・機械ルーティングに使う導出結果・結果ファイルの記録が一致すること。導出規則（findings 由来優先）を適用する step では、導出結果を表示にも使う（記録の verdict 行と異なる場合はその旨を表示に含める）
2. **iteration 表示の整合**: iteration カウンタが宣言された上限を超える表示（`iter 4/2` 等）をしない。上限超過で escalation するならその状態遷移を表示に反映する
3. **code-fixer の no-op 検出**: 修正対象 findings が明示されている入力に対し、成果物ファイル（events/state/usage 等）以外に変更を生まなかった code-fixer 実行を `approved` として扱わない（fail-closed 側へ倒す — no-op を検出して needs-fix / escalation にする、または no-op 理由の明示を要求する）
4. （低優先）archive の drafts 不在 warning を出さない（存在確認してから add する）

## スコープ外

- verdict 導出規則（findings 由来優先）自体の変更
- regression-gate / request-review のレビュー内容・プロンプトの変更
- aozu リポジトリ側のアーティファクト修正

## 受け入れ基準

- [ ] 症状 1 の再現テスト: 結果ファイルが needs-fix の gate step で、コンソール表示が approved にならないことを固定する
- [ ] 症状 2 の再現テスト: findings が MEDIUM 以下のみの request-review 結果が escalation にルーティングされないこと（導出規則どおり approved になること）を固定する
- [ ] 症状 3 の再現テスト: ソース変更ゼロの code-fixer 実行（fixable findings あり）が approved 扱いにならないことを固定する
- [ ] iteration 表示が上限を超えないことをテストまたは表示ロジックで固定する
- [ ] 既存テスト無変更で green / `typecheck` green / `lint` green / `build` 成功
