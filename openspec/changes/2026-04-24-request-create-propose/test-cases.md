# Test Cases: Request Create + Propose セッション機能

## Summary

- **Total**: 42 cases
- **Automated** (unit/integration/e2e): 40
- **Manual**: 2
- **Priority**: must: 23, should: 15, could: 4

## Test Cases

---

### TC-001: enabled カラムが requests テーブルに存在する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-1.1, design.md Decision 3

**GIVEN** Drizzle マイグレーション適用済みの DB
**WHEN** requests テーブルのスキーマを確認する
**THEN** `enabled` カラムが TEXT 型・nullable で存在する

---

### TC-002: 既存 request レコードが enabled=null でも取得できる

**Category**: integration
**Priority**: must
**Source**: tasks.md T-1.4, design.md Migration Plan

**GIVEN** enabled カラム追加前に作成された request レコードが DB に存在する
**WHEN** そのレコードを SELECT する
**THEN** enabled が null で返り、エラーが発生しない（後方互換）

---

### TC-003: sessions.role に 'propose' が追加されている

**Category**: integration
**Priority**: must
**Source**: tasks.md T-1.2, proposal.md What Changes

**GIVEN** Drizzle マイグレーション適用済みの DB
**WHEN** role='propose' で session レコードを INSERT する
**THEN** 挿入に成功し、CHECK 制約違反が発生しない

---

### TC-004: 既存 role 値（bootstrap 等）が sessions テーブルで引き続き有効

**Category**: integration
**Priority**: should
**Source**: tasks.md T-9.7, design.md Migration Plan

**GIVEN** role enum に 'propose' を追加した後の DB
**WHEN** 既存の role 値（例: 'bootstrap'）で session レコードを SELECT / INSERT する
**THEN** 操作が正常に完了し、既存レコードのデータが破損していない

---

### TC-005: createRequest() が enabled 配列を JSON 文字列として DB に保存する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-2.3, design.md Decision 3

**GIVEN** 有効な enabled 配列 `["test-case-generator", "adr"]` を含む引数
**WHEN** `createRequest({ type, title, content, enabled: ["test-case-generator", "adr"] })` を呼ぶ
**THEN** DB の enabled カラムに `'["test-case-generator","adr"]'`（JSON 文字列）が保存される

---

### TC-006: createRequest() が enabled=null（未指定）でも保存できる

**Category**: integration
**Priority**: must
**Source**: tasks.md T-2.1, design.md Decision 3

**GIVEN** enabled を含まない引数 `{ type, title, content }`
**WHEN** `createRequest({ type, title, content })` を呼ぶ
**THEN** request レコードが正常に作成され、enabled カラムが null になる

---

### TC-007: createRequest() が不正な enabled 値を拒否する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-2.2, design.md Decision 3

**GIVEN** 不正な enabled 値 `["unknown-option"]` を含む引数
**WHEN** `createRequest()` のバリデーションロジックを実行する
**THEN** エラーが返り（または throw され）、DB への保存が行われない

---

### TC-008: createRequest() の戻り値に enabled フィールドが含まれる

**Category**: integration
**Priority**: should
**Source**: tasks.md T-2.4, T-2.5

**GIVEN** enabled 配列を含む引数で request 作成
**WHEN** `createRequest()` が成功した場合
**THEN** 戻り値の `RequestSummary` に `enabled: string | null` が含まれる

---

### TC-009: createRequest() の引数がオブジェクト形式に変更されても既存呼び出し元が動作する

**Category**: integration
**Priority**: should
**Source**: tasks.md T-2.1（call sites の更新）

**GIVEN** createRequest() をオブジェクト引数形式にリファクタ済み
**WHEN** 既存の呼び出しコードがすべてオブジェクト形式に更新された状態でテストを実行する
**THEN** コンパイルエラーなし、既存のテストがすべて pass する

---

### TC-010: request 作成フォームに enabled マルチセレクトが表示される

**Category**: manual
**Priority**: must
**Source**: tasks.md T-3.1, request.md 受け入れ基準

**GIVEN** workspace UI を開いている
**WHEN** request 作成フォームを表示する
**THEN** type・タイトル・本文・enabled の4項目が表示され、enabled がチェックボックスグループで選択可能

---

### TC-011: enabled チェックボックスで選択した値が createRequest() に渡される

**Category**: integration
**Priority**: must
**Source**: tasks.md T-3.3, request.md 受け入れ基準

**GIVEN** フォームで enabled に "test-case-generator" と "adr" を選択した状態
**WHEN** フォームを送信する
**THEN** `createRequest()` が `enabled: ["test-case-generator", "adr"]` を引数として呼び出される

---

### TC-012: enabled 未選択（空配列）でフォーム送信が成功する

**Category**: integration
**Priority**: should
**Source**: tasks.md T-3.3, design.md Decision 3（enabled は nullable）

**GIVEN** フォームで enabled を何も選択しない状態
**WHEN** フォームを送信する
**THEN** request が正常に作成され、enabled が null または空配列として保存される

---

### TC-013: ENABLED_OPTIONS 定数に正しい選択肢が定義されている

**Category**: unit
**Priority**: should
**Source**: tasks.md T-3.4, request.md 要件1

**GIVEN** `ENABLED_OPTIONS` 定数
**WHEN** 内容を検査する
**THEN** test-case-generator, adr, module-architect, security-reviewer, pattern-reviewer の5オプションがすべて含まれる

---

### TC-014: startPropose() が draft 状態の request に対して正常に起動する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-4.4, design.md Decision 1

**GIVEN** status='draft' の request が DB に存在し、Vault・Anthropic API がモック済み
**WHEN** `startPropose(requestId, agentId, environmentId)` を呼ぶ
**THEN** request status が 'in-progress' に遷移し、role='propose' の session が作成され、メッセージが送信される

---

### TC-015: startPropose() が他ユーザーの request に対してエラーを返す

**Category**: integration
**Priority**: must
**Source**: tasks.md T-4.4（ownership verification）, design.md Decision 7

**GIVEN** 別ユーザーが所有する request
**WHEN** `startPropose()` を呼ぶ
**THEN** IDOR 防止のため認可エラーが返り、セッションは作成されない

---

### TC-016: startPropose() が draft 以外の request に対してエラーを返す

**Category**: integration
**Priority**: should
**Source**: tasks.md T-4.4（draft status check）

**GIVEN** status='in-progress' の request
**WHEN** `startPropose()` を呼ぶ
**THEN** エラーが返り、二重起動が防止される

---

### TC-017: ブランチ名生成が type prefix を正しくマッピングする

**Category**: unit
**Priority**: must
**Source**: tasks.md T-4.2, design.md Decision 2

**GIVEN** type と slug の組み合わせ: new-feature + "2026-04-24-my-feature", spec-change + "2026-04-24-foo", refactoring + "2026-04-24-bar", bugfix + "2026-04-24-baz"
**WHEN** ブランチ名生成関数を呼ぶ
**THEN** それぞれ "feat/2026-04-24-my-feature", "change/2026-04-24-foo", "refactor/2026-04-24-bar", "fix/2026-04-24-baz" が返る

---

### TC-018: buildProposeMessage() の出力にブランチ名・リクエスト内容・enabled が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-4.3

**GIVEN** branchName="feat/2026-04-24-test", request content, enabled=["test-case-generator"]
**WHEN** `buildProposeMessage()` を呼ぶ
**THEN** 返り値の文字列にブランチ名・request の title/content・enabled オプションがすべて含まれる

---

### TC-019: startPropose() がセッション作成失敗時に request status をロールバックする

**Category**: integration
**Priority**: should
**Source**: tasks.md T-4.5, design.md Decision 1（ロールバック検証済み）

**GIVEN** request status が 'draft'、createBoundSession() がエラーを返すようにモック
**WHEN** `startPropose()` を呼ぶ
**THEN** request status が 'draft' に戻り、不完全な session レコードが残らない

---

### TC-020: startPropose() がメッセージ送信失敗時にセッションをキャンセルしてロールバックする

**Category**: integration
**Priority**: should
**Source**: tasks.md T-4.5, design.md Risk（再試行可能な状態を維持）

**GIVEN** createBoundSession() 成功、sendMessage() がエラーを返すようにモック
**WHEN** `startPropose()` を呼ぶ
**THEN** 作成済み session がキャンセル状態になり、request status が 'draft' に戻る

---

### TC-021: handleProposeCompleted() が propose セッション完了時に session status を completed にする

**Category**: integration
**Priority**: must
**Source**: tasks.md T-5.1, T-5.2

**GIVEN** status='running' の propose session
**WHEN** `handleProposeCompleted()` を呼ぶ
**THEN** session status が 'completed' に更新される

---

### TC-022: propose 完了後に request status が in-progress のまま維持される

**Category**: integration
**Priority**: must
**Source**: tasks.md T-5.4, design.md Decision 4

**GIVEN** status='in-progress' の request に紐づく propose session が完了
**WHEN** `handleProposeCompleted()` を呼ぶ
**THEN** request status が 'in-progress' のまま変わらない（'reviewing' に遷移しない）

---

### TC-023: propose 完了時に PR が作成されない

**Category**: integration
**Priority**: must
**Source**: tasks.md T-5.3, design.md Decision 4

**GIVEN** propose session 完了、GitHub API モック済み
**WHEN** `handleProposeCompleted()` を呼ぶ
**THEN** GitHub PR 作成 API（POST /repos/.../pulls）が呼ばれない

---

### TC-024: propose 完了時にブランチが存在しない場合も request status を変えない

**Category**: integration
**Priority**: should
**Source**: tasks.md T-5.2, design.md Risk（再試行可能な状態を維持）

**GIVEN** propose session 完了、ブランチが GitHub 上に存在しない（getBranchExists() が false）
**WHEN** `handleProposeCompleted()` を呼ぶ
**THEN** request status が変わらず、エラーを throw せず処理が完了する

---

### TC-025: session-completion-handler に propose case が追加されている

**Category**: integration
**Priority**: must
**Source**: tasks.md T-5.1, proposal.md What Changes

**GIVEN** role='propose' の session 完了イベント
**WHEN** `handleSessionCompleted()` のスイッチ分岐を通過する
**THEN** `handleProposeCompleted()` が呼び出される（bootstrap ハンドラは呼ばれない）

---

### TC-026: getDirectoryContents() が正常にファイル一覧を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md T-6.1, T-6.2

**GIVEN** GitHub Contents API が `openspec/changes/{slug}/` のファイル一覧 JSON をモックで返す
**WHEN** `getDirectoryContents(token, owner, repo, path, ref)` を呼ぶ
**THEN** `[{name, path, type, size}]` の配列が返る

---

### TC-027: getDirectoryContents() が 404 の場合に空配列を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md T-6.2, design.md Risk（propose 未完了時のビューア動作）

**GIVEN** GitHub Contents API が 404 を返すようにモック
**WHEN** `getDirectoryContents()` を呼ぶ
**THEN** 空配列 `[]` が返り、例外が throw されない

---

### TC-028: getFileContent() が Base64 デコードされたファイル内容を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md T-6.3, T-6.4

**GIVEN** GitHub Contents API が Base64 エンコードされたファイル内容をモックで返す
**WHEN** `getFileContent(token, owner, repo, path, ref)` を呼ぶ
**THEN** デコードされた文字列（元の markdown テキスト）が返る

---

### TC-029: getFileContent() が 404 の場合に null を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md T-6.4

**GIVEN** GitHub Contents API が 404 を返すようにモック
**WHEN** `getFileContent()` を呼ぶ
**THEN** null が返り、例外が throw されない

---

### TC-030: getChangeFolderFiles() が change folder パスでディレクトリ内容を取得する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-7.2

**GIVEN** request の slug と branch が確定している
**WHEN** `getChangeFolderFiles()` を呼ぶ
**THEN** `getDirectoryContents()` が `openspec/changes/{slug}/` パスと対応ブランチ名で呼ばれる

---

### TC-031: "View Change Folder" ボタンが propose 完了済み request にのみ表示される

**Category**: manual
**Priority**: must
**Source**: tasks.md T-7.1, design.md Decision 4

**GIVEN** propose session が completed の request 詳細ページを表示している
**WHEN** UI を確認する
**THEN** "View Change Folder" ボタンまたはタブが表示されている

**GIVEN** propose session が未完了（running / 未起動）の request 詳細ページ
**WHEN** UI を確認する
**THEN** "View Change Folder" ボタン/タブが表示されない

---

### TC-032: change folder viewer でファイルをクリックするとコンテンツが表示される

**Category**: integration
**Priority**: should
**Source**: tasks.md T-7.4, T-7.5, T-7.6

**GIVEN** change folder viewer が開いていて、ファイルツリーに proposal.md が表示されている
**WHEN** proposal.md をクリックする
**THEN** `getChangeFolderFileContent()` が呼ばれ、ファイル内容がコンテンツペインに表示される

---

### TC-033: "Start Propose" ボタンが draft かつリポジトリ bootstrap 済みの request にのみ表示される

**Category**: integration
**Priority**: must
**Source**: tasks.md T-8.1

**GIVEN** status='draft' の request かつリポジトリが bootstrap 済み
**WHEN** request 詳細ビューを参照する
**THEN** "Start Propose" ボタンが表示される

**GIVEN** status='in-progress' の request
**WHEN** request 詳細ビューを参照する
**THEN** "Start Propose" ボタンが表示されない

---

### TC-034: "Start Propose" ボタン押下で startPropose() が呼ばれ SSE ストリームが接続される

**Category**: integration
**Priority**: must
**Source**: tasks.md T-8.2, T-8.3

**GIVEN** draft request の詳細ビューで "Start Propose" ボタンが表示されている
**WHEN** ボタンを押下する
**THEN** `startPropose()` が呼ばれ、その後 `connectStream()` で propose session の SSE ストリームが接続される

---

### TC-035: propose session が sessions リストに role='propose' バッジ付きで表示される

**Category**: integration
**Priority**: should
**Source**: tasks.md T-8.4

**GIVEN** role='propose' の session が DB に存在する
**WHEN** sessions リストを表示する
**THEN** 'propose' ロールバッジが表示される

---

### TC-036: フォーム送信からセッション起動・change folder 閲覧までの一連のフロー

**Category**: e2e
**Priority**: could
**Source**: request.md 受け入れ基準（全項目）

**GIVEN** リポジトリ bootstrap 済みの workspace で request 作成フォームを開く
**WHEN** type・タイトル・本文・enabled を入力してフォームを送信し、propose セッションが完了するまで待つ
**THEN** change folder viewer で proposal.md, design.md, tasks.md が閲覧できる

---

### TC-037: セッション状態（running / idle / terminated）が UI に表示される

**Category**: integration
**Priority**: should
**Source**: request.md 受け入れ基準

**GIVEN** 各 status（running, idle, terminated）の session レコード
**WHEN** セッション詳細ビューを表示する
**THEN** 各 status に対応するラベルが UI に表示される

---

### TC-038: enabled JSON 文字列のパース失敗時に安全にフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md Trade-off（DB レベルでの制約がなく不正な JSON が入る可能性）

**GIVEN** DB の enabled カラムに不正な JSON 文字列（例: `"[broken"`）が格納されている
**WHEN** request を取得して enabled を参照する
**THEN** エラーを throw せず null または空配列として扱われる

---

### TC-039: slug 生成が YYYY-MM-DD-{kebab-case-title} 形式になる

**Category**: unit
**Priority**: should
**Source**: design.md Decision 2, request.md 要件8

**GIVEN** date="2026-04-24", title="My Feature Request"
**WHEN** slug 生成関数を呼ぶ
**THEN** "2026-04-24-my-feature-request" が返る

---

### TC-040: propose セッション起動から完了検知までの状態遷移が正しい順序で進む

**Category**: integration
**Priority**: could
**Source**: design.md Decision 1, proposal.md Capabilities（propose-session）

**GIVEN** startPropose() でセッションを起動、SSE ストリームが接続済み
**WHEN** セッション完了イベントが SSE で届く
**THEN** session status が 'completed' に更新され、request status が 'in-progress' のまま維持される

---

### TC-041: getChangeFolderFileContent() が Server Action として呼び出せる

**Category**: integration
**Priority**: could
**Source**: tasks.md T-7.3

**GIVEN** 'use server' ディレクティブ付きの `getChangeFolderFileContent()` が定義されている
**WHEN** クライアントコンポーネントから Server Action として呼ぶ
**THEN** 指定ファイルのコンテンツ文字列または null が返る

---

### TC-042: rate limit（GitHub API 429）時にエラーが呼び出し元に伝播する

**Category**: integration
**Priority**: could
**Source**: design.md Risk（GitHub Contents API の rate limit）

**GIVEN** GitHub Contents API が 429 Too Many Requests を返すようにモック
**WHEN** `getFileContent()` または `getDirectoryContents()` を呼ぶ
**THEN** 適切なエラーが呼び出し元に返り、UI 側で処理できる形になっている
