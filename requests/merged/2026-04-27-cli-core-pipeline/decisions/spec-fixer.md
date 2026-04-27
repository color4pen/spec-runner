# Spec Fixer Decisions — 2026-04-27-cli-core-pipeline

## HIGH-2: terminated enum の扱い

`job-state-store` の status enum から `"terminated"` を削除し、`session-completion-detection` の既存規定（terminated 観測時に `failed` + `SESSION_TERMINATED`）に一本化する :: 案(b) を選択。理由は、`session-completion-detection` の既存規定を変更せず最小変更で整合させられるため。`terminated` は Anthropic 側のセッション状態であり、CLI 側の job status としては `failed` で十分に意味が伝わる。

## HIGH-1: change folder 存在確認の追加

`propose-pipeline/spec.md` に `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` による change folder 存在確認の Requirement と Scenario を追加する :: request.md の受け入れ基準「ブランチ上に change folder の存在が確認できる」を spec に反映するため。change folder 不在は fail（`BRANCH_NOT_REGISTERED` ではなく `CHANGE_FOLDER_NOT_FOUND`）とし、warning では不十分（受け入れ基準に「確認できる」と明記されているため）。

## MEDIUM-3: ps 経路での permission 非修正の明示

`cli-config-store/spec.md` の既存 Scenario に Notes を追加し、`specrunner ps` は read-only のため permission の自動修正を行わないことを意図的であると明示する :: ps 経路で chmod を行うと read-only の意味論が崩れ、将来の「書き込みしない経路の分離」設計に悪影響を与えるため。

## MEDIUM-4: fail-fast バリデーション順序の明示

`cli-commands/spec.md` に fail-fast バリデーション順序の Requirement を追加する :: design.md D8 の 5 段階順序を spec に格上げすることで、実装での順序ばらつきを防ぐため。

## MEDIUM-5: ps 出力フォーマットの追加明示

`cli-commands/spec.md` の ps Requirement に出力仕様を追加する :: ソート順・BRANCH truncate・非 TTY 時挙動を spec で固定し、実装者の判断ばらつきを防ぐため。

## MEDIUM-6: SSE break 伝播の明示

`session-completion-detection/spec.md` の既存 Requirement に Scenario を追加し、ポーリングで先に idle+end_turn を観測した場合の SSE 中断を AbortSignal で明示する :: design.md D1 の break-after-completion ガードを spec に反映するため。

## MEDIUM-7: 状態マシン失敗遷移の追加

`propose-pipeline/spec.md` に失敗遷移セクションの Requirement を追加する :: 失敗経路の history entry 名と最終 status を固定することで、実装・テスト間の不整合を防ぐため。

## LOW-8: Scenario 名修正

`cli-config-store/spec.md` の「部分的な init 後に login」を「login 未実行の状態で run を実行する」に修正する :: Scenario 名と内容の不一致を解消するため。
