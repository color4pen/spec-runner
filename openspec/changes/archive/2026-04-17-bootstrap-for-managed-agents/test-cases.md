# Test Cases: Bootstrap for Managed Agents

## Summary

- **Total**: 39 cases
- **Automated** (unit/integration/e2e): 33
- **Manual**: 6
- **Priority**: must: 21, should: 13, could: 5

## Test Cases

---

### TC-001: bootstrap_status の CHECK 制約 — 有効値のみ受け入れる

**Category**: integration
**Priority**: must
**Source**: design.md D2, tasks.md 1.1

**GIVEN** repositories テーブルに CHECK 制約 `bootstrap_status IN ('uninitialized', 'bootstrapping', 'pr_pending', 'ready')` が定義されている
**WHEN** `bootstrap_status` に `'invalid_value'` を INSERT または UPDATE しようとする
**THEN** DB がエラーを返し、レコードは変更されない

---

### TC-002: bootstrap_status のデフォルト値

**Category**: integration
**Priority**: must
**Source**: design.md D2, tasks.md 1.1

**GIVEN** repositories テーブルに新しいレコードを INSERT する
**WHEN** `bootstrap_status` カラムを明示的に指定しない
**THEN** `bootstrap_status` が `'uninitialized'` として保存される

---

### TC-003: bootstrap_pr_url は NULL 許容

**Category**: integration
**Priority**: must
**Source**: design.md D2, tasks.md 1.1

**GIVEN** repositories テーブルに新しいレコードを INSERT する
**WHEN** `bootstrap_pr_url` を明示的に指定しない
**THEN** レコードが NULL として正常に保存される

---

### TC-004: マイグレーション — 既存レコードへのデフォルト値適用

**Category**: integration
**Priority**: must
**Source**: design.md D2 R5, tasks.md 1.2

**GIVEN** `bootstrap_status` カラムが存在しない既存の repositories テーブルにレコードがある
**WHEN** ALTER TABLE ADD COLUMN マイグレーションを実行する
**THEN** 既存レコードの `bootstrap_status` がすべて `'uninitialized'` になり、`bootstrap_pr_url` が NULL になる

---

### TC-005: マイグレーションの冪等性

**Category**: integration
**Priority**: must
**Source**: tasks.md 1.2

**GIVEN** マイグレーションを一度実行済みの状態
**WHEN** 同じマイグレーションを再度実行する（IF NOT EXISTS 付き）
**THEN** エラーにならず、既存データは変更されない

---

### TC-006: 状態遷移 — uninitialized → bootstrapping（有効）

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1

**GIVEN** `bootstrap_status` が `'uninitialized'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'bootstrapping')` を呼ぶ
**THEN** `bootstrap_status` が `'bootstrapping'` に更新される

---

### TC-007: 状態遷移 — bootstrapping → pr_pending（有効）

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1

**GIVEN** `bootstrap_status` が `'bootstrapping'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'pr_pending')` を呼ぶ
**THEN** `bootstrap_status` が `'pr_pending'` に更新される

---

### TC-008: 状態遷移 — bootstrapping → uninitialized（セッション失敗時）

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1

**GIVEN** `bootstrap_status` が `'bootstrapping'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'uninitialized')` を呼ぶ
**THEN** `bootstrap_status` が `'uninitialized'` に更新される

---

### TC-009: 状態遷移 — pr_pending → ready（PR merge 検知）

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1

**GIVEN** `bootstrap_status` が `'pr_pending'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'ready')` を呼ぶ
**THEN** `bootstrap_status` が `'ready'` に更新される

---

### TC-010: 状態遷移 — pr_pending → uninitialized（PR close 時）、pr_url クリア

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1, 2.2

**GIVEN** `bootstrap_status` が `'pr_pending'`、`bootstrap_pr_url` に URL が設定されているリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'uninitialized')` を呼ぶ
**THEN** `bootstrap_status` が `'uninitialized'` になり、`bootstrap_pr_url` が NULL にクリアされる

---

### TC-011: 状態遷移 — 不正遷移の拒否

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.2

**GIVEN** `bootstrap_status` が `'uninitialized'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'pr_pending')` を呼ぶ（uninitialized → pr_pending は許容遷移でない）
**THEN** エラーが返り、状態は変更されない

---

### TC-012: 状態遷移 — ready からの遷移拒否

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.2

**GIVEN** `bootstrap_status` が `'ready'` のリポジトリ
**WHEN** `updateBootstrapStatus(repositoryId, 'uninitialized')` を呼ぶ
**THEN** エラーが返り、状態は変更されない

---

### TC-013: updateBootstrapStatus — IDOR 防止（所有権チェック）

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 2.1（getAuthenticatedUser() 使用）

**GIVEN** 認証ユーザー A が存在し、別ユーザー B のリポジトリが存在する
**WHEN** ユーザー A が `updateBootstrapStatus(userB_repositoryId, 'bootstrapping')` を呼ぶ（userId を引数に渡さず getAuthenticatedUser() で認証）
**THEN** エラーが返り、状態は変更されない

---

### TC-014: リポジトリ登録 — 正常登録

**Category**: integration
**Priority**: must
**Source**: design.md D1, tasks.md 3.2

**GIVEN** 認証ユーザーが存在し、GitHub API で `owner/name` のリポジトリへのアクセスが確認できる
**WHEN** `registerRepository(owner, name)` を呼ぶ
**THEN** `bootstrap_status: 'uninitialized'` でリポジトリが DB に登録される

---

### TC-015: リポジトリ登録 — 重複登録の防止

**Category**: integration
**Priority**: must
**Source**: tasks.md 3.2

**GIVEN** `owner/name` のリポジトリがすでに DB に登録されている
**WHEN** 同じ `registerRepository(owner, name)` を再度呼ぶ
**THEN** エラーが返り、重複レコードは作成されない

---

### TC-016: startBootstrap — アトミック実行（全ステップ成功）

**Category**: integration
**Priority**: must
**Source**: design.md D3, tasks.md 5.1

**GIVEN** `bootstrap_status: 'uninitialized'` のリポジトリ、有効な agentId と environmentId
**WHEN** `startBootstrap(repositoryId, agentId, environmentId)` を呼ぶ
**THEN** `bootstrap_status` が `'bootstrapping'` になり、request レコード（type: 'new-feature', status: 'in-progress'）と bound session が作成され、bootstrap 指示メッセージが送信される

---

### TC-017: startBootstrap — 部分失敗時のロールバック

**Category**: integration
**Priority**: must
**Source**: design.md D3 R4, tasks.md 5.1

**GIVEN** `bootstrap_status: 'uninitialized'` のリポジトリ
**WHEN** `startBootstrap` 実行中に session 作成ステップが失敗する
**THEN** `bootstrap_status` が `'uninitialized'` に戻り、作成途中の request レコードも削除またはロールバックされる

---

### TC-018: startBootstrap — 非 uninitialized 状態からの起動拒否

**Category**: unit
**Priority**: must
**Source**: tasks.md 5.3

**GIVEN** `bootstrap_status: 'bootstrapping'` のリポジトリ
**WHEN** `startBootstrap(repositoryId, agentId, environmentId)` を呼ぶ
**THEN** エラーが返り、新規のセッション・リクエストは作成されない

---

### TC-019: startBootstrap — IDOR 防止（所有権チェック）

**Category**: unit
**Priority**: must
**Source**: tasks.md 5.3（getAuthenticatedUser() 使用）

**GIVEN** 認証ユーザー A が存在し、別ユーザー B のリポジトリが存在する
**WHEN** ユーザー A が `startBootstrap(userB_repositoryId, agentId, environmentId)` を呼ぶ
**THEN** エラーが返り、bootstrap は開始されない

---

### TC-020: createRequest — ready 以外のリポジトリで拒否

**Category**: unit
**Priority**: must
**Source**: design.md D5, tasks.md 9.1

**GIVEN** `bootstrap_status: 'uninitialized'` のリポジトリ
**WHEN** `createRequest(repositoryId, ...)` を呼ぶ
**THEN** "Repository is not ready. Bootstrap must be completed first." というエラーが返る

---

### TC-021: createRequest — ready のリポジトリでは許可

**Category**: unit
**Priority**: must
**Source**: design.md D5, tasks.md 9.1

**GIVEN** `bootstrap_status: 'ready'` のリポジトリ
**WHEN** `createRequest(repositoryId, ...)` を呼ぶ
**THEN** リクエストが正常に作成される

---

### TC-022: syncBootstrapPrStatus — PR merge 検知 → ready

**Category**: unit
**Priority**: should
**Source**: design.md D4, tasks.md 7.1

**GIVEN** `bootstrap_status: 'pr_pending'`、`bootstrap_pr_url` に有効な PR URL があるリポジトリ
**WHEN** GitHub API が `merged_at` に値を持つレスポンスを返す
**THEN** `bootstrap_status` が `'ready'` に更新される

---

### TC-023: syncBootstrapPrStatus — PR close（非 merge）→ uninitialized + URL クリア

**Category**: unit
**Priority**: should
**Source**: design.md D4, tasks.md 7.1

**GIVEN** `bootstrap_status: 'pr_pending'`、`bootstrap_pr_url` に有効な PR URL があるリポジトリ
**WHEN** GitHub API が `state === 'closed'` かつ `merged_at === null` のレスポンスを返す
**THEN** `bootstrap_status` が `'uninitialized'` になり、`bootstrap_pr_url` が NULL にクリアされる

---

### TC-024: syncBootstrapPrStatus — PR open → 変更なし

**Category**: unit
**Priority**: should
**Source**: design.md D4, tasks.md 7.1

**GIVEN** `bootstrap_status: 'pr_pending'`、`bootstrap_pr_url` に有効な PR URL があるリポジトリ
**WHEN** GitHub API が `state === 'open'` のレスポンスを返す
**THEN** `bootstrap_status` と `bootstrap_pr_url` は変更されない

---

### TC-025: syncBootstrapPrStatus — GitHub API エラー時は状態維持

**Category**: unit
**Priority**: should
**Source**: design.md D4 R3, tasks.md 7.1

**GIVEN** `bootstrap_status: 'pr_pending'` のリポジトリ
**WHEN** GitHub API が 5xx エラーを返す
**THEN** `bootstrap_status` は変更されず、エラーは呼び出し元に伝達される

---

### TC-026: setBootstrapPrUrl — 有効な PR URL の保存と pr_pending 遷移

**Category**: unit
**Priority**: should
**Source**: tasks.md 7.3

**GIVEN** `bootstrap_status: 'bootstrapping'` のリポジトリ
**WHEN** `setBootstrapPrUrl(repositoryId, 'https://github.com/owner/repo/pull/42')` を呼ぶ
**THEN** `bootstrap_pr_url` が保存され、`bootstrap_status` が `'pr_pending'` に更新される

---

### TC-027: setBootstrapPrUrl — 無効な PR URL フォーマットの拒否

**Category**: unit
**Priority**: should
**Source**: tasks.md 7.3

**GIVEN** `bootstrap_status: 'bootstrapping'` のリポジトリ
**WHEN** `setBootstrapPrUrl(repositoryId, 'https://github.com/owner/repo/issues/42')` を呼ぶ（pull でなく issues パス）
**THEN** エラーが返り、状態は変更されない

---

### TC-028: PR URL 抽出 — セッションストリームから PR URL を検出し pr_pending に遷移

**Category**: unit
**Priority**: should
**Source**: design.md D6, tasks.md 8.1

**GIVEN** bootstrap セッションのストリームイベントに `https://github.com/owner/repo/pull/123` が含まれるテキストがある
**WHEN** PR URL 検出ロジックがテキストをスキャンする
**THEN** `https://github.com/owner/repo/pull/123` が抽出され、`setBootstrapPrUrl` が呼ばれる

---

### TC-029: PR URL 抽出 — セッション完了時に PR URL 未検出の場合 uninitialized ロールバック

**Category**: unit
**Priority**: should
**Source**: design.md D6 R1, tasks.md 8.2

**GIVEN** bootstrap セッションが `'completed'` または `'archived'` になった
**WHEN** ストリームから PR URL が検出されていない
**THEN** `bootstrap_status` が `'uninitialized'` に戻り、bootstrap 用 request が `cancelled` に更新される

---

### TC-030: listUserRepositories — N+1 防止（request カウントのインライン subquery）

**Category**: integration
**Priority**: should
**Source**: tasks.md 3.3（N+1 クエリ防止）

**GIVEN** 複数のリポジトリが存在し、各リポジトリに複数のリクエストが紐づいている
**WHEN** `listUserRepositories()` を呼ぶ
**THEN** 発行される SQL クエリが 1 本のみ（インライン subquery でカウントを取得）で、リポジトリ数に比例したクエリが発行されない

---

### TC-031: listUserRepositories — bootstrap_status を含む返却データ

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.3

**GIVEN** 複数の `bootstrap_status` を持つリポジトリが DB に存在する
**WHEN** `listUserRepositories()` を呼ぶ
**THEN** 返却された各リポジトリオブジェクトに `bootstrap_status` フィールドが含まれる

---

### TC-032: searchRepositories — alreadyRegistered フラグの付与

**Category**: integration
**Priority**: should
**Source**: tasks.md 3.1

**GIVEN** リポジトリ A は DB に登録済み、リポジトリ B は未登録の状態で GitHub Search API がどちらも返す
**WHEN** `searchRepositories(query)` を呼ぶ
**THEN** リポジトリ A の結果に `alreadyRegistered: true`、リポジトリ B に `alreadyRegistered: false` が付く

---

### TC-033: searchRepositories — 空クエリの拒否

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.1

**GIVEN** 認証済みユーザーが存在する
**WHEN** `searchRepositories('')` を呼ぶ（空文字クエリ）
**THEN** バリデーションエラーが返り、GitHub API は呼ばれない

---

### TC-034: registerRepository — GitHub API で 404 / 403 の場合エラー返却

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.2

**GIVEN** 認証ユーザーが存在し、`owner/name` リポジトリへのアクセス確認で GitHub API が 404 を返す
**WHEN** `registerRepository(owner, name)` を呼ぶ
**THEN** エラーが返り、DB にレコードは作成されない

---

### TC-035: 未登録リポジトリへのアクセス — 自動登録ではなくメッセージ表示

**Category**: integration
**Priority**: should
**Source**: tasks.md 3.4

**GIVEN** `owner/name` のリポジトリが DB に登録されていない
**WHEN** `/repos/[owner]/[repo]` にアクセスする
**THEN** 自動登録は行われず、"Repository not registered" メッセージが表示される

---

### TC-036: ワークフロー実行制御 — bootstrapping 状態でも createRequest を拒否

**Category**: unit
**Priority**: should
**Source**: design.md D5, tasks.md 9.1

**GIVEN** `bootstrap_status: 'bootstrapping'` のリポジトリ
**WHEN** `createRequest(repositoryId, ...)` を呼ぶ
**THEN** エラーが返り、リクエストは作成されない

---

### TC-037: bootstrap ステータスバッジの表示

**Category**: manual
**Priority**: should
**Source**: tasks.md 4.5

**GIVEN** uninitialized / bootstrapping / pr_pending / ready の各状態のリポジトリが登録されている
**WHEN** `/repos` ページを開く
**THEN** 各リポジトリカードに対応する色のバッジが表示される（uninitialized: gray, bootstrapping: yellow/animated, pr_pending: blue, ready: green）

---

### TC-038: bootstrap 確認ダイアログ — Agent と Environment の選択

**Category**: manual
**Priority**: should
**Source**: tasks.md 6.2

**GIVEN** `bootstrap_status: 'uninitialized'` のリポジトリの workspace ページにいる
**WHEN** "Bootstrap" ボタンを押す
**THEN** Agent と Environment の選択ドロップダウンを含む確認ダイアログが表示される

---

### TC-039: listUserRepositories — ページネーション（limit/offset）

**Category**: integration
**Priority**: could
**Source**: learned-patterns（リスト API にページネーション）

**GIVEN** 多数の登録済みリポジトリが存在する
**WHEN** `listUserRepositories({ limit: 20, offset: 0 })` を呼ぶ
**THEN** 最大 20 件のみ返り、offset により次ページ取得が可能

---

### TC-040: リポジトリ登録 UI — 検索デバウンス

**Category**: manual
**Priority**: could
**Source**: tasks.md 4.2

**GIVEN** リポジトリ登録ダイアログが開いている
**WHEN** 検索テキストボックスに連続してキー入力する
**THEN** 最後のキー入力から 300ms 後にのみ API 呼び出しが行われる（連打中は API 呼び出しが発生しない）

---

### TC-041: bootstrap セッション完了後の workspace ページへのリダイレクト

**Category**: manual
**Priority**: could
**Source**: tasks.md 6.3

**GIVEN** bootstrap 確認ダイアログで Agent と Environment を選択した状態
**WHEN** 確認ボタンを押す
**THEN** `startBootstrap` が呼ばれた後、workspace ページにリダイレクトされ、SSE ストリームで bootstrap セッションの進行が確認できる

---

### TC-042: bootstrap 状態ごとの UI メッセージ表示

**Category**: manual
**Priority**: could
**Source**: tasks.md 6.4

**GIVEN** repositoryの workspace ページにアクセスする
**WHEN** `bootstrap_status` が `'bootstrapping'`, `'pr_pending'`, `'ready'` それぞれの状態のとき
**THEN** 各状態に応じた適切なメッセージ（"Bootstrapping in progress...", "PR pending review" with link, "Ready" badge）が表示される

---

### TC-043: ワークフロー実行ボタンの UI 無効化

**Category**: manual
**Priority**: could
**Source**: design.md D5, tasks.md 9.2

**GIVEN** `bootstrap_status: 'uninitialized'` のリポジトリの workspace ページにいる
**WHEN** ページをレンダリングする
**THEN** "New Request" ボタンとセッション作成コントロールが無効化された状態で表示され、説明メッセージが表示される
