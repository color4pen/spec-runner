# Test Case Generator Decisions

## カバレッジ方針

must-areas（request 作成フォーム、propose セッション起動、change folder 閲覧、セッション状態管理）に属するすべての振る舞いを must として列挙する :: pipeline-context.md の Test Case Generation セクションで明示指定されており、これらが壊れると本機能が成立しない。

must-areas 以外の振る舞い（DB スキーマ整合性、バリデーション詳細、エラーハンドリング、ロールバック）は should または could とする :: 中核機能の動作には直結しないが品質・信頼性に影響するため。

## Priority 判定の根拠

### request 作成フォーム（must-area）

enabled マルチセレクトの UI 表示をmust とする :: request 作成フォームの仕様に enabled が必須項目として定義されており（request.md 受け入れ基準）、これなしではフォームが不完全。

createRequest() への enabled 渡しをmust とする :: DB への enabled 保存は後続の propose セッション指示に使われるため、機能の根幹に関わる。

enabled の不正値バリデーションを should とする :: 不正値があっても request 作成・propose 起動は別途成立するが、データ品質に影響するため should。

### propose セッション起動（must-area）

startPropose() の正常フロー（request 所有確認 -> in-progress -> セッション作成 -> メッセージ送信）をmust とする :: これが動かないと propose セッションが起動できず機能が成立しない。

ブランチ命名生成（type prefix マッピング）をmust とする :: ブランチ名が間違うと change folder が正しい場所に生成されず、後続の閲覧・ハンドラが機能しない。

startPropose() 失敗時のロールバックを should とする :: 失敗時に状態が壊れるとリトライ不能になるが、正常フローが機能していれば初期実装として許容できる。

### change folder 閲覧（must-area）

getDirectoryContents() と getFileContent() の正常取得をmust とする :: これが動かないと change folder 閲覧が機能しない。

GitHub Contents API の 404（ファイルなし）を空配列/null で返すことをmust とする :: propose セッション未完了時にビューアが正常動作するために必要。

ビューアへの「View Change Folder」ボタン表示条件をmust とする :: propose 完了前にボタンが表示されると誤操作を招き、機能として成立しない。

ファイルツリーとコンテンツペインのナビゲーションを should とする :: 単一ファイル表示でも最低限の閲覧は成立するため。

### セッション状態管理（must-area）

propose role の sessions テーブルへの追加をmust とする :: DB に保存できなければセッション管理が機能しない。

handleProposeCompleted() でのセッション完了後の request ステータス維持（in-progress 維持）をmust とする :: design.md Decision 4 で明示されており、誤って reviewing に遷移すると後続パイプラインが破綻する。

propose 完了時に PR を作成しないことをmust とする :: bootstrap との差異であり、誤って PR を作成すると運用上の問題を引き起こす。

セッション role バッジ表示（UI）を should とする :: セッション一覧に role が表示されなくても機能は動くが、UX として必要。

## テストケース ID 割り当て方針

TC-001〜030 を領域別にグループ化する :: 後からテストケースを追加・参照する際の可読性を確保するため。グループ: 001-009 DB/スキーマ、010-019 request 作成、020-029 propose 起動、030-039 完了ハンドラ、040-049 GitHub API、050-059 change folder viewer、060-069 UI 統合。

## Integration vs Unit の判断

Server Action（createRequest, startPropose）はすべて integration とする :: DB 操作と外部 API 呼び出しが絡むため、pure unit では検証できない。

GitHub API wrapper 関数（getDirectoryContents, getFileContent）は integration とする :: HTTP レスポンスのデコード（Base64）を含む変換ロジックと HTTP 呼び出しが分離されていないため。

ブランチ名生成・buildProposeMessage・enabled シリアライズは unit とする :: 純粋な文字列変換ロジックであり、外部依存が不要。

## e2e の適用

ユーザーフロー全体（フォーム送信 -> セッション起動 -> change folder 閲覧）の通し確認を could とする :: 単体/統合テストで各コンポーネントが保証されれば初期実装では省略可能。環境依存も高い。
