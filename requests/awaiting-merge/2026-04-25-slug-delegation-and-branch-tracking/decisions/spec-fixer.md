# Spec-Fixer Decisions — iteration 1

Finding #1 を branch-registration/spec.md に統合する :: RequestSummary/RequestDetail の型拡張は branch-registration の責務（DB 永続化→公開型への露出）の延長線上にあり、別 spec を新設するより自然

Finding #2 を last-write-wins で解決する :: エージェントのリトライ・ブランチ再作成は正常なユースケースであり、エラーにすると再実行フローが複雑化する。上書きが最もシンプル

Finding #3 の型記述を統一する :: JSON Schema では integer 型が明示的に存在するため、string との曖昧な記述を排除

Finding #4 の slug 抽出に「最初の / 以降」ルールを採用する :: TYPE_PREFIX_MAP のいずれも単一セグメント（feat, change, refactor, fix）であり、最初の / で split すれば slug が得られる

Finding #5 のタイムアウトを 30 秒に設定する :: register_branch は DB 書き込みのみで数ミリ秒で完了するが、将来の Custom Tool（submit_verdict 等）はより長時間かかる可能性がある。30 秒は十分な余裕を持つ汎用的な上限

Finding #6 の requestId を message に埋め込む方針を選択する :: エージェントが register_branch の引数として request_id を渡す必要があり、session context からの取得方法が標準化されていないため、message 内にリテラル値として含めるのが確実

Finding #7 を ownership verification delegation として明示する :: SSE stream route が verifySessionAccessByManagedId() で session 所有権を検証済みのため、handler 内での追加チェックは session.requestId と input.request_id の一致確認のみで十分
