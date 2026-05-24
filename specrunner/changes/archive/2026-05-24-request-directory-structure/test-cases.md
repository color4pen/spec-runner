# Test Cases: request をフラットファイルからディレクトリ構造に変更

## 凡例

- **Priority**: must / should / could
- **Source**: request.md 要件番号 / tasks.md タスク番号 / design.md セクション番号

---

## Category: paths.ts

### TC-PATHS-001 — draftPath() が新形式パスを返す
- **Priority**: must
- **Source**: req#1, task#1-1, design#D1

```
GIVEN  src/util/paths.ts の draftPath() を slug="my-feature" で呼ぶ
WHEN   関数が値を返す
THEN   戻り値が "specrunner/drafts/my-feature/request.md" のサフィックスを持つ
```

### TC-PATHS-002 — draftPath() がハイフン入り slug を正しく処理する
- **Priority**: should
- **Source**: task#1-1, design#D1

```
GIVEN  slug="my-long-feature-name" で draftPath() を呼ぶ
WHEN   関数が値を返す
THEN   戻り値が "specrunner/drafts/my-long-feature-name/request.md" のサフィックスを持つ
```

### TC-PATHS-003 — draftPathLegacy() が旧形式パスを返す
- **Priority**: must
- **Source**: req#7, design#D1, design#D2

```
GIVEN  src/util/paths.ts に draftPathLegacy() が存在し、slug="my-feature" で呼ぶ
WHEN   関数が値を返す
THEN   戻り値が "specrunner/drafts/my-feature.md" のサフィックスを持つ
```

---

## Category: store.ts — resolve()

### TC-ST-RESOLVE-001 — resolve() が新形式パスを返す
- **Priority**: must
- **Source**: req#3, task#2-1

```
GIVEN  store.resolve(cwd, "my-slug") を呼ぶ
WHEN   関数が値を返す
THEN   戻り値が "<cwd>/specrunner/drafts/my-slug/request.md" である
```

### TC-ST-RESOLVE-002 — resolve() はファイルシステムを参照しない（パス生成のみ）
- **Priority**: should
- **Source**: task#2-1, design#D2

```
GIVEN  drafts/ ディレクトリが存在しない cwd で store.resolve() を呼ぶ
WHEN   関数が値を返す
THEN   エラーを投げず、新形式パス文字列を返す
```

---

## Category: store.ts — resolveWithFallback()

### TC-ST-FBK-001 — 新形式ファイルが存在する場合は新形式パスを返す
- **Priority**: must
- **Source**: req#7, task#2-2, design#D2

```
GIVEN  "<cwd>/specrunner/drafts/my-slug/request.md" が存在する
WHEN   store.resolveWithFallback(cwd, "my-slug") を呼ぶ
THEN   "<cwd>/specrunner/drafts/my-slug/request.md" を返す
```

### TC-ST-FBK-002 — 旧形式フラットファイルのみ存在する場合は旧形式にフォールバック
- **Priority**: must
- **Source**: req#7, task#2-2, design#D2

```
GIVEN  "<cwd>/specrunner/drafts/my-slug.md" が存在し
       "<cwd>/specrunner/drafts/my-slug/request.md" が存在しない
WHEN   store.resolveWithFallback(cwd, "my-slug") を呼ぶ
THEN   "<cwd>/specrunner/drafts/my-slug.md" を返す
```

### TC-ST-FBK-003 — どちらも存在しない場合は新形式パスを返す（デフォルト）
- **Priority**: must
- **Source**: task#2-2, design#D2

```
GIVEN  新形式・旧形式どちらのファイルも存在しない
WHEN   store.resolveWithFallback(cwd, "my-slug") を呼ぶ
THEN   "<cwd>/specrunner/drafts/my-slug/request.md" を返す
```

### TC-ST-FBK-004 — 新形式と旧形式の両方が存在する場合は新形式を優先する
- **Priority**: must
- **Source**: req#7, design#D2

```
GIVEN  "<cwd>/specrunner/drafts/my-slug/request.md" と
       "<cwd>/specrunner/drafts/my-slug.md" の両方が存在する
WHEN   store.resolveWithFallback(cwd, "my-slug") を呼ぶ
THEN   "<cwd>/specrunner/drafts/my-slug/request.md" を返す
```

---

## Category: store.ts — list()

### TC-ST-LIST-001 — ディレクトリ内に request.md を持つ slug を列挙する
- **Priority**: must
- **Source**: req#2, task#2-3

```
GIVEN  specrunner/drafts/foo/request.md が存在する
WHEN   store.list(cwd) を呼ぶ
THEN   戻り値に "foo" が含まれる
```

### TC-ST-LIST-002 — request.md を持たないディレクトリはスキップする
- **Priority**: must
- **Source**: req#2, task#2-3, design#D3

```
GIVEN  specrunner/drafts/bar/ ディレクトリが存在するが request.md を含まない
WHEN   store.list(cwd) を呼ぶ
THEN   戻り値に "bar" が含まれない
```

### TC-ST-LIST-003 — 後方互換: フラットファイルを slug として返す
- **Priority**: must
- **Source**: req#7, task#2-3, design#D3

```
GIVEN  specrunner/drafts/legacy.md が存在し
       specrunner/drafts/legacy/ ディレクトリが存在しない
WHEN   store.list(cwd) を呼ぶ
THEN   戻り値に "legacy" が含まれる
```

### TC-ST-LIST-004 — 同名ディレクトリとフラットファイルが共存する場合は重複しない
- **Priority**: must
- **Source**: design#D3

```
GIVEN  specrunner/drafts/both/request.md と
       specrunner/drafts/both.md の両方が存在する
WHEN   store.list(cwd) を呼ぶ
THEN   "both" がリストに 1 度だけ現れる（重複なし）
```

### TC-ST-LIST-005 — ディレクトリ構造とフラットファイルの混在を正しく処理する
- **Priority**: should
- **Source**: task#7-1, design#D3

```
GIVEN  specrunner/drafts/new-style/request.md が存在し
       specrunner/drafts/old-style.md が存在する
WHEN   store.list(cwd) を呼ぶ
THEN   戻り値に "new-style" と "old-style" の両方が含まれる
```

### TC-ST-LIST-006 — drafts/ ディレクトリが存在しない場合は空配列を返す
- **Priority**: should
- **Source**: task#2-3

```
GIVEN  specrunner/drafts/ ディレクトリが存在しない cwd
WHEN   store.list(cwd) を呼ぶ
THEN   空配列 [] を返す（エラーを投げない）
```

---

## Category: store.ts — read()

### TC-ST-READ-001 — ディレクトリ内の request.md を読む
- **Priority**: must
- **Source**: req#3, task#2-4

```
GIVEN  specrunner/drafts/my-slug/request.md が有効な request 本文を持つ
WHEN   store.read(cwd, "my-slug") を呼ぶ
THEN   ParsedRequest オブジェクトが返り、slug が "my-slug" である
```

### TC-ST-READ-002 — 旧形式フラットファイルを読む（後方互換）
- **Priority**: must
- **Source**: req#7, task#2-4

```
GIVEN  specrunner/drafts/my-slug.md が有効な request 本文を持ち
       specrunner/drafts/my-slug/request.md が存在しない
WHEN   store.read(cwd, "my-slug") を呼ぶ
THEN   ParsedRequest オブジェクトが返る
```

---

## Category: store.ts — write()

### TC-ST-WRITE-001 — ディレクトリを自動作成して request.md に書き込む
- **Priority**: must
- **Source**: req#1, task#2-5

```
GIVEN  specrunner/drafts/ 配下に "new-slug" ディレクトリが存在しない
WHEN   store.write(cwd, "new-slug", "<content>") を呼ぶ
THEN   specrunner/drafts/new-slug/ ディレクトリが作成され
       specrunner/drafts/new-slug/request.md にコンテンツが書き込まれる
```

### TC-ST-WRITE-002 — 既存ディレクトリがあっても上書きできる
- **Priority**: should
- **Source**: task#2-5

```
GIVEN  specrunner/drafts/existing-slug/ ディレクトリが既に存在する
WHEN   store.write(cwd, "existing-slug", "<new content>") を呼ぶ
THEN   エラーを投げず、specrunner/drafts/existing-slug/request.md が新コンテンツになる
```

---

## Category: store.ts — checkSlugCollision()

### TC-ST-COL-001 — 新形式ディレクトリが存在する場合に衝突を検出する
- **Priority**: must
- **Source**: task#2-6, design#D4

```
GIVEN  specrunner/drafts/taken/ ディレクトリが存在する
WHEN   store.checkSlugCollision(cwd, "taken") を呼ぶ
THEN   SLUG_COLLISION エラーが投げられる
```

### TC-ST-COL-002 — 旧形式フラットファイルが存在する場合に衝突を検出する
- **Priority**: must
- **Source**: task#2-6, design#D4

```
GIVEN  specrunner/drafts/taken.md が存在する
WHEN   store.checkSlugCollision(cwd, "taken") を呼ぶ
THEN   SLUG_COLLISION エラーが投げられる
```

### TC-ST-COL-003 — どちらも存在しない場合は衝突しない
- **Priority**: must
- **Source**: task#2-6

```
GIVEN  specrunner/drafts/free/ も specrunner/drafts/free.md も存在しない
WHEN   store.checkSlugCollision(cwd, "free") を呼ぶ
THEN   エラーを投げない
```

### TC-ST-COL-004 — changes/archive/ の既存チェックが引き続き機能する
- **Priority**: should
- **Source**: design#D4

```
GIVEN  specrunner/changes/archive/archived-slug/ が存在する
WHEN   store.checkSlugCollision(cwd, "archived-slug") を呼ぶ
THEN   SLUG_COLLISION エラーが投げられる
```

---

## Category: pipeline-run.ts — CANONICAL_PATTERN

### TC-PIPELINE-001 — 新形式パスから slug を抽出する
- **Priority**: must
- **Source**: req#5, task#3, design#D6

```
GIVEN  absolutePath が "/path/to/project/specrunner/drafts/my-feature/request.md"
WHEN   PipelineRun が CANONICAL_PATTERN でマッチする
THEN   抽出された slug が "my-feature" である
```

### TC-PIPELINE-002 — ハイフン入り slug を新形式で抽出する
- **Priority**: must
- **Source**: task#7-2, design#D6

```
GIVEN  absolutePath が "/path/to/specrunner/drafts/my-long-feature/request.md"
WHEN   PipelineRun が CANONICAL_PATTERN でマッチする
THEN   抽出された slug が "my-long-feature" である
```

### TC-PIPELINE-003 — 旧形式パスから slug をフォールバック抽出する
- **Priority**: must
- **Source**: req#7, task#3, design#D6

```
GIVEN  absolutePath が "/path/to/project/specrunner/drafts/old-feature.md"
WHEN   新形式パターンでマッチしない
THEN   旧形式 CANONICAL_PATTERN_LEGACY でマッチして slug "old-feature" を抽出する
```

### TC-PIPELINE-004 — changes/active/ パスはどちらのパターンにもマッチしない
- **Priority**: must
- **Source**: task#7-2, design#D6

```
GIVEN  absolutePath が "/path/to/specrunner/changes/active/my-feature/request.md"
WHEN   新形式・旧形式の両パターンでマッチを試みる
THEN   どちらもマッチせず、非 canonical として扱われる
```

---

## Category: command-registry.ts

### TC-REG-001 — validate コマンドがディレクトリ内の request.md を対象にする
- **Priority**: must
- **Source**: req#3, task#4, design#D5

```
GIVEN  specrunner/drafts/my-slug/request.md が存在する
WHEN   command-registry の validate ハンドラが slug "my-slug" で実行される
THEN   resolveWithFallback が新形式パスを返し、ファイル存在チェックが通る
```

### TC-REG-002 — validate コマンドが旧形式フラットファイルにフォールバックする
- **Priority**: must
- **Source**: req#7, task#4, design#D5

```
GIVEN  specrunner/drafts/my-slug.md のみ存在し
       specrunner/drafts/my-slug/request.md が存在しない
WHEN   command-registry の validate ハンドラが slug "my-slug" で実行される
THEN   resolveWithFallback が旧形式パスを返し、ファイル存在チェックが通る
```

### TC-REG-003 — review コマンドがディレクトリ内の request.md を対象にする
- **Priority**: must
- **Source**: req#4, task#4, design#D5

```
GIVEN  specrunner/drafts/my-slug/request.md が存在する
WHEN   command-registry の review ハンドラが slug "my-slug" で実行される
THEN   resolveWithFallback が新形式パスを返し、処理が継続する
```

---

## Category: run.ts

### TC-RUN-001 — specrunner run が新形式 request.md でパイプラインを開始する
- **Priority**: must
- **Source**: req#5, task#5

```
GIVEN  specrunner/drafts/my-slug/request.md が存在する
WHEN   run.ts の runRunCore が slug "my-slug" で実行される
THEN   resolveWithFallback が新形式パスを返し、PipelineRun が起動する
```

### TC-RUN-002 — specrunner run が旧形式フラットファイルにフォールバックする
- **Priority**: must
- **Source**: req#7, task#5

```
GIVEN  specrunner/drafts/my-slug.md のみ存在する
WHEN   run.ts の runRunCore が slug "my-slug" で実行される
THEN   resolveWithFallback が旧形式パスを返し、PipelineRun が起動する
```

---

## Category: manager.ts

### TC-MGR-001 — manager.review() がディレクトリ内の request.md を使う
- **Priority**: must
- **Source**: task#6, design#D9

```
GIVEN  specrunner/drafts/my-slug/request.md が存在する
WHEN   manager.review(cwd, "my-slug") を呼ぶ
THEN   store.resolveWithFallback が呼ばれ、新形式パスが reviewer に渡る
```

### TC-MGR-002 — manager.resolve() がフォールバック対応になる
- **Priority**: must
- **Source**: task#6, design#D9

```
GIVEN  specrunner/drafts/my-slug.md のみ存在する
WHEN   manager.resolve(cwd, "my-slug") を呼ぶ
THEN   store.resolveWithFallback が呼ばれ、旧形式パスが返る
```

---

## Category: E2E — request new

### TC-E2E-NEW-001 — specrunner request new でディレクトリ構造が作成される
- **Priority**: must
- **Source**: req#1, task#2-5, task#7-3

```
GIVEN  specrunner/drafts/ 配下に "my-new-request" が存在しない
WHEN   specrunner request new my-new-request を実行する
THEN   specrunner/drafts/my-new-request/ ディレクトリが作成され
       specrunner/drafts/my-new-request/request.md が生成される
AND    フラットファイル specrunner/drafts/my-new-request.md は作成されない
```

### TC-E2E-NEW-002 — 作成時の標準出力/エラー出力が新パスを示す
- **Priority**: should
- **Source**: task#2-5, design#D7

```
GIVEN  specrunner request new my-new-request を実行する
WHEN   コマンドが完了する
THEN   stderr/stdout に "specrunner/drafts/my-new-request/request.md" が含まれる
```

---

## Category: E2E — request ls

### TC-E2E-LS-001 — request ls がディレクトリベースの slug を列挙する
- **Priority**: must
- **Source**: req#2

```
GIVEN  specrunner/drafts/dir-slug/request.md が存在する
WHEN   specrunner request ls を実行する
THEN   出力に "dir-slug" が含まれる
```

### TC-E2E-LS-002 — request ls が旧形式 slug を列挙する（後方互換）
- **Priority**: must
- **Source**: req#7

```
GIVEN  specrunner/drafts/flat-slug.md が存在し
       specrunner/drafts/flat-slug/ が存在しない
WHEN   specrunner request ls を実行する
THEN   出力に "flat-slug" が含まれる
```

---

## Category: E2E — request generate

### TC-E2E-GEN-001 — request generate の出力先がディレクトリ構造になる
- **Priority**: must
- **Source**: req#6, design#D8

```
GIVEN  有効な generate 入力を与えて specrunner request generate を実行する
WHEN   コマンドが完了する
THEN   生成された request.md が specrunner/drafts/<slug>/request.md に保存される
AND    specrunner/drafts/<slug>.md は作成されない
```

---

## Category: 型チェック & テスト

### TC-BUILD-001 — typecheck が green
- **Priority**: must
- **Source**: req#8 (受け入れ基準)

```
GIVEN  すべての実装変更が適用された状態
WHEN   bun run typecheck を実行する
THEN   型エラーが 0 件で正常終了する
```

### TC-BUILD-002 — テストスイートが green
- **Priority**: must
- **Source**: req#8 (受け入れ基準)

```
GIVEN  すべての実装変更とテスト更新が適用された状態
WHEN   bun run test を実行する
THEN   全テストが pass し、失敗が 0 件
```

---

## Category: 非回帰（スコープ外の不変性）

### TC-NOCHANGE-001 — changes/ 構造は変更されない
- **Priority**: must
- **Source**: req#9

```
GIVEN  specrunner/changes/<slug>/request.md が存在する
WHEN   specrunner run を実行してパイプラインがコピーを行う
THEN   コピー先は引き続き specrunner/changes/<slug>/request.md である
AND    specrunner/changes/<slug>/request.md の構造が変わらない
```

### TC-NOCHANGE-002 — rules new コマンドに影響がない
- **Priority**: should
- **Source**: request#スコープ外

```
GIVEN  specrunner rules new を実行する
WHEN   コマンドが完了する
THEN   rules の生成先パスが従来通りであり、今回の変更で壊れていない
```
