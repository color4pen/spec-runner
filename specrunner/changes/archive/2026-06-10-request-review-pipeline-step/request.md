# request review をパイプラインステップ化する

## Meta

- **type**: spec-change
- **slug**: request-review-pipeline-step
- **base-branch**: main
- **adr**: true

## 背景

`request review` は現在スタンドアロンのコマンドで、`OneShotQueryClient` 経由の read-only 実行。`request generate` と組み合わせて issue → generate → run の流れを簡素化するにあたり、review をパイプラインの最初のステップに組み込み、`request review` コマンドを廃止する。

review がパイプラインに入ることで、run するだけで review → design → ... → pr-create の全フローが走る。needs-discussion で止まった場合は drafts 側の request.md を修正し、resume で再開する（resume 時に drafts から worktree へ request.md を再コピーする）。

## 要件

1. request-review を AgentStep として実装する（AgentRunner + report_tool 経由の typed verdict）
2. 現行の verdict 体系を維持する（approve / needs-discussion / reject）
3. パイプラインの遷移表に追加する:
   - request-review → approve → design
   - request-review → needs-discussion → escalate
   - request-review → reject → escalate
4. モデルは config の解決チェーンに従う（他のステップと同じ。デフォルト sonnet）
5. resume 時に drafts の request.md が存在すれば worktree へ再コピーする（存在しなければスキップ）
6. `request review` コマンドを廃止する
7. review は read-only のまま（request.md を修正しない。品質改善は generate 側の責務）
8. managed runtime 対応: `managed.ts` の `AgentRegistry.fromSteps()` に RequestReviewStep を追加する（`managed setup` 再実行で登録される）
9. archive 時に `specrunner/drafts/<slug>/` が存在すれば削除する（存在しなければスキップ）
10. レビュー結果を `changes/<slug>/request-review-result-{n}.md` に書き出す（他のステップと同じ形式）

## スコープ外

- request.md の auto-fix（review の責務ではない）
- review のスキップ機能（全 run で review を通す）
- issue 連携（外部スクリプトの責務）
- パイプライン内の spec-review / code-review への影響

## 受け入れ基準

- [ ] `specrunner run <slug>` で review が最初のステップとして走る
- [ ] approve 時に design に進む
- [ ] needs-discussion 時にパイプラインが escalate で止まる
- [ ] reject 時にパイプラインが escalate で止まる
- [ ] needs-discussion で止まった後、drafts の request.md を修正して resume で再開できる
- [ ] 全 resume で drafts の request.md が worktree に再コピーされる（request.md はパイプライン中に変更されないため常に安全）
- [ ] `request review` コマンドが廃止されている
- [ ] archive 時に `specrunner/drafts/<slug>/` が削除される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- request-review の verdict（approve / needs-discussion / reject）は遷移表の `on: string` として扱い、Verdict 型は拡張しない
- resume 時の drafts → worktree への request.md 再コピーは全 resume で無条件に実行する（request.md はパイプライン中に変更されないため安全）
