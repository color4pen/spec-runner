# PR ごとの attestation をコメント添付する

## Meta

- **type**: new-feature
- **slug**: pr-attestation-comment
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

spec-runner の差別化の芯は「全 run が同じ保証群を通過する」こと（保証集合 G1、`docs/guarantees.md`）。この保証を主張から run ごとの検証可能な成果物へ変える第一歩として、各 run が実際に通過したゲート順・verdict 導出入力・model・予算消費・journal hash を機械可読サマリ（attestation）として PR にコメント添付する。材料は journal（events.jsonl）と usage.json に既に揃っており、本 request は整形と添付の実装が主。

## 現状コードの前提

- pr-create は CLI step で、`deps.githubClient` / `deps.owner` / `deps.repo` を持ち、`runPrCreate` から PR 番号（`result.number`）と URL を得る（`src/core/step/pr-create.ts:44-53`）。
- GitHubClient に `createIssueComment(owner, repo, issueNumber, body)` が既にある（`src/adapter/github/github-client.ts:481`、POST /issues/{n}/comments）。PR は issue なので PR へのコメントに使える。
- journal（events.jsonl）は step 実行・transition・verdict の truth（ADR-20260605）。usage.json が model 使用量・コストを持つ。
- verdict は findings からの機械導出（`src/core/step/judge-verdict.ts`、G1-1）。verdict 導出入力の findings は step 成果物に残る。

## 要件

1. attestation 組立の純関数を新設する: journal（events.jsonl）＋ usage.json ＋ step verdicts / 導出入力 findings を入力に、機械可読な attestation（ゲート実行順＋各ゲートの verdict、verdict 導出入力の要約、step 別 model、予算/コスト消費、events.jsonl の hash）を生成する。副作用なし・単体テスト可能にする。
2. pr-create の PR 作成成功後に、attestation を PR コメントとして `createIssueComment` で添付する。
3. コメント添付は best-effort とする: 添付失敗は warning に留め、pr-create（PR 作成）自体を失敗させない。

**最重量部の名指し**: attestation 組立の純関数（journal + usage → 機械可読サマリ + hash）が本 request の重心。ここを副作用なしにして単体テストで固定する。PR 添付は薄い integration に留める。

## スコープ外

- check-run 方式での添付（本 request は PR コメント方式。check-run 用の新規 GitHub write 能力は追加しない）。
- `specrunner verify <PR>`（journal 再 fold による第三者検証、backlog A-3）。attestation の生成のみで、再検証コマンドは別 request。
- attestation スキーマの版号付け・凍結（契約凍結フェーズで扱う）。
- 既存 gate / verdict 機構の変更。

## 受け入れ基準

- [ ] attestation 組立が副作用なし純関数として実装され、代表的な journal + usage 入力から期待する機械可読サマリ（ゲート順・verdict・step 別 model・コスト・journal hash）を生成することをテストで固定する。
- [ ] pr-create が PR 作成成功後に attestation コメントを添付する。
- [ ] コメント添付失敗が pr-create を失敗させない（best-effort）ことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 添付方式は PR コメント（既存 `createIssueComment` を再利用）を採用。check-run は新規 GitHub write 能力が必要で範囲が広がるため却下（将来 A-3 verify と併せて再検討可）。
- attestation 組立を pr-create に直書きする案は却下。journal / usage → サマリの導出は副作用なし純関数として分離し単体テスト可能にする（判定系純粋性 B-5 と同型）。
- 添付失敗で pr-create を失敗させる案は却下。attestation は補助成果物であり、PR 作成という主目的を添付の失敗で巻き込まない（best-effort）。
