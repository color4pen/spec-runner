# job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する

## Meta

- **type**: new-feature
- **slug**: issue-notification
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

pipeline の escalation と完走は terminal 出力でしか観測できず、無人実行では停止に誰も気付けない。job を起点 issue に紐付け、状態変化を issue コメントとして書き戻すことで、GitHub の通知設定（メール / モバイル / Slack 連携）がそのまま人間への push 経路になる。これは将来の自動発火（ラベル起動・`/resume` コメント再開）の前提となる外向き輸送路であり、本 request は外向きのみを対象とする。

## 現状コードの前提

- `GitHubClient` port（`src/kernel/github-client.ts:24`）の現メソッドは branch / PR / check / raw file 系のみで、issue 操作の API は存在しない
- `JobState`（`src/state/schema.ts`）に issue 番号のフィールドは存在しない
- escalation は `pipeline.ts` の terminal 処理で `transitionJob(state, "awaiting-resume", ...)` として永続化され、resumePoint（step / reason / iterationsExhausted）が記録される（`src/core/pipeline/pipeline.ts:289-303`）
- 完走は同処理で `transitionJob(state, "awaiting-archive", ...)` に遷移する（`src/core/pipeline/pipeline.ts:277-287`）

## 要件

1. issue 紐付け: `job start`（および alias `run`）に任意オプション `--issue <number>` を追加し、JobState に issue 番号フィールドとして永続化する。未指定の job は従来どおり（通知なし・挙動不変）
2. GitHubClient port の拡張: issue へのコメント作成メソッドを追加する。シグネチャは forge 中立な意味論（owner / repo / issueNumber / body）に保ち、GitHub 固有概念を port に持ち込まない
3. escalation 通知: job が awaiting-resume へ遷移したとき、紐付け issue に「停止した step・理由（resumePoint の内容）・再開手順（`specrunner job resume <slug>`）」を含むコメントを書き込む
4. 完走通知: job が awaiting-archive へ遷移したとき、紐付け issue に PR の URL を含む完了コメントを書き込む
5. コメントには機械可読マーカー（HTML コメント等）を埋め込み、コメント種別（escalation / completed）と jobId を識別できるようにする。将来の内向き輸送路（`/resume` 走査の基準点判定・bot 自身のコメント除外）が author 名に依存せず成立するための布石
6. 通知は best-effort とする: コメント書き込みの失敗（ネットワーク・権限・issue クローズ済み等）は警告出力に留め、job の状態遷移・exit code に影響させない
7. 通知の書き込みは local / managed 両 runtime で CLI プロセスから行う（agent には書かせない）

## スコープ外

- 内向き輸送路（承認ラベル走査・`/resume` コメントによる再開・inbox one-shot コマンド）
- issue の自動作成（issue なし job への接ぎ木）
- Slack / 汎用 webhook / メールへの直接通知
- archive / merge-guard 段階の通知
- GitLab 等他 forge の adapter

## 受け入れ基準

- [ ] `--issue` 付きで起動した job の escalation 時に、issue へ理由と再開手順を含むコメントが書き込まれる（GitHubClient mock でテスト）
- [ ] 完走時に PR URL を含むコメントが書き込まれる
- [ ] コメントに種別と jobId の機械可読マーカーが含まれる
- [ ] `--issue` なしの job では issue 関連の API 呼び出しが一切発生しない
- [ ] コメント書き込み失敗時も job の最終状態と exit code が変化しない
- [ ] JobState の issue フィールドが state の永続化・復元で保持される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 通知チャネルは GitHub のみとする。issue コメントは GitHub 本体の通知設定（メール / モバイル / Slack 連携）へ配られるため、GitHub への書き込みが実質的な通知ルーターとなり、Slack / メールの直接実装は車輪の再発明になる
- 通知を job の成否から切り離す（要件 6）。通知は観測手段であり、観測の失敗が観測対象を壊してはならない
- 内向き（発火）と外向き（通知）を別 request に分離する。内向きは本 request のマーカー（要件 5）と紐付けフィールド（要件 1）を前提とするため、依存は一方向で固定される
