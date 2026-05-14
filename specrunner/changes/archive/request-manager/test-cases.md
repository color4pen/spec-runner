# Test Cases: request-manager

Generated from: request.md / design.md / tasks.md

---

## store — ファイルシステム永続化

### TC-ST-001 resolve() が正しい絶対パスを返す
- **Category**: store
- **Priority**: must
- **Source**: REQ-4 / Task-2.2

```
GIVEN cwd="/tmp/proj", slug="my-feature"
WHEN  store.resolve(cwd, "my-feature") を呼ぶ
THEN  "/tmp/proj/specrunner/requests/active/my-feature/request.md" を返す
```

---

### TC-ST-002 list() が active request.md を持つエントリの slug 一覧を返す
- **Category**: store
- **Priority**: must
- **Source**: REQ-5 / Task-2.3

```
GIVEN active/ に "feat-a/request.md" と "feat-b/request.md" が存在する
WHEN  store.list(cwd) を呼ぶ
THEN  ["feat-a", "feat-b"] を返す（順不同）
```

---

### TC-ST-003 list() が active/ ディレクトリ不在のとき空配列を返す（throw しない）
- **Category**: store
- **Priority**: must
- **Source**: Task-2.3

```
GIVEN active/ ディレクトリが存在しない
WHEN  store.list(cwd) を呼ぶ
THEN  [] を返す
AND   例外は throw しない
```

---

### TC-ST-004 list() が request.md を持たないエントリを除外する
- **Category**: store
- **Priority**: should
- **Source**: Task-2.3

```
GIVEN active/ に "feat-a/request.md" と "feat-b/"（request.md なし）が存在する
WHEN  store.list(cwd) を呼ぶ
THEN  ["feat-a"] のみ返す
```

---

### TC-ST-005 write() が active/ 配下に request.md を書き込む
- **Category**: store
- **Priority**: must
- **Source**: REQ-11 / Task-2.5

```
GIVEN tmp ディレクトリを用意し、active/my-feature/ が存在しない
WHEN  store.write(cwd, "my-feature", content) を呼ぶ
THEN  specrunner/requests/active/my-feature/request.md が作成される
AND   ファイル内容が content と一致する
```

---

### TC-ST-006 write() が親ディレクトリを再帰的に作成する
- **Category**: store
- **Priority**: must
- **Source**: Task-2.5

```
GIVEN active/ ディレクトリ自体が存在しない
WHEN  store.write(cwd, "brand-new", content) を呼ぶ
THEN  mkdir -p で中間ディレクトリが作成され、ファイルが書き込まれる
AND   例外は throw しない
```

---

### TC-ST-007 checkSlugCollision() が active/ に同名 slug が存在するとき SLUG_COLLISION を throw する
- **Category**: store
- **Priority**: must
- **Source**: Task-2.6

```
GIVEN active/my-feature/request.md が存在する
WHEN  store.checkSlugCollision(cwd, "my-feature") を呼ぶ
THEN  SLUG_COLLISION エラーコードを持つ SpecRunnerError を throw する
```

---

### TC-ST-008 checkSlugCollision() が merged/ に同名 slug が存在するとき SLUG_COLLISION を throw する
- **Category**: store
- **Priority**: must
- **Source**: Task-2.6

```
GIVEN merged/my-feature/request.md が存在する（active/ には存在しない）
WHEN  store.checkSlugCollision(cwd, "my-feature") を呼ぶ
THEN  SLUG_COLLISION エラーコードを持つ SpecRunnerError を throw する
```

---

### TC-ST-009 checkSlugCollision() が衝突なしのとき正常終了する
- **Category**: store
- **Priority**: must
- **Source**: Task-2.6

```
GIVEN active/ にも merged/ にも "brand-new" が存在しない
WHEN  store.checkSlugCollision(cwd, "brand-new") を呼ぶ
THEN  例外を throw しない
```

---

### TC-ST-010 read() が active request.md を ParsedRequest としてパースして返す
- **Category**: store
- **Priority**: must
- **Source**: Task-2.4

```
GIVEN active/my-feature/request.md に valid な request.md が存在する
WHEN  store.read(cwd, "my-feature") を呼ぶ
THEN  ParsedRequest オブジェクトを返す
AND   slug / type / title が正しく設定されている
```

---

## reviewer — レビュー機能

### TC-RVR-001 parseReviewOutput() が approve JSON を正しくパースする
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN LLM 出力に verdict: "approve" を含む JSON が含まれる
WHEN  parseReviewOutput(text) を呼ぶ
THEN  { verdict: "approve", ... } の RequestReviewResult を返す
```

---

### TC-RVR-002 parseReviewOutput() が needs-discussion JSON をパースする
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN LLM 出力に verdict: "needs-discussion" を含む JSON が含まれる
WHEN  parseReviewOutput(text) を呼ぶ
THEN  { verdict: "needs-discussion", ... } の RequestReviewResult を返す
```

---

### TC-RVR-003 parseReviewOutput() が reject JSON をパースする
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN LLM 出力に verdict: "reject" を含む JSON が含まれる
WHEN  parseReviewOutput(text) を呼ぶ
THEN  { verdict: "reject", ... } の RequestReviewResult を返す
```

---

### TC-RVR-004 verdictToExitCode() が approve に 0 を返す
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN verdict = "approve"
WHEN  verdictToExitCode("approve") を呼ぶ
THEN  0 を返す
```

---

### TC-RVR-005 verdictToExitCode() が needs-discussion に非 0 を返す
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN verdict = "needs-discussion"
WHEN  verdictToExitCode("needs-discussion") を呼ぶ
THEN  0 以外の数値を返す
```

---

### TC-RVR-006 verdictToExitCode() が reject に非 0 を返す
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN verdict = "reject"
WHEN  verdictToExitCode("reject") を呼ぶ
THEN  0 以外の数値を返す
```

---

### TC-RVR-007 buildInitialMessage() が request content と projectContext を含むメッセージを返す
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.1

```
GIVEN requestContent = "# My Request...", projectContext = "Project context..."
WHEN  buildInitialMessage(requestContent, projectContext) を呼ぶ
THEN  両方の文字列を含む文字列を返す
```

---

### TC-RVR-008 runReview() に approve を返す mock queryFn を注入して RequestReviewResult を返す
- **Category**: reviewer
- **Priority**: must
- **Source**: REQ-13 / Task-4.2

```
GIVEN approve JSON を含む SDKResultSuccess を返す mock queryFn を用意する
WHEN  runReview(content, config, cwd, mockQueryFn) を呼ぶ
THEN  { verdict: "approve", ... } の RequestReviewResult が返る
AND   mockQueryFn が 1 回呼ばれている
```

---

### TC-RVR-009 runReview() が success でない lastResult のとき SpecRunnerError を throw する
- **Category**: reviewer
- **Priority**: must
- **Source**: Task-4.2

```
GIVEN success 以外の SDKResultMessage を返す mock queryFn を用意する
WHEN  runReview(content, config, cwd, mockQueryFn) を呼ぶ
THEN  SpecRunnerError を throw する
```

---

### TC-RVR-010 executeReview() が runReview() のラッパーとして後方互換で動作する
- **Category**: reviewer
- **Priority**: must
- **Source**: REQ-14 / Task-5.2

```
GIVEN 既存の executeReview() テストスイート（TC-RR-001〜010）が存在する
WHEN  src/core/command/request-review.ts から import して既存テストを実行する
THEN  re-export により全テストが green のまま
```

---

## generator — request 生成

### TC-GEN-001 generate() が valid な request.md を返す mock queryFn で GeneratedRequest を返す
- **Category**: generator
- **Priority**: must
- **Source**: REQ-7 / Task-7.3

```
GIVEN valid な request.md テキストを SDKResultSuccess で返す mock queryFn を用意する
AND   tmp ディレクトリを用意する
WHEN  generate("Add user authentication", cwd, config, mockQueryFn) を呼ぶ
THEN  { slug: "add-user-authentication", content: "..." } が返る
AND   store に active/<slug>/request.md が書き込まれている
```

---

### TC-GEN-002 generate() がバリデーション失敗時に SpecRunnerError を throw する（リトライなし）
- **Category**: generator
- **Priority**: must
- **Source**: REQ-10 / Task-7.3

```
GIVEN parseRequestMdContent でパース失敗するコンテンツを返す mock queryFn を用意する
WHEN  generate("some text", cwd, config, mockQueryFn) を呼ぶ
THEN  SpecRunnerError を throw する
AND   mockQueryFn は 1 回のみ呼ばれる（リトライなし）
```

---

### TC-GEN-003 generate() が slug 衝突時に SLUG_COLLISION エラーを throw する（queryFn は呼ばない）
- **Category**: generator
- **Priority**: must
- **Source**: REQ-12 / Task-7.3

```
GIVEN active/my-feature/request.md がすでに存在する
WHEN  generate("my feature", cwd, config) を呼ぶ（"my-feature" に slug 変換される）
THEN  SLUG_COLLISION エラーを throw する
AND   queryFn は呼ばれない
```

---

### TC-GEN-004 buildGeneratePrompt() が入力テキストを <input> タグで包んだプロンプトを返す
- **Category**: generator
- **Priority**: should
- **Source**: Task-7.2

```
GIVEN text = "Add logging"
WHEN  buildGeneratePrompt(text) を呼ぶ
THEN  "<input>\nAdd logging\n</input>" を含む文字列を返す
```

---

### TC-GEN-005 generate() が <generated-slug> を実際の slug に置換して保存する
- **Category**: generator
- **Priority**: must
- **Source**: Task-7.3 (f)

```
GIVEN slug フィールドに "<generated-slug>" を含む valid な request.md を返す mock queryFn を用意する
WHEN  generate("Add logging feature", cwd, config, mockQueryFn) を呼ぶ
THEN  保存された request.md 内の "<generated-slug>" が実際の slug 値（例: "add-logging-feature"）に置換されている
```

---

## manager — thin coordinator

### TC-MGR-001 create() が generator を呼んで slug を返す
- **Category**: manager
- **Priority**: must
- **Source**: REQ-16 / Task-8.2

```
GIVEN valid な request.md を返す mock queryFn を用意する
WHEN  manager.create("Add auth", cwd, config, mockQueryFn) を呼ぶ
THEN  string 型の slug が返る
AND   store に active/<slug>/request.md が存在する
```

---

### TC-MGR-002 review() がファイルパスが存在する場合そのパスで runReview() を呼ぶ
- **Category**: manager
- **Priority**: must
- **Source**: REQ-18 / Task-8.3

```
GIVEN valid な request.md ファイルが tmp dir に存在する、approve を返す mock queryFn を用意する
WHEN  manager.review("/tmp/dir/request.md", cwd, config, mockQueryFn) を呼ぶ
THEN  そのパスのファイルを読んで reviewer.runReview() が呼ばれる
AND   RequestReviewResult が返る
```

---

### TC-MGR-003 review() が slug 指定時に store から解決して runReview() を呼ぶ
- **Category**: manager
- **Priority**: must
- **Source**: REQ-18 / Task-8.3

```
GIVEN active/my-feature/request.md が存在する、approve を返す mock queryFn を用意する
WHEN  manager.review("my-feature", cwd, config, mockQueryFn) を呼ぶ
THEN  store.resolve(cwd, "my-feature") で解決したパスで reviewer.runReview() が呼ばれる
```

---

### TC-MGR-004 list() が active request の slug/type/state 一覧を返す
- **Category**: manager
- **Priority**: must
- **Source**: REQ-19 / Task-8.4

```
GIVEN active/ に new-feature タイプの "feat-a" と bug-fix タイプの "feat-b" が存在する
WHEN  manager.list(cwd) を呼ぶ
THEN  [{ slug: "feat-a", type: "new-feature", state: "active" }, { slug: "feat-b", type: "bug-fix", state: "active" }] を返す
```

---

### TC-MGR-005 list() が read 失敗の slug をスキップして残りを返す
- **Category**: manager
- **Priority**: should
- **Source**: Task-8.4

```
GIVEN active/ に valid な "feat-a/request.md" と壊れた "broken/request.md" が存在する
WHEN  manager.list(cwd) を呼ぶ
THEN  "broken" をスキップして [{ slug: "feat-a", ... }] を返す
AND   例外を throw しない
```

---

### TC-MGR-006 resolve() が store.resolve() の結果を返す
- **Category**: manager
- **Priority**: must
- **Source**: REQ-4 / Task-8.5

```
GIVEN cwd="/tmp/proj", slug="my-feature"
WHEN  manager.resolve(cwd, "my-feature") を呼ぶ
THEN  "/tmp/proj/specrunner/requests/active/my-feature/request.md" を返す
```

---

## cli-create — request create コマンド

### TC-CREATE-001 positional text で request.md が生成され slug が stdout に出力される
- **Category**: cli-create
- **Priority**: must
- **Source**: REQ-16 / 受け入れ基準

```
GIVEN valid request.md を返す mock で manager.create() が置換されている
WHEN  executeCreate("Add user auth", { stdin: false, cwd }) を呼ぶ
THEN  stdout に slug が改行付きで出力される
AND   0 が返る
```

---

### TC-CREATE-002 --stdin フラグで stdin からテキストを受け取れる
- **Category**: cli-create
- **Priority**: must
- **Source**: REQ-17 / 受け入れ基準

```
GIVEN stdin に "Add logging\n" が流れてくる
WHEN  executeCreate(null, { stdin: true, cwd }) を呼ぶ
THEN  stdin テキストを使って manager.create() が呼ばれる
AND   0 が返る
```

---

### TC-CREATE-003 text と --stdin が両方指定された場合、positional text を優先する
- **Category**: cli-create
- **Priority**: must
- **Source**: Task-9.1 (REQ-CLI-RC-02)

```
GIVEN text="positional text", stdin=true
WHEN  executeCreate("positional text", { stdin: true, cwd }) を呼ぶ
THEN  stdin を読まず "positional text" で manager.create() が呼ばれる
```

---

### TC-CREATE-004 text も --stdin もない場合、エラーを stderr に出力して 1 を返す
- **Category**: cli-create
- **Priority**: must
- **Source**: Task-9.1 (c)

```
GIVEN text=null, stdin=false
WHEN  executeCreate(null, { stdin: false, cwd }) を呼ぶ
THEN  stderr に "テキスト引数（\"<text>\"）または --stdin フラグが必要です" を出力する
AND   1 が返る
```

---

### TC-CREATE-005 SpecRunnerError 発生時に message と hint を stderr に出力して 1 を返す
- **Category**: cli-create
- **Priority**: must
- **Source**: Task-9.1 (f)

```
GIVEN manager.create() が SLUG_COLLISION SpecRunnerError を throw するようにモックする
WHEN  executeCreate("text", { stdin: false, cwd }) を呼ぶ
THEN  stderr に "Error: ...\nHint: ..." を出力する
AND   1 が返る
```

---

## cli-list — request list コマンド

### TC-LIST-001 active request がある場合、ヘッダー付き一覧を stdout に出力して 0 を返す
- **Category**: cli-list
- **Priority**: must
- **Source**: REQ-19 / 受け入れ基準

```
GIVEN active/ に 2 件の request.md が存在する
WHEN  executeList(cwd) を呼ぶ
THEN  stdout に "SLUG ... TYPE ... STATE" ヘッダー行とエントリ行が出力される
AND   0 が返る
```

---

### TC-LIST-002 active request がない場合、"(no active requests)" を出力して 0 を返す
- **Category**: cli-list
- **Priority**: must
- **Source**: Task-9.2 (b)

```
GIVEN active/ が空またはディレクトリが存在しない
WHEN  executeList(cwd) を呼ぶ
THEN  stdout に "(no active requests)\n" が出力される
AND   0 が返る
```

---

### TC-LIST-003 出力が固定幅フォーマット（SLUG: 24 文字、TYPE: 14 文字）に準拠する
- **Category**: cli-list
- **Priority**: should
- **Source**: Task-9.2 (c)

```
GIVEN manager.list() が [{ slug: "my-feat", type: "new-feature", state: "active" }] を返す
WHEN  executeList(cwd) を呼ぶ
THEN  出力行の SLUG フィールドが 24 文字幅で左揃え、TYPE フィールドが 14 文字幅で左揃えになっている
```

---

## cli-review — request review コマンド（slug 対応）

### TC-REVIEW-001 slug 指定で store から解決して executeReview() を呼ぶ
- **Category**: cli-review
- **Priority**: must
- **Source**: REQ-18 / 受け入れ基準

```
GIVEN active/my-feature/request.md が存在する
WHEN  command-registry の review handler に "my-feature"（slug）を渡す
THEN  storeResolve(cwd, "my-feature") で解決したパスで executeReview() が呼ばれる
```

---

### TC-REVIEW-002 ファイルパス指定でそのまま executeReview() を呼ぶ（後方互換）
- **Category**: cli-review
- **Priority**: must
- **Source**: REQ-18 / Task-11.2

```
GIVEN /path/to/request.md が実在するファイルとして存在する
WHEN  command-registry の review handler に "/path/to/request.md" を渡す
THEN  slug 解決せず、そのパスで executeReview() が呼ばれる
```

---

### TC-REVIEW-003 slug もファイルも存在しない場合、エラーを stderr に出力して exit 1 する
- **Category**: cli-review
- **Priority**: must
- **Source**: design.md Error Handling / Task-11.2

```
GIVEN "nonexistent" というファイルも active slug も存在しない
WHEN  command-registry の review handler に "nonexistent" を渡す
THEN  stderr に "is neither a file nor an active request slug" を出力する
AND   process.exit(1) が呼ばれる
```

---

## cli-run — run コマンド（slug 対応）

### TC-RUN-001 slug 指定で active request.md のパスに解決して pipeline を実行する
- **Category**: cli-run
- **Priority**: must
- **Source**: REQ-20 / 受け入れ基準

```
GIVEN active/my-feature/request.md が存在する
WHEN  runRunCore("my-feature", { cwd }) を呼ぶ
THEN  storeResolve(cwd, "my-feature") で解決した絶対パスで既存 pipeline フローが実行される
```

---

### TC-RUN-002 ファイルパス指定で後方互換で動作する
- **Category**: cli-run
- **Priority**: must
- **Source**: REQ-21 / 受け入れ基準

```
GIVEN "specrunner/changes/my-feat/request.md" がファイルとして存在する
WHEN  runRunCore("specrunner/changes/my-feat/request.md", { cwd }) を呼ぶ
THEN  slug 解決せず、そのパスで既存 preflight + pipeline フローが実行される
```

---

### TC-RUN-003 ファイルも active slug も存在しない場合、エラーを stderr に出力して 1 を返す
- **Category**: cli-run
- **Priority**: must
- **Source**: design.md Error Handling / Task-10.4

```
GIVEN "nonexistent" がファイルとしても active slug としても存在しない
WHEN  runRunCore("nonexistent", { cwd }) を呼ぶ
THEN  stderr に "'nonexistent' is neither a file path nor an active request slug." を出力する
AND   stderr に "Hint: Use 'specrunner request list' to see available slugs." を出力する
AND   1 が返る
```

---

### TC-RUN-004 同名ファイルが存在する場合はファイルを優先する（後方互換）
- **Category**: cli-run
- **Priority**: must
- **Source**: REQ-21 / Task-10.4

```
GIVEN "my-feature" というパスがファイルとして存在し、かつ active/my-feature/request.md も存在する
WHEN  runRunCore("my-feature", { cwd }) を呼ぶ
THEN  slug 解決を行わず "my-feature" ファイルパスを直接使用する
```

---

## types — 型定義・re-export

### TC-TYPES-001 src/parser/request-md.ts の ParsedRequest re-export が既存 import を通す
- **Category**: types
- **Priority**: must
- **Source**: REQ-1 / Task-1.2

```
GIVEN 13 ファイルが src/parser/request-md.ts から ParsedRequest を import している
WHEN  bun run typecheck を実行する
THEN  型エラーが発生しない（re-export により透過的）
```

---

### TC-TYPES-002 src/util/slugify.ts の checkSlugCollision re-export が既存 import を通す
- **Category**: types
- **Priority**: must
- **Source**: Task-3.1

```
GIVEN 既存コードが src/util/slugify.ts から checkSlugCollision を import している
WHEN  bun run typecheck を実行する
THEN  型エラーが発生しない（re-export により透過的）
```

---

### TC-TYPES-003 RequestState 型が "active" | "merged" のみを受け付ける
- **Category**: types
- **Priority**: must
- **Source**: REQ-1

```
GIVEN src/core/request/types.ts に RequestState = "active" | "merged" が定義されている
WHEN  "canceled" を RequestState に代入するコードを typecheck する
THEN  型エラーが発生する
```

---

## integration — 受け入れ基準の統合確認

### TC-INT-001 bun run typecheck が green
- **Category**: integration
- **Priority**: must
- **Source**: 受け入れ基準 / Task-14.1

```
GIVEN すべての実装タスク（Task 1〜11）が完了している
WHEN  bun run typecheck を実行する
THEN  型エラーが 0 件
```

---

### TC-INT-002 bun run test が green
- **Category**: integration
- **Priority**: must
- **Source**: 受け入れ基準 / Task-14.2

```
GIVEN すべての実装タスクとテスト（Task 13）が完了している
WHEN  bun run test を実行する
THEN  全テストが pass する
```

---

### TC-INT-003 specrunner request create → list → run の end-to-end フロー
- **Category**: integration
- **Priority**: should
- **Source**: 受け入れ基準 全項目

```
GIVEN specrunner CLI が正常にビルドされている
WHEN  (1) specrunner request create "Add user authentication" を実行して slug を取得する
AND   (2) specrunner request list を実行する
AND   (3) specrunner run <slug> を実行する
THEN  (1) active/<slug>/request.md が作成され、slug が stdout に出力される
AND   (2) 一覧に <slug> が含まれる
AND   (3) pipeline が起動する（ファイルが解決できている）
```
