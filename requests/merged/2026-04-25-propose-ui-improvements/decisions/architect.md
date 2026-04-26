# Architect Decisions — spec-review iteration 1

D1 hybrid lazy-load を承認する :: change folder は慣例で最大3階層であり、初回の shallow listing + click-on-demand は API 呼び出し数とUXのバランスが適切。full recursive は YAGNI
D2 専用 server action `getChangeFolderDirectoryContents` を承認する :: 既存の `getChangeFolderFileContent` と対称的なパターンで一貫性がある。`getChangeFolderFiles` にサブパスを追加するオーバーロードより責務が明確
D3 inline session status を承認する :: 既存 SSE handler (`session.status_idle`) がセッション完了時に `getRequestDetail()` を再取得しており、追加ポーリング不要で実現可能
D4 flat array + children + Set<string> を承認する :: shallow tree に対して十分な構造。深いネスト対応は Non-Goal なので過剰設計にならない
tasks.md の粒度は適切と判断する :: 5グループ・13タスクで server action → state → rendering → navigation → verification の順。依存方向も正しい
design.md の depth guard 記載は十分と判断する :: GitHub API 自体が depth を制限するため、UI 側の depth guard は Non-Goal として明記済み
既存 spec との整合を確認する :: change-folder-viewer delta spec が既存 spec の `Nested directory listing` シナリオを shallow listing に変更しており、既存 spec の「recursively retrieves」との矛盾を検出。MEDIUM として findings に記載する
`getChangeFolderDirectoryContents` の path validation で trailing slash 付きの startsWith チェックを指摘する :: constraints.md に記載のある「トレイリング `/` を付加してプレフィックス衝突も防ぐ」パターンの適用確認が必要
