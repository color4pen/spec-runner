# Test Cases: DB Schema Redesign

## Summary
- Total: 38
- Must: 18
- Should: 13
- Could: 7

## Must

### TC-001: verifyRequestOwnership が requests -> repositories -> users チェーンで所有権を検証する
- **Category**: security
- **Scenario**: 認証ユーザー A が所有するリポジトリに紐づくリクエスト R1 に対して `verifyRequestOwnership(R1.id)` を呼び出す
- **Expected**: エラーなく成功し、リクエスト情報が返る
- **Type**: automated

### TC-002: verifyRequestOwnership が他ユーザーのリクエストを拒否する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のリポジトリに紐づくリクエスト R2 に対して `verifyRequestOwnership(R2.id)` を呼び出す
- **Expected**: エラーがスローされ、リクエスト情報は返らない
- **Type**: automated

### TC-003: verifySessionAccess が sessions -> requests -> repositories -> users の4層チェーンで検証する
- **Category**: security
- **Scenario**: 認証ユーザー A が自分のリポジトリ -> リクエスト -> セッション S1 に対して `verifySessionAccess(S1.id)` を呼び出す
- **Expected**: エラーなく成功し、セッション情報が返る
- **Type**: automated

### TC-004: verifySessionAccess が他ユーザーのセッションを拒否する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のリポジトリ -> リクエスト -> セッション S2 に対して `verifySessionAccess(S2.id)` を呼び出す
- **Expected**: エラーがスローされ、セッション情報は返らない
- **Type**: automated

### TC-005: repositories テーブルの user_id + full_name ユニーク制約
- **Category**: data-integrity
- **Scenario**: 同一ユーザーが同一 full_name のリポジトリを2回挿入する
- **Expected**: 2回目の INSERT が UNIQUE 制約違反エラーになる
- **Type**: automated

### TC-006: repositories テーブルの CASCADE DELETE（users 削除時）
- **Category**: data-integrity
- **Scenario**: ユーザー U1 がリポジトリ Repo1 を持つ状態で、U1 を DELETE する
- **Expected**: Repo1 も CASCADE で削除される。関連する requests, sessions も連鎖削除される
- **Type**: automated

### TC-007: requests テーブルの CASCADE DELETE（repositories 削除時）
- **Category**: data-integrity
- **Scenario**: リポジトリ Repo1 に紐づくリクエスト R1, R2 がある状態で、Repo1 を DELETE する
- **Expected**: R1, R2 が CASCADE で削除される。関連する sessions も連鎖削除される
- **Type**: automated

### TC-008: sessions テーブルの CASCADE DELETE（requests 削除時）
- **Category**: data-integrity
- **Scenario**: リクエスト R1 に紐づくセッション S1, S2 がある状態で、R1 を DELETE する
- **Expected**: S1, S2 が CASCADE で削除される
- **Type**: automated

### TC-009: マイグレーションの冪等性（2回実行で重複なし）
- **Category**: migration
- **Scenario**: `user_sessions` にデータがある状態でマイグレーションを2回実行する
- **Expected**: 2回目の実行で重複レコードが生成されない。repositories, requests, sessions の件数が1回目と同一
- **Type**: automated

### TC-010: マイグレーションのデータ無損失（user_sessions -> 新テーブル）
- **Category**: migration
- **Scenario**: `user_sessions` に3件のレコード（2つの異なるリポジトリ）がある状態でマイグレーションを実行する
- **Expected**: repositories に2件、requests に3件、sessions に3件が作成される。元の session_id, repo, title, status が保持される
- **Type**: automated

### TC-011: マイグレーションのステータスマッピング
- **Category**: migration
- **Scenario**: `user_sessions` に status=`idle`, `active`, `archived` のレコードがそれぞれ存在する状態でマイグレーションを実行する
- **Expected**: `idle`/`active` -> sessions.status=`active` + requests.status=`in-progress`、`archived` -> sessions.status=`archived` + requests.status=`completed`
- **Type**: automated

### TC-012: createRequest の引数バリデーション（type の CHECK 制約）
- **Category**: api-contract
- **Scenario**: `createRequest(repoId, 'invalid-type', 'title', 'content')` を呼び出す
- **Expected**: CHECK 制約違反またはアプリケーション層のバリデーションエラーが発生する。リクエストは作成されない
- **Type**: automated

### TC-013: updateRequestStatus の状態遷移バリデーション
- **Category**: api-contract
- **Scenario**: status=`draft` のリクエストに対して `updateRequestStatus(id, 'completed')` を呼び出す（draft -> completed は許容されない遷移）
- **Expected**: 不正な状態遷移としてエラーがスローされる。status は `draft` のまま
- **Type**: automated

### TC-014: updateRequestStatus の terminal 状態からの遷移拒否
- **Category**: api-contract
- **Scenario**: status=`completed` のリクエストに対して `updateRequestStatus(id, 'in-progress')` を呼び出す
- **Expected**: terminal 状態からの遷移としてエラーがスローされる
- **Type**: automated

### TC-015: createRequest がリポジトリ所有権を検証する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のリポジトリ ID を指定して `createRequest` を呼び出す
- **Expected**: 所有権検証エラーがスローされ、リクエストは作成されない
- **Type**: automated

### TC-016: listRequests がリポジトリ所有権を検証する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のリポジトリ ID を指定して `listRequests` を呼び出す
- **Expected**: 所有権検証エラーがスローされ、リクエスト一覧は返らない
- **Type**: automated

### TC-017: createBoundSession がリクエストコンテキスト経由で動作する
- **Category**: api-contract
- **Scenario**: 有効なリクエスト ID と role=`implementer` を指定して `createBoundSession` を呼び出す
- **Expected**: Managed Agents API でセッションが作成され、sessions テーブルにレコードが挿入される。repo 情報はリクエストの repository から取得される
- **Type**: automated

### TC-018: createBoundSession の DB 挿入失敗時に API セッションがロールバックされる
- **Category**: data-integrity
- **Scenario**: Managed Agents API のセッション作成は成功するが、sessions テーブルへの INSERT が失敗する
- **Expected**: API セッションが archive される（ロールバック）。sessions テーブルにレコードは残らない
- **Type**: automated

## Should

### TC-019: requests テーブルの type に CHECK 制約が設定されている
- **Category**: data-integrity
- **Scenario**: DB レベルで requests.type に `new-feature`, `spec-change`, `refactoring`, `bugfix` 以外の値を INSERT する
- **Expected**: CHECK 制約違反エラーが発生する
- **Type**: automated

### TC-020: requests テーブルの status に CHECK 制約が設定されている
- **Category**: data-integrity
- **Scenario**: DB レベルで requests.status に `draft`, `in-progress`, `reviewing`, `completed`, `cancelled` 以外の値を INSERT する
- **Expected**: CHECK 制約違反エラーが発生する
- **Type**: automated

### TC-021: sessions テーブルの role に CHECK 制約が設定されている
- **Category**: data-integrity
- **Scenario**: DB レベルで sessions.role に `implementer`, `reviewer`, `fixer`, `explorer` 以外の値を INSERT する
- **Expected**: CHECK 制約違反エラーが発生する
- **Type**: automated

### TC-022: getOrCreateRepository が GitHub API アクセス権を検証する
- **Category**: security
- **Scenario**: ユーザーがアクセス権のないリポジトリ（GitHub API が 403/404 を返す）に対して `getOrCreateRepository` を呼び出す
- **Expected**: "Repository not found or not accessible" エラーが返り、repositories にレコードは作成されない
- **Type**: automated

### TC-023: getOrCreateRepository の UPSERT 動作
- **Category**: api-contract
- **Scenario**: 既に repositories に存在するリポジトリに対して `getOrCreateRepository` を再度呼び出す
- **Expected**: 重複レコードは作成されず、既存レコードが返る
- **Type**: automated

### TC-024: listRequests のページネーション
- **Category**: api-contract
- **Scenario**: リポジトリに 60 件のリクエストがある状態で `listRequests(repoId, { limit: 50, offset: 0 })` と `listRequests(repoId, { limit: 50, offset: 50 })` を呼び出す
- **Expected**: 1回目で50件、2回目で10件が返り、重複がない。created_at DESC でソートされている
- **Type**: automated

### TC-025: updateRequestStatus の正常な状態遷移（draft -> in-progress -> reviewing -> completed）
- **Category**: api-contract
- **Scenario**: リクエストを draft -> in-progress -> reviewing -> completed の順に遷移させる
- **Expected**: 各遷移が成功し、updated_at が更新される
- **Type**: automated

### TC-026: getRequestDetail が関連セッション一覧を含む
- **Category**: api-contract
- **Scenario**: リクエスト R1 に2つのセッション（role=implementer, role=reviewer）が紐づく状態で `getRequestDetail(R1.id)` を呼び出す
- **Expected**: リクエスト情報に加えて、2つのセッション情報（role, step, status, managed_session_id を含む）が返る
- **Type**: automated

### TC-027: listSessionsByRequest がリクエスト所有権を検証する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のリクエスト ID を指定して `listSessionsByRequest` を呼び出す
- **Expected**: 所有権検証エラーがスローされる
- **Type**: automated

### TC-028: refreshSessionStatus が新スキーマでセッションアクセス検証する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のセッション ID を指定して `refreshSessionStatus` を呼び出す
- **Expected**: アクセス検証エラーがスローされる
- **Type**: automated

### TC-029: archiveBoundSession が新スキーマでセッションアクセス検証する
- **Category**: security
- **Scenario**: 認証ユーザー A がユーザー B のセッション ID を指定して `archiveBoundSession` を呼び出す
- **Expected**: アクセス検証エラーがスローされる
- **Type**: automated

### TC-030: 異なるユーザーが同一リポジトリを接続できる
- **Category**: data-integrity
- **Scenario**: ユーザー A とユーザー B がそれぞれ `owner/repo` を `getOrCreateRepository` で接続する
- **Expected**: repositories に2件のレコード（user_id が異なる、full_name は同一）が作成される
- **Type**: automated

### TC-031: requests テーブルの default 値が正しく設定される
- **Category**: api-contract
- **Scenario**: `createRequest` で status を指定せずにリクエストを作成する
- **Expected**: status が `draft` で作成される。created_at, updated_at が自動設定される
- **Type**: automated

## Could

### TC-032: listUserRepositories がリクエスト件数を含む
- **Category**: api-contract
- **Scenario**: ユーザーが3つのリポジトリを持ち、それぞれ 2, 0, 5 件のリクエストがある状態で `listUserRepositories` を呼び出す
- **Expected**: 各リポジトリにリクエスト件数（2, 0, 5）が含まれる
- **Type**: automated

### TC-033: sessions テーブルの status に CHECK 制約が設定されている
- **Category**: data-integrity
- **Scenario**: DB レベルで sessions.status に `active`, `waiting`, `completed`, `archived` 以外の値を INSERT する
- **Expected**: CHECK 制約違反エラーが発生する
- **Type**: automated

### TC-034: 新テーブルの TypeScript 型が正しくエクスポートされる
- **Category**: api-contract
- **Scenario**: `schema.ts` から Repository, NewRepository, Request, NewRequest, Session, NewSession 型をインポートする
- **Expected**: 型チェックが通り、各型が期待するフィールドを持つ
- **Type**: automated

### TC-035: userSessions テーブル定義と関連型が完全に削除されている
- **Category**: migration
- **Scenario**: マイグレーション完了後のコードベースで `userSessions`, `UserSession`, `NewUserSession` を検索する
- **Expected**: schema.ts および全てのインポート箇所から削除されている
- **Type**: automated

### TC-036: updateRequestStatus の cancelled 遷移（draft -> cancelled）
- **Category**: api-contract
- **Scenario**: status=`draft` のリクエストに対して `updateRequestStatus(id, 'cancelled')` を呼び出す
- **Expected**: 遷移が成功し、status が `cancelled` に更新される
- **Type**: automated

### TC-037: sessions テーブルの default 値が正しく設定される
- **Category**: api-contract
- **Scenario**: セッション作成時に status を指定しない場合
- **Expected**: status が `active` で作成される。created_at, updated_at が自動設定される
- **Type**: automated

### TC-038: 存在しないリクエスト ID で verifyRequestOwnership を呼び出す
- **Category**: security
- **Scenario**: 存在しないリクエスト ID（例: 99999）に対して `verifyRequestOwnership` を呼び出す
- **Expected**: エラーがスローされる（「not found」相当）
- **Type**: automated
