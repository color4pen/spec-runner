# Spec Fixer Decisions — cli-doctor-command

## Fix Log (iteration 1)

ADR パスを `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` に修正する :: プロジェクト命名規約（`ADR-YYYYMMDD-<title>.md`）に従い、既存 ADR 全件と整合させるため。`{NNN}-` 形式は規約違反であり learned-patterns に記録済みの反復パターン。

design.md に delta spec パス注記を追加する :: `request.md` L152 の `specs/cli/spec.md` 表記は誤りで、実際のファイルは `specs/cli-commands/spec.md`。request.md は author 所有なので修正せず、design.md に注記を入れて implementer が混乱しないようにする。

tasks.md 13.1 を「decision rationale の整備のみ」に変更する :: workflow option `adr: enabled` がある場合、ADR ファイル生成は Step 7 の `adr-create` スキルの専属責務。implementer が先に書くと二重生成・上書き競合が発生するため、implementer の責務を rationale 整備に限定する。

D7 に timeout 一覧表を追加し Risks の重複 bullet を参照に置換する :: timeout 仕様が D7 本文と Risks に分散していたため、D7 に「default 5s / openspec のみ 30s」の表として一元化する。読み手が仕様を一箇所で把握できるようにするため。

D3 と D9 に exit code 2 の発火層を明記する :: exit 2 を `bin/specrunner.ts` の doctor case 専用 `try/catch` から発火することを spec・design で明示する。既存の `main().catch(exit 1)` と混同されないようにするため。

spec の crash シナリオに `bin/specrunner.ts` の責務を追記する :: 「誰が exit 2 を発するか」を spec シナリオで明確にする。実装者が `runDoctor` 内で完結させるか bin 側で catch するかを誤解しないようにするため。

Non-Goals に Windows フル動作サポートを追記する :: Risks セクションにのみ記載されていた Windows 制限を Goals/Non-Goals にも移動し、scope が明示されるようにするため。

spec の config カテゴリ要件に platform 注記を追加する :: permission 0600 check が Windows で意味を持たないことを仕様レベルで明示し、実装者が条件分岐を見落とさないようにするため。

D8 を「dir 不在 = warn（親 dir 不可なら fail）」に変更する :: dir 不在を pass で隠すと未初期化状態が CI で green になる情報損失が発生する。warn + hint で初期化手順を CI 利用者に伝える方が有用。

spec に jobs dir 不在シナリオを追加する :: D8 の変更を spec に反映し、テストケース生成の根拠にするため。

tasks.md 12.1 を GitHubClient port method 追加に確定する :: `fetch` 直叩きは port パターンに反する。`verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>` を port に追加することで core が HTTP 詳細を直接持つ問題を回避するため。

design.md D6 の GitHub auth 検証手順を port method 使用に確定する :: tasks.md と design.md の一貫性を保ち、実装者に「fetch 直叩き」オプションを残さないようにするため。
