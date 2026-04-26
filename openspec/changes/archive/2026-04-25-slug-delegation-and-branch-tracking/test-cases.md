# Test Cases: slug-delegation-and-branch-tracking

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration/e2e): 21
- **Manual**: 2
- **Priority**: must: 13, should: 7, could: 3

## Test Cases

### TC-001: register_branch ハンドラ — 有効な入力で DB が更新される

**Category**: integration
**Priority**: must
**Source**: design.md Decision 3, tasks.md 3.2

**GIVEN** requests テーブルに既存レコード（branch_name = null）があり、有効な `slug`（"2026-04-25-modernize-ui"）、`branch_name`（"feat/2026-04-25-modernize-ui"）、`request_id` を持つ Custom Tool Use イベントが届く
**WHEN** `handleCustomToolUse()` が `register_branch` ツールを処理する
**THEN** requests テーブルの該当レコードの `branch_name` が "feat/2026-04-25-modernize-ui" に更新され、ツール結果として成功レスポンスが返される

---

### TC-002: register_branch ハンドラ — 空の slug を拒否する

**Category**: unit
**Priority**: must
**Source**: tasks.md 3.2

**GIVEN** `slug` が空文字列（""）の入力
**WHEN** `register_branch` ハンドラがバリデーションを実行する
**THEN** エラー説明を含むツール結果が返され、DB は更新されない

---

### TC-003: register_branch ハンドラ — 空の branch_name を拒否する

**Category**: unit
**Priority**: must
**Source**: tasks.md 3.2

**GIVEN** `branch_name` が空文字列（""）の入力
**WHEN** `register_branch` ハンドラがバリデーションを実行する
**THEN** エラー説明を含むツール結果が返され、DB は更新されない

---

### TC-004: register_branch ハンドラ — kebab-case 以外の slug フォーマットを拒否する

**Category**: unit
**Priority**: must
**Source**: tasks.md 3.2（kebab-case pattern バリデーション）

**GIVEN** `slug` が "2026_04_25_modernize_ui"（アンダースコア区切り）や "Modernize UI"（スペース・大文字）などの非 kebab-case 形式
**WHEN** `register_branch` ハンドラがバリデーションを実行する
**THEN** エラー説明を含むツール結果が返され、DB は更新されない

---

### TC-005: SSE ループ — requires_action イベントを検知して Custom Tool を処理する

**Category**: integration
**Priority**: must
**Source**: design.md Decision 5, tasks.md 4.1

**GIVEN** SSE ループが `session.status_idle` イベントを受信し、`stop_reason.type === 'requires_action'` かつ `event_ids` に Custom Tool Use イベント ID が含まれる
**WHEN** stream route の SSE ループがそのイベントを処理する
**THEN** `handleCustomToolUse()` が呼び出され、ツール処理が実行され、`user.custom_tool_result` が Anthropic API に送信される

---

### TC-006: SSE ループ — requires_action 処理後にループが break しない

**Category**: integration
**Priority**: must
**Source**: design.md Decision 5, tasks.md 4.2

**GIVEN** SSE ループが `requires_action` イベントを受信し、`handleCustomToolUse()` の処理が完了する
**WHEN** ツール結果が Anthropic API に送信される
**THEN** SSE ループは break せず、次のイベントを引き続き受信できる状態を維持する（`end_turn` イベントまでループが継続する）

---

### TC-007: SSE ループ — end_turn では依然として break する

**Category**: integration
**Priority**: must
**Source**: design.md Decision 5, tasks.md 4.2（requires_action と end_turn の共存）

**GIVEN** SSE ループが `session.status_idle` イベントを受信し、`stop_reason.type === 'end_turn'` である
**WHEN** stream route の SSE ループがそのイベントを処理する
**THEN** `handleCustomToolUse()` は呼び出されず、SSE ループが break して完了処理に移行する

---

### TC-008: branch_name の DB 永続化 — register_branch 呼び出し前後の状態遷移

**Category**: integration
**Priority**: must
**Source**: design.md Decision 3, tasks.md 1.1, 3.2

**GIVEN** 新規 request レコードが作成された時点で `branch_name` が null である
**WHEN** `register_branch` ハンドラが有効な `branch_name` を受け取って DB を更新する
**THEN** requests テーブルの `branch_name` が null から指定値に変わり、以降の読み取りでその値が返される

---

### TC-009: branch_name の DB 永続化 — base_branch カラムが追加されている

**Category**: integration
**Priority**: must
**Source**: tasks.md 1.1

**GIVEN** マイグレーション後の requests テーブル
**WHEN** 新規レコードを挿入して `base_branch` カラムを読み取る
**THEN** `base_branch` カラムが存在し、値が null で返される（Phase 1 では null 固定）

---

### TC-010: 差分 URL 生成 — branch_name が DB に存在する場合に URL が組み立てられる

**Category**: unit
**Priority**: must
**Source**: tasks.md 8.1, 8.2, request.md 要件 7

**GIVEN** repository の owner が "myorg"、repo が "myrepo"、`defaultBranch` が "main"、DB の `branch_name` が "feat/2026-04-25-modernize-ui"
**WHEN** 差分 URL を組み立てる
**THEN** `https://github.com/myorg/myrepo/compare/main...feat/2026-04-25-modernize-ui` が生成される

---

### TC-011: 差分 URL 生成 — branch_name が null の場合は URL を表示しない

**Category**: unit
**Priority**: must
**Source**: tasks.md 8.1, request.md 要件 7（branch_name が DB に保存されている場合のみ表示）

**GIVEN** DB の `branch_name` が null
**WHEN** UI の差分 URL 表示ロジックを評価する
**THEN** 差分 URL リンクが表示されない（null チェックで非表示）

---

### TC-012: change folder ビューア — DB に branch_name がある場合は DB 値を使用する

**Category**: integration
**Priority**: must
**Source**: tasks.md 7.1, 7.2, request.md 受け入れ基準

**GIVEN** requests テーブルの `branch_name` が "feat/2026-04-25-modernize-ui"（slug 部分: "2026-04-25-modernize-ui"）
**WHEN** `getChangeFolderFiles()` が該当 request のファイル一覧を取得する
**THEN** `openspec/changes/2026-04-25-modernize-ui/` パスの Git ツリーが参照され、ファイル一覧が返される

---

### TC-013: change folder ビューア — DB に branch_name がない場合は決定的導出にフォールバックする

**Category**: integration
**Priority**: must
**Source**: tasks.md 7.1, design.md Decision 3（フォールバック維持）

**GIVEN** requests テーブルの `branch_name` が null、request の slug が "2026-04-25-some-feature"
**WHEN** `getChangeFolderFiles()` が該当 request のファイル一覧を取得する
**THEN** 従来の決定的導出ロジック（slug から branch_name を再構成）を使ってファイル一覧が返される

---

### TC-014: Custom Tool ディスパッチャ — 未知のツール名にエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.2

**GIVEN** `event.name` が "unknown_tool_xyz"（未登録のツール名）
**WHEN** `handleCustomToolUse()` がディスパッチを試みる
**THEN** エラー説明を含むツール結果が返され、セッションが idle 状態で停止しない（エラー応答で続行できる）

---

### TC-015: Custom Tool ディスパッチャ — ハンドラ内部エラーをツール結果に変換する

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.2

**GIVEN** `register_branch` ハンドラが DB 更新中に例外を投げる
**WHEN** `handleCustomToolUse()` がそのハンドラを呼び出す
**THEN** 例外がキャッチされ、エラー説明を含むツール結果が返され、未処理例外として上位に伝播しない

---

### TC-016: buildProposeMessage — 新シグネチャに branchName/slug パラメータが存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md 5.1, design.md Decision 4

**GIVEN** `buildProposeMessage()` を `requestId` のみで呼び出す
**WHEN** 関数を実行する
**THEN** エラーなく実行され、slug 決定とブランチ作成を指示するメッセージが生成される（`branchName` / `slug` 引数を要求しない）

---

### TC-017: buildProposeMessage — slug 生成ガイドラインが含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md 5.2

**GIVEN** `buildProposeMessage()` が `requestId` で呼び出される
**WHEN** 生成されたメッセージを検査する
**THEN** kebab-case、`YYYY-MM-DD-` プレフィックス、英語ワード由来、最大 60 文字 の slug ガイドラインが含まれ、`register_branch` ツール呼び出しが明示的に指示されている

---

### TC-018: getChangeFolderFileContent — パストラバーサルが防止される

**Category**: unit
**Priority**: should
**Source**: tasks.md 7.2（パストラバーサル検証が動的 slug でも機能する）, spec-review emphasis: パストラバーサル防止

**GIVEN** `branch_name` が DB に存在し、`filePath` として "../../../etc/passwd" などのトラバーサルパスが渡される
**WHEN** `getChangeFolderFileContent()` が処理する
**THEN** パストラバーサルエラーが返され、change folder 外のファイルが読まれない

---

### TC-019: RequestSummary — branch_name が API レスポンスに含まれる

**Category**: integration
**Priority**: should
**Source**: tasks.md 7.3

**GIVEN** requests テーブルの `branch_name` が "feat/2026-04-25-modernize-ui"
**WHEN** `getRequestDetail()` API を呼び出す
**THEN** レスポンスの `branch_name` フィールドに "feat/2026-04-25-modernize-ui" が含まれる

---

### TC-020: 差分 URL — defaultBranch が取得できない場合は "main" をフォールバックとして使用する

**Category**: unit
**Priority**: should
**Source**: tasks.md 8.2

**GIVEN** repository の `defaultBranch` が null または未設定、`branch_name` が "feat/2026-04-25-modernize-ui"
**WHEN** 差分 URL を組み立てる
**THEN** base が "main" として `https://github.com/{owner}/{repo}/compare/main...feat/2026-04-25-modernize-ui` が生成される

---

### TC-021: 差分 URL リンク — 新しいタブで開く

**Category**: manual
**Priority**: could
**Source**: tasks.md 8.1（`rel="noopener noreferrer"` + 新タブ）

**GIVEN** UI の request detail ビューで `branch_name` が存在し、差分 URL リンクが表示されている
**WHEN** リンクをクリックする
**THEN** 新しいタブで GitHub の compare ページが開き、現在のタブのナビゲーションは変化しない

---

### TC-022: requires_action イベントの SSE クライアントへの転送

**Category**: manual
**Priority**: could
**Source**: tasks.md 4.3

**GIVEN** propose セッションが実行中に `register_branch` Custom Tool を呼び出す
**WHEN** SSE クライアント（UI）がイベントストリームを受信する
**THEN** `requires_action` イベントが UI 側で受信でき、Custom Tool の処理中であることが確認できる（ログまたは UI 上の表示で確認）

---

### TC-023: DB マイグレーション — 既存レコードへの影響なし

**Category**: integration
**Priority**: could
**Source**: design.md Risks/Trade-offs（ALTER TABLE ADD COLUMN、nullable）

**GIVEN** マイグレーション前に既存の request レコードが存在する
**WHEN** `branch_name` および `base_branch` カラムを追加するマイグレーションを実行する
**THEN** 既存レコードの他カラム値が変化せず、`branch_name` と `base_branch` は null として返される。マイグレーションが冪等に実行できる（IF NOT EXISTS または同等の保護）
