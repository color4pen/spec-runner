# create 対話 REPL の UX 改善（スピナー + FINAL_DRAFT 出力簡素化）

## Meta

- **type**: spec-change
- **slug**: create-dialog-ux-improvements

## 背景

PR #133 で対話 REPL の基本動作は修正されたが、2 つの UX 問題が残っている。

### 1. LLM 応答待ち中に何も表示されない

`query()` を呼んでから最初の `stream_event` が返るまでの間、ターミナルに何も表示されない。ユーザーにはフリーズに見える。ツール実行中（Read / Grep / Glob）も同様に無音になる区間がある。

### 2. FINAL_DRAFT で request.md の全文がターミナルに出力される

LLM が `<!-- FINAL_DRAFT -->` マーカーの後に request.md 全文を出力するが、対話中に draft ファイルは随時更新されている。全文出力は冗長。ファイルパスだけ提示すれば十分。

## 要件

### 1. スピナー表示

1. `query()` を呼んでから最初の `stream_event`（text_delta）が返るまでの間、ターミナルにスピナーを表示する。`ora` 等の外部ライブラリは使わず、ANSI エスケープで簡易スピナーを自前実装する

2. スピナーは stderr に表示する（stdout は LLM 応答用）。`process.stderr.isTTY === false` の場合はスピナーを無効化する（ANSI エスケープがゴミ文字になるのを防止）

3. 最初の text_delta を受信したらスピナーを停止し、行をクリアする

4. ツール実行中（`tool_use_summary` 受信時）はスピナーを停止して `[tool] <summary>` を表示する。次の text_delta を受信するまでスピナーは再開しない（ツール連続実行時のチャタリング防止）

5. スピナーのロジックは `src/cli/spinner.ts` に独立モジュールとして実装する。`start()` / `stop()` の 2 メソッド。アニメーションパターンと間隔は実装者が決定する

### 2. FINAL_DRAFT 出力の簡素化

6. FINAL_DRAFT マーカーの検出は既存の `detectCompletion()` 方式を維持する（assistant メッセージ受信後に textBuffer 全体を走査）。text_delta のリアルタイムスキャンは行わない（delta 境界問題を回避）

7. FINAL_DRAFT 検出時、ストリーミング出力済みの全文は ANSI エスケープ（`\r\x1b[K` 等）でクリアせず、そのまま残す。代わりにその後の確認メッセージで draft ファイルのパスを表示する: `\nrequest.md を作成しました: specrunner/requests/draft/<slug>/request.md`

8. 「この内容で request.md を書き出しますか？ [y/N]」の確認は維持する。`y` で active/ に移動、`n` で対話継続

### 3. processAssistantTurn のストリーミング制御抽出

9. `processAssistantTurn` からストリーミング表示制御（スピナー start/stop + text_delta の stdout 出力 + tool_use_summary の stderr 出力）を独立関数に抽出する。processAssistantTurn は制御フロー（slug 検出 / FINAL_DRAFT 検出 / ユーザー確認）に専念する

### 4. テスト

10. スピナーの start / stop のユニットテスト（TTY / 非 TTY）
11. processAssistantTurn のストリーミング制御抽出後の動作テスト

## スコープ外

- ストリーミング表示のマークダウンレンダリング
- ツール実行の進捗バー
- FINAL_DRAFT 後の出力済みテキストの ANSI クリア（一瞬表示されて消える UX は避ける）

## 受け入れ基準

- [ ] LLM 応答待ち中にスピナーが stderr に表示される
- [ ] 非 TTY 環境でスピナーが無効化される
- [ ] 最初の text_delta 受信でスピナーが消える
- [ ] ツール実行中は `[tool]` 表示後、次の text_delta までスピナーは再開しない
- [ ] FINAL_DRAFT 検出時に draft ファイルパスが表示される
- [ ] 書き出し確認フローが維持される
- [ ] processAssistantTurn からストリーミング制御が抽出されている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **FINAL_DRAFT のリアルタイムスキャンを行わない**: text_delta の境界をマーカーがまたぐケースの処理が複雑。既存の assistant メッセージ受信後の一括判定を維持する。全文が一度表示されるのは許容し、確認メッセージで draft パスを案内する
- **スピナーは自前実装**: ora は 10+ の transitive dependencies。CLI スピナー程度なら自前で十分
- **非 TTY ガードは要件に含める**: `process.stderr.isTTY` チェックは 1 行で済む。スコープ外にする理由がない
- **ツール連続実行時はスピナーを再開しない**: tool_use_summary → スピナー停止 → 次の text_delta でスピナー開始。チャタリング防止
