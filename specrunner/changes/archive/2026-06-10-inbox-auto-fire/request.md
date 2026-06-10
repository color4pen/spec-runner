# issue を起点に job を自動発火する one-shot コマンド（承認ラベル起動 + /resume 再開）を追加する

## Meta

- **type**: new-feature
- **slug**: inbox-auto-fire
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

job の起動と escalation からの再開はすべて terminal での手動操作であり、無人運用ができない。issue-notification で外向き輸送路（job → issue コメント）が整うため、本 request は内向き輸送路を追加する: 承認ラベル付き issue からの新規起動と、`/resume` コメントによる再開。発火判定を冪等な one-shot コマンドに集約し、起動装置（ローカルの cron / launchd ポーリング、CI の GitHub Actions トリガー）は CLI の外に置く。常駐プロセスは作らない。

## 現状コードの前提

- job の状態は git 側に永続化され、escalation は `awaiting-resume` status + resumePoint として記録される（`src/state/schema.ts`、`src/core/pipeline/pipeline.ts:289-303`）
- `job resume` は既存コマンドで、resumePrompt（再開時に agent へ渡す人間の指示）の受け口が存在する（`src/core/step/executor.ts` の `deps.resumePrompt` 経由）
- issue-notification（依存 request）が JobState の issue 紐付けフィールドと、bot コメントの機械可読マーカー（種別 + jobId）を提供する
- 多重起動の検出に使える PID liveness 機構が job state に存在する（job ls の stale 検出）

## 要件

1. one-shot コマンド `specrunner inbox run` を追加する: 1 回の実行で以下の走査と発火を行い、終了する。常駐しない。同時実行中の自分自身や既存 job との衝突は job state（紐付け・PID liveness）のみで判定し、コマンド自身は状態ファイルを持たない
2. 新規起動の走査: open かつ承認ラベル付きで、job 紐付けが存在しない issue を検出し、issue 本文を request.md として取り込み validate → 合格なら `job start --issue <number>` 相当で起動、不合格なら validate エラーを issue にコメントで差し戻す（issue-notification の通知経路を使用）。承認ラベル名は config で設定可能とし、デフォルトを定める
3. 再開の走査: `awaiting-resume` の job について、紐付け issue に「最新の escalation マーカーコメントより新しい、`/resume` で始まる collaborator 以上のコメント」があれば、`/resume` に続く本文を resumePrompt として `job resume` 相当を実行する
4. 冪等性: 新規起動は「紐付けの不存在」、再開は「awaiting-resume status」のみを発火条件とし、同じ入力で 2 度発火しないことを job state だけで保証する。処理済みコメントの記録など、独自の消費位置管理を持たない
5. 権限境界: `/resume` コメントの author 権限（author_association が OWNER / MEMBER / COLLABORATOR のいずれか）を検証し、それ以外は無視する。bot 自身のコメントはマーカーで除外する
6. GitHubClient port の拡張: ラベルによる issue 検索・issue コメント一覧取得（author_association 含む）を forge 中立な意味論で追加する
7. 1 回の inbox run で新規起動する job 数の上限を config で設定可能にする（暴走・コスト防御）
8. 起動装置のドキュメント: ローカル（cron / launchd）と GitHub Actions（schedule / issues.labeled / issue_comment トリガー）の設定例を README に追加する

## スコープ外

- 常駐 watch モード
- ゆるい自然文 issue からの LLM による request 生成（issue 本文は request.md 形式を前提とする。issue form テンプレートの提供は本 request に含めてよい）
- issue の自動クローズ・ラベルの自動付け替え
- Slack / webhook 等 GitHub 以外の輸送路
- 並列実行候補の自動衝突判定（ファイル footprint 解析）

## 受け入れ基準

- [ ] 承認ラベル付き・未紐付け issue から job が起動し、同じ issue で 2 回目の inbox run が何もしないこと（GitHubClient mock でテスト）
- [ ] request.md として不正な issue 本文が validate エラーコメントとして差し戻され、job が作られないこと
- [ ] awaiting-resume の job が `/resume` コメントで再開され、コメント本文が resumePrompt として渡ること
- [ ] escalation マーカーより古いコメント・権限のない author・bot 自身のコメントでは再開しないこと
- [ ] 起動上限 config が効くこと
- [ ] inbox run が issue 紐付けのない既存 job の挙動に影響しないこと
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- start は状態（ラベル）、resume は内容つきイベント（コマンドコメント）という非対称を採る。承認は 1 bit の状態で GitHub の triage 権限ゲートに乗り、escalation への回答は文章を運ぶ必要があるため。媒体を情報の形に合わせた結果であり、揃えない
- one-shot + 外部起動装置の構成は「プロセスに state を持たせない」原則の発火層への適用。冪等性を job state のみで閉じることで、消費位置管理・クラッシュリカバリ・多重起動の問題を構造的に消す
- 発火判定に LLM を使わない。トリガー経路は完全に決定的とし、非決定性は起動された pipeline の中に封じる
