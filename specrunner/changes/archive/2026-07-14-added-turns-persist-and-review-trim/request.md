# added-turn 削減の仕上げ — 追加ターン metrics の journal 永続化と code-review post-work turn の除去

## Meta

- **type**: spec-change
- **slug**: added-turns-persist-and-review-trim
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存の journal record と既存 content-format seam を拡張する範囲であり、新しい port/pattern の導入ではないため false。設計判断は design.md に記す。 -->

## 背景

追加 AI ターン削減施策に、観測性と残ターンの 2 つの積み残しがある。

1. `addedTurns` metrics（`{ reportRetry, postWork, outputRepair }`）は in-memory で算出され `StepRun.outcome` に載るが、journal record schema がこれを落とすため、journal round-trip（crash-recovery の fold、または archive 後の閲覧）で消える。各 step が何ターン追加したかを測る指標が、run 後に照会できない。
2. code-review step は成功のたびに無条件の post-work self-check turn（`followUpPrompt`）を 1 つ実行し、review-feedback Markdown ファイルの Fix カラムと severity を確認する。しかし pipeline の routing 判定は構造化 `report_result` findings（schema 検証済みの severity enum）を読むのであって Markdown ファイルではない。この self-check はどの pipeline 判定も gate しておらず、非 load-bearing な人間向け成果物を採点するだけのターンを毎回消費している。

## 現状コードの前提

- `addedTurns` は `StepRun.outcome` に存在し（`src/state/schema/types.ts:165`）executor / commit-orchestrator が書くが、`StepAttemptRecord.outcome`（`src/store/event-journal.ts:36-45`）に addedTurns フィールドが無い。`stepRunToRecord`（`src/store/event-journal.ts:350-358`）も書き出さず、`fold`（`src/store/event-journal.ts:278-286`）も復元しない。
- journal は append-only の行単位 JSON（`src/store/event-journal.ts:332` の `JSON.stringify(record)`）で、integrity は JSON 妥当性のみ検査し、record のフィールド形状は検査しない。
- 局所 adapter（`src/adapter/claude-code/agent-runner.ts`）は addedTurns を算出する（:771 / :908）。post-work 失敗の early-return（:763-776）は `postWork++`（:779）より前に return するため、失敗した post-work turn が計上されない。不変（`src/core/port/agent-runner.ts:208`）: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`。
- code-review の `followUpPrompt`（`src/core/step/code-review.ts:161-175`）は review-feedback の .md を読み、Fix カラム ∈ {yes,no} と severity 定義一致を確認する。成功時に無条件実行される。テーブル・必須カラムの **形式** は既存の content-format outputContract（`src/core/step/code-review.ts:139-159`）が既に担保している。
- routing に効く severity: `report_result` findings は schema 検証済みの severity enum を持つ（`src/core/step/report-tool.ts:95` の `union([critical, high, medium, low])`）。judge-verdict は構造化 findings から verdict を導出する（`src/core/step/judge-verdict.ts:38` の critical|high → needs-fix）。code-fixer は構造化 findings の severity を消費する（`src/core/step/fixer-helpers.ts`）。.md は人間向け成果物で、code-fixer は構造化 findings を読み、toolResult を欠く旧 job の resume でのみ .md にフォールバックする（`src/core/step/code-fixer.ts:323`）。
- main code-review turn は severity 定義を system prompt 経由で既に受け取っている（`src/core/step/code-review.ts:86`「Refer to the Pipeline Rules in your system prompt for the findings format and severity definitions」）。

## 要件

1. `addedTurns` を journal record に永続化する。`StepAttemptRecord.outcome` に `addedTurns`（`{ reportRetry, postWork, outputRepair }`）を追加し、`stepRunToRecord` で書き出し、`fold` で復元する。addedTurns を持たない旧 record は欠落を許容する（fold で undefined、後方互換）。write→fold の round-trip がロスレスであること。
2. 局所 adapter の post-work turn count-miss を修正する。post-work turn が失敗する経路でも `addedTurns.postWork` に計上されるようにする。あわせて addedTurns を欠く return 経路があれば付与し、返却する addedTurns が常に整合するようにする。不変 `reportRetry + outputRepair === followUpAttempts` を保つ。
3. code-review の無条件 post-work self-check turn を除去する。`followUpPrompt` を撤去する。形式（テーブル・必須カラム）は既存の content-format outputContract が引き続き担保する。severity 定義は main review turn が system prompt 経由で既に受け取っているため、severity 判断は main review 本体で行う。

## スコープ外

- managed adapter は addedTurns を現状まったく計上していない（別の gap）。managed 側の計上追加は本 request の対象外。
- .md の Fix カラム値・severity 値の per-row 決定論検証を content-format seam に新設すること。routing は構造化 findings 経由で .md は非 load-bearing のため不要。content-format seam に負検査（must-not-match / 全行 universal 検査）を足す機構拡張はしない。
- 完了契約の初回注入・`skipWhen`・その他 post-work prompt（別 request で対応済み / 対象外）。

## 受け入れ基準

- [ ] addedTurns を持つ `StepRun` を journal に append し `fold` で読み戻すと addedTurns が一致することをテストで固定する（round-trip ロスレス）。
- [ ] addedTurns を持たない旧 record を `fold` しても例外なく、その step の `outcome.addedTurns` が undefined になることをテストで固定する（後方互換）。
- [ ] 局所 adapter で post-work turn が失敗した場合も `addedTurns.postWork` に計上されることをテストで固定する。
- [ ] 不変 `reportRetry + outputRepair === followUpAttempts` が保たれることをテストで固定する。
- [ ] code-review の `followUpPrompt` / `getFollowUpPrompt` が存在しないことをテストで固定する（無条件 post-work turn の除去）。
- [ ] 形式適合の review-feedback で code-review の post-work / repair turn が発火しないことをテストで固定する。
- [ ] 形式違反の review-feedback（テーブル不正）で従来どおり repair が発火することをテストで固定する（既存 content-format 契約の挙動保存）。
- [ ] routing verdict が構造化 findings から導出され .md self-check の除去で pipeline 遷移の観測挙動が不変であることをテストで固定する（.md が routing の入力でないことを lock する）。既存テストは本変更で期待が変わる箇所以外は無変更で green。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: journal record への addedTurns 追加は optional field（後方互換）。旧 record は fold で undefined。integrity は行 JSON 妥当性のみ検査するため field 追加と衝突しない。
- **採用**: code-review post-work turn は `followUpPrompt` 撤去で完全除去。形式担保は既存 content-format 契約に委ね、新しい per-row 値検証機構は作らない（routing は構造化 findings 経由で .md は非 load-bearing のため、値検証は pipeline 安全に不要）。
- **却下**: content-format seam に負検査（must-not-match / 全行 universal 検査）を足して .md の Fix/severity 値を CLI 検証する案。blast radius が大きく、守る対象（.md）が routing に効かないため費用対効果が無い。
- **却下**: R1 相当（metrics 永続化）と R2 相当（code-review trim）を別 request に分割する案。両者は「added-turn 削減の仕上げ」で物語が一体、編集面も disjoint で 1 レビュー収束ループに収まる。
- **注記（legacy-resume エッジ）**: code-fixer が structured toolResult を欠く旧 job の resume で .md にフォールバックする経路のみ、.md の severity/Fix が code-fixer の入力になる。.md は review agent が構造化 findings と同時に書くため write 時点で整合しており、judge-verdict は既に構造化 findings で routing 済み。本変更は code-fixer のフォールバック経路を変えないためエッジを悪化させない。「.md は routing の入力でない」不変を受け入れ基準の test で lock する。
