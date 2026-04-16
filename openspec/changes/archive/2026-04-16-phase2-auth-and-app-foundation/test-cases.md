# Test Cases: Phase 2 — Auth and App Foundation

## Summary
- Total: 52
- Must: 26
- Should: 18
- Could: 8

---

## Must

### TC-001: 未認証ユーザーの protected ページアクセスがリダイレクトされる
- **Category**: security
- **Scenario**: 未認証状態で `(protected)` ルートグループ配下の任意の URL にアクセスする
- **Expected**: ログインページにリダイレクトされ、保護されたコンテンツは表示されない
- **Type**: automated

### TC-002: 未認証リクエストの SSE エンドポイントが 401 を返す
- **Category**: security
- **Scenario**: 認証なしで `/api/sessions/[id]/stream` に GET リクエストを送信する
- **Expected**: HTTP 401 Unauthorized が返り、SSE ストリームは確立されない
- **Type**: automated

### TC-003: 未認証リクエストの Server Action が拒否される
- **Category**: security
- **Scenario**: 認証なしで `createSession`、`sendMessage` 等の Server Action を呼び出す
- **Expected**: 認証エラーが返り、処理は実行されない
- **Type**: automated

### TC-004: 未認証リクエストのセッション作成が拒否される
- **Category**: security
- **Scenario**: 認証なしで `createBoundSession` Server Action を呼び出す
- **Expected**: 認証エラーが返り、Managed Agents API は呼ばれず、user_sessions にレコードは挿入されない
- **Type**: automated

### TC-005: 未認証リクエストのメッセージ送信が拒否される
- **Category**: security
- **Scenario**: 認証なしで `sendMessage` Server Action を呼び出す
- **Expected**: 認証エラーが返り、Managed Agents API は呼ばれない
- **Type**: automated

### TC-006: 他ユーザーのセッション一覧が取得できない
- **Category**: security
- **Scenario**: ユーザー A でログインし、ユーザー B が所有する user_sessions レコードを `listUserSessions` で取得しようとする
- **Expected**: ユーザー A 自身のセッションのみが返り、ユーザー B のセッションは含まれない
- **Type**: automated

### TC-007: セッション作成時の repo パラメータバリデーション（正常値）
- **Category**: security
- **Scenario**: `owner/repo-name` 形式の正しい repo パラメータでセッションを作成する
- **Expected**: バリデーションを通過し、セッションが作成される
- **Type**: automated

### TC-008: セッション作成時の repo パラメータバリデーション（不正値）
- **Category**: security
- **Scenario**: `../etc/passwd`、`owner/repo; rm -rf /`、空文字列、スラッシュなし、特殊文字を含む値で `createBoundSession` を呼び出す
- **Expected**: バリデーションエラーが返り、セッションは作成されない
- **Type**: automated

### TC-009: OAuth トークンの JWT 暗号化格納
- **Category**: security
- **Scenario**: GitHub OAuth でログイン後、JWT のペイロードを確認する
- **Expected**: OAuth access_token が Auth.js の暗号化された JWT 内に格納され、平文では露出しない
- **Type**: automated

### TC-010: GitHub API トークン失効時のセッション無効化
- **Category**: security
- **Scenario**: OAuth トークンが失効した状態で GitHub API を呼び出す
- **Expected**: HTTP 401 が検出され、Auth.js セッションがクリアされ、再認証を促すメッセージと共にログインページにリダイレクトされる
- **Type**: automated

### TC-011: OAuth トークンが環境変数 GITHUB_TOKEN の代わりに使用される
- **Category**: security
- **Scenario**: セッション作成時に Managed Agents API に渡される `authorization_token` を確認する
- **Expected**: 静的な環境変数ではなく、認証ユーザーの OAuth トークンが `authorization_token` として使用される
- **Type**: automated

### TC-012: users テーブルの github_id UNIQUE 制約
- **Category**: data-integrity
- **Scenario**: 同一の `github_id` で 2 回 INSERT を試みる
- **Expected**: 2 回目の INSERT が UNIQUE 制約違反で拒否される
- **Type**: automated

### TC-013: user_sessions テーブルの外部キー制約
- **Category**: data-integrity
- **Scenario**: users テーブルに存在しない `user_id` で user_sessions に INSERT を試みる
- **Expected**: 外部キー制約違反で拒否される（PRAGMA foreign_keys = ON が有効である前提）
- **Type**: automated

### TC-014: PRAGMA foreign_keys = ON が有効化されている
- **Category**: data-integrity
- **Scenario**: DB 接続初期化後に `PRAGMA foreign_keys` を確認する
- **Expected**: 結果が `1`（ON）である
- **Type**: automated

### TC-015: セッション作成失敗時のロールバック（user_sessions 未挿入）
- **Category**: data-integrity
- **Scenario**: Managed Agents API がエラーを返す状況でセッション作成を試みる
- **Expected**: user_sessions テーブルにレコードが挿入されず、エラーがユーザーに表示される
- **Type**: automated

### TC-016: 初回ログイン時のユーザーレコード作成
- **Category**: data-integrity
- **Scenario**: users テーブルに該当 github_id が存在しない状態でログインする
- **Expected**: users テーブルに新規レコードが作成され、github_id, github_login, github_avatar_url が保存される
- **Type**: automated

### TC-017: 再ログイン時のプロフィール更新
- **Category**: data-integrity
- **Scenario**: 既存ユーザーが GitHub 上で login 名やアバター URL を変更した後に再ログインする
- **Expected**: users テーブルの github_login と github_avatar_url が最新値に更新される
- **Type**: automated

### TC-018: マイグレーションの冪等性
- **Category**: data-integrity
- **Scenario**: 既にマイグレーション済みの DB に対して再度マイグレーションを実行する
- **Expected**: 変更なしで正常に完了する
- **Type**: automated

### TC-019: DB 未存在時の自動作成
- **Category**: data-integrity
- **Scenario**: `data/spec-runner.db` が存在しない状態でアプリケーションを起動する
- **Expected**: DB ファイルが自動作成され、マイグレーションが適用される
- **Type**: automated

### TC-020: SSE エンドポイントの 401 レスポンス形状
- **Category**: api-contract
- **Scenario**: 未認証で `/api/sessions/[id]/stream` にリクエストする
- **Expected**: HTTP 401 ステータスコード、レスポンスボディにエラーメッセージが含まれる
- **Type**: automated

### TC-021: Auth.js API ルートのレスポンス（正常認証フロー）
- **Category**: api-contract
- **Scenario**: `/api/auth/callback/github` に正しい authorization code を含むリクエストを送信する
- **Expected**: セッション Cookie が設定され、リダイレクトレスポンスが返る
- **Type**: automated

### TC-022: Server Action のエラーレスポンス形状（認証エラー）
- **Category**: api-contract
- **Scenario**: 認証なしで任意の保護された Server Action を呼び出す
- **Expected**: 一貫したエラーオブジェクト形状（error フィールドとメッセージ）が返る
- **Type**: automated

### TC-023: セッション作成 API のレスポンス形状（成功時）
- **Category**: api-contract
- **Scenario**: 認証済みユーザーが正しいパラメータでセッションを作成する
- **Expected**: 作成された user_session の id、session_id、repo、title、status、created_at を含むレスポンスが返る
- **Type**: automated

### TC-024: セッション作成 API のレスポンス形状（バリデーションエラー時）
- **Category**: api-contract
- **Scenario**: 不正な repo フォーマットでセッションを作成する
- **Expected**: HTTP エラーステータスと、バリデーションエラーの詳細を含むレスポンスが返る
- **Type**: automated

### TC-025: セッション一覧 API のレスポンス形状
- **Category**: api-contract
- **Scenario**: 認証済みユーザーが特定リポジトリのセッション一覧を取得する
- **Expected**: user_sessions の配列（各要素に id, session_id, repo, title, status, created_at, updated_at を含む）が created_at DESC 順で返る
- **Type**: automated

### TC-026: セッションアーカイブ API のレスポンス形状
- **Category**: api-contract
- **Scenario**: 認証済みユーザーが既存セッションをアーカイブする
- **Expected**: 更新された user_session（status が 'archived' に変更）が返り、Managed Agents API のアーカイブも成功する
- **Type**: automated

---

## Should

### TC-027: GitHub OAuth ログインフローの完走
- **Category**: functional
- **Scenario**: ログインページで「Sign in with GitHub」をクリックし、GitHub で認可を許可する
- **Expected**: GitHub OAuth 画面にリダイレクトされ、認可後にアプリに戻り、認証済みセッションが確立される
- **Type**: manual

### TC-028: ログアウトフローの完走
- **Category**: functional
- **Scenario**: 認証済みユーザーがログアウトボタンをクリックする
- **Expected**: Auth.js セッションが破棄され、JWT Cookie がクリアされ、ログインページにリダイレクトされる
- **Type**: automated

### TC-029: ログインページの表示
- **Category**: functional
- **Scenario**: 未認証でアプリケーションルートにアクセスする
- **Expected**: 「SpecRunner」のアプリ名と「Sign in with GitHub」ボタンを含むログインページが表示される
- **Type**: automated

### TC-030: 認証済みユーザーのログインページリダイレクト
- **Category**: functional
- **Scenario**: 認証済みユーザーがログインページに直接アクセスする
- **Expected**: リポジトリ一覧ページにリダイレクトされる
- **Type**: automated

### TC-031: リポジトリ一覧の表示
- **Category**: functional
- **Scenario**: 認証済みユーザーがリポジトリ一覧ページにアクセスする
- **Expected**: GitHub API から取得したリポジトリがカード/リスト形式で表示され、各エントリに名前、オーナー、説明、言語、最終更新日が含まれる
- **Type**: automated

### TC-032: リポジトリ選択によるワークスペースへのナビゲーション
- **Category**: functional
- **Scenario**: リポジトリ一覧からリポジトリカードをクリックする
- **Expected**: `/repos/{owner}/{repo}` に遷移する
- **Type**: automated

### TC-033: ワークスペースページのレイアウト表示
- **Category**: functional
- **Scenario**: 認証済みユーザーが `/repos/{owner}/{repo}` にアクセスする
- **Expected**: 左にサイドバー（セッション一覧 + 新規セッションボタン）、右にメインエリアが表示される
- **Type**: automated

### TC-034: ワークスペースのセッション一覧表示
- **Category**: functional
- **Scenario**: ユーザーが既存セッションを持つリポジトリのワークスペースを開く
- **Expected**: サイドバーにユーザーの当該リポジトリのセッションが created_at DESC 順で表示され、各セッションにタイトル、ステータス、作成日が含まれる
- **Type**: automated

### TC-035: 新規セッション作成フロー
- **Category**: functional
- **Scenario**: ワークスペースで「New Session」ボタンをクリックし、セッションを作成する
- **Expected**: Managed Agents セッションが作成され、user_sessions にレコードが挿入され、デフォルトタイトル「Session YYYY-MM-DD HH:mm」が設定される
- **Type**: automated

### TC-036: セッション選択によるチャット表示
- **Category**: functional
- **Scenario**: サイドバーのセッションをクリックする
- **Expected**: メインエリアにチャットインターフェースが表示され、SSE ストリーミングが確立される
- **Type**: automated

### TC-037: セッション未選択時のデフォルト表示
- **Category**: functional
- **Scenario**: ワークスペースでセッションを選択していない状態
- **Expected**: メインエリアに「新しいセッションを作成するか、既存のセッションを選択してください」等のプロンプトが表示される
- **Type**: automated

### TC-038: セッションステータスのオンデマンドリフレッシュ
- **Category**: functional
- **Scenario**: セッションエントリのリフレッシュボタンをクリックする
- **Expected**: Managed Agents API から最新ステータスを取得し、user_sessions の status と updated_at を更新して表示に反映する
- **Type**: automated

### TC-039: セッションアーカイブ操作
- **Category**: functional
- **Scenario**: ユーザーがセッションのクローズ/アーカイブ操作を行う
- **Expected**: Managed Agents API でアーカイブされ、user_sessions の status が 'archived' に更新され、サイドバーのアクティブ一覧から消える
- **Type**: automated

### TC-040: ヘッダーナビゲーションの表示
- **Category**: functional
- **Scenario**: 認証済みユーザーが任意の protected ページを表示する
- **Expected**: ヘッダーにアプリ名、ユーザーの GitHub アバター/ログイン名、ログアウトボタンが表示される
- **Type**: automated

### TC-041: ヘッダーのアプリ名クリックでリポ一覧に戻る
- **Category**: functional
- **Scenario**: ワークスペースページでヘッダーのアプリ名をクリックする
- **Expected**: リポジトリ一覧ページに遷移する
- **Type**: automated

### TC-042: Phase 1 デバッグ UI が /debug で認証の背後に配置される
- **Category**: functional
- **Scenario**: 認証済みユーザーが `/debug` にアクセスする
- **Expected**: Phase 1 のデバッグダッシュボード（Agent/Environment/Session/Chat タブ）が表示される
- **Type**: automated

### TC-043: DB 接続がシングルトンである
- **Category**: functional
- **Scenario**: 同一プロセス内で複数のサーバーサイド関数から DB にアクセスする
- **Expected**: 全関数が同一の DB 接続インスタンスを共有する
- **Type**: automated

### TC-044: data/*.db と data/*.db-journal が .gitignore に含まれる
- **Category**: functional
- **Scenario**: `.gitignore` ファイルの内容を確認する
- **Expected**: `data/*.db` と `data/*.db-journal` のエントリが存在する
- **Type**: automated

---

## Could

### TC-045: リポジトリ一覧のページネーション処理
- **Category**: functional
- **Scenario**: 30 件以上のリポジトリを持つユーザーでリポジトリ一覧を表示する
- **Expected**: GitHub API の全ページを取得し、全リポジトリが表示される
- **Type**: automated

### TC-046: リポジトリが 0 件の場合の空状態表示
- **Category**: functional
- **Scenario**: アクセス可能なリポジトリがないユーザーでリポジトリ一覧を表示する
- **Expected**: 「リポジトリが見つかりませんでした」等のメッセージが表示される
- **Type**: automated

### TC-047: セッション 0 件時の空状態表示
- **Category**: functional
- **Scenario**: セッションがないリポジトリのワークスペースを開く
- **Expected**: 最初のセッション作成を促すメッセージが表示される
- **Type**: automated

### TC-048: SSE 接続エラー時のリトライ UI
- **Category**: functional
- **Scenario**: SSE ストリーミング中に接続が切断される
- **Expected**: エラーメッセージとリトライボタンが表示される
- **Type**: manual

### TC-049: GitHub API 呼び出し時のローディング表示
- **Category**: functional
- **Scenario**: リポジトリ一覧の読み込み中
- **Expected**: ローディングインジケーターが表示され、完了後にコンテンツに切り替わる
- **Type**: automated

### TC-050: セッション操作時のエラーハンドリング表示
- **Category**: functional
- **Scenario**: セッション作成/アーカイブ/リフレッシュで API エラーが発生する
- **Expected**: ユーザーにわかりやすいエラーメッセージが表示される
- **Type**: automated

### TC-051: トークン失効時のセッション操作エラー表示
- **Category**: functional
- **Scenario**: セッション操作中に OAuth トークンが無効であることが検出される
- **Expected**: 「GitHub トークンが無効です。再認証してください」等のメッセージが表示される
- **Type**: automated

### TC-052: EventSource のグレースフルクローズ
- **Category**: functional
- **Scenario**: ユーザーがセッション UI からナビゲートアウェイする
- **Expected**: EventSource 接続が適切にクローズされ、リソースリークが発生しない
- **Type**: automated
