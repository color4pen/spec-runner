# Test Case Generator Decisions

## カバレッジ方針

must テストケースを仕様の中核機能（受け入れ基準・セキュリティ境界・サイレント障害検出）から網羅的に導出し、should/could を追加する :: pipeline-context.md の must-areas 8 領域が全てカバーされることを先に保証し、その後に分岐網羅を追加する優先順位とする

request.md パーサーは unit テストに分類する :: 外部 API・DB・ファイルシステムに依存せず正規表現と fs.readFile のみを使うため自動化単体テストで完結できる

GitHub Device Flow は manual テストと unit（モック）の両方を生成する :: Device Flow の実機検証は GitHub OAuth App の client_id と実ブラウザ操作が必要で自動化が困難。ただし fetch モックで各レスポンス分岐を網羅する unit テストは自動化可能

Custom Tool registry の colocate 検証（grep テスト）は unit に分類する :: ファイルシステムの grep であり CI で自動実行可能。Bug 1 再発防止の構造的テストとして must とする

SSE break-after-completion は unit テストで検証する :: completion.ts の assertBreakAfterCompletion ヘルパーに対してモック event を注入し break が呼ばれることを確認できる。実 SSE 接続は不要

atomic write のテストは integration に分類する :: 実ファイルシステムへの書き込みを伴うが外部 API は不要。temp+rename のシーケンスは fs.promises を使って自動化可能

specrunner init / login / run / ps の受け入れテストは integration に分類する :: in-process でモック SDK を注入できる設計のため実 Anthropic API 不要

破損 state ファイルの ps 継続表示は integration に分類する :: 実ファイルシステムへの書き込みで再現し自動化可能

## Priority 判定の根拠

must-areas 全領域は自動的に must とする :: pipeline-context.md の明示的指定に従う

Custom Tool 登録の出口/入口接続（Bug 1 再発防止）を must とする :: code-review emphasis に明記。registry 経由の単一 source-of-truth を構造的に検証しないと定義と dispatch の乖離がサイレント障害になる

SSE break-after-completion を must とする :: 過去に 2 回踏んだ既知バグ（feedback_sse_break_after_completion）。completion.ts の assertBreakAfterCompletion が機能することの確認

atomic write の SIGINT 耐性は must とする :: POSIX rename が保証する invariant であり、partial write を残すと state 管理が崩壊する

破損 state ファイルが存在する状態での ps 継続表示は must とする :: emphasis に明記のサイレント障害検出パターン

状態マシン失敗遷移（CHANGE_FOLDER_NOT_FOUND / SESSION_TERMINATED 等）は must とする :: propose パイプライン spec の failure table が唯一の正として仕様化されており、逸脱は仕様違反

## Automation 判定

実 GitHub OAuth Device Flow（ブラウザ操作込み）は manual とする :: 自動化するには GitHub Test Account + OAuth App が必要で CI 環境構築コストが高い

実 Anthropic Managed Agents API 呼び出しは manual とする :: 有料 API のため unit / integration テストはモック SDK で代替。実機検証は manual

config ファイルの permission 0600 検証は integration（自動化可能）とする :: fs.stat で mode を確認できる。OS 依存なし

TTY 判定（specrunner ps の列幅）は manual とする :: CI 環境では TTY が存在しないため視覚的確認が必要
