## Spec Fixer Decisions

### iter1 — message-streaming delta 削除

`openspec/changes/remove-session-timeout/specs/message-streaming/spec.md` を完全削除する :: message-streaming spec（`/api/repos/{owner}/{name}/status` polling）は Next.js Web UI の client-side 仕様であり、step session wall-clock timeout 撤廃とは無関係。前回 iter1 で「main spec と同等内容に書き戻し」した結果 no-op delta として残置されたが、scope 外 delta は将来の archive・validate で不要な差分を生む温床になるため削除が最善策。

`design.md` / `tasks.md` の `message-streaming` 参照テキスト（「scope 外・変更なし」旨の注記）を削除する :: ファイルが存在しなくなった後もドキュメントにその旨を書き続けると、読者が「なぜ scope 外と断言したのか」を追跡しようとして存在しないファイルを探すことになる。削除した事実は本 decisions ファイルで記録されるため、本文からの除去で情報量は損なわれない。
