# Test Cases: add-baseline-spec-context

Generated from: request.md, design.md, tasks.md

---

## TC-DC-015: collectSpecIndex — specrunner/specs/ が存在しない場合

- **Category**: correctness
- **Priority**: must
- **Source**: T-02, 要件1

```
GIVEN specrunner/specs/ ディレクトリが存在しない tempDir
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex が空配列 ([]) を返す
AND   例外は投げない（フォールバック動作）
```

---

## TC-DC-016: collectSpecIndex — 正常な spec.md から SpecIndexEntry を生成

- **Category**: correctness
- **Priority**: must
- **Source**: T-02, 要件1, D5

```
GIVEN tempDir/specrunner/specs/foo/spec.md が以下の内容で存在する:
      "## Purpose\n\nManage foo lifecycle\n\n## Requirements\n\n### Requirement: REQ-001\n### Requirement: REQ-002"
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex が [{ capability: "foo", purpose: "Manage foo lifecycle", requirementCount: 2 }] を返す
```

---

## TC-DC-017: collectSpecIndex — spec.md が読めないディレクトリはスキップ

- **Category**: correctness
- **Priority**: must
- **Source**: T-02, 要件1

```
GIVEN tempDir/specrunner/specs/bad-cap/ が存在するが spec.md がない
AND   tempDir/specrunner/specs/good-cap/spec.md が正常に存在する
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex に "good-cap" の SpecIndexEntry だけが含まれる
AND   "bad-cap" は含まれない（スキップ）
AND   例外は投げない
```

---

## TC-DC-018: collectSpecIndex — capability 名で昇順ソート

- **Category**: correctness
- **Priority**: must
- **Source**: T-02

```
GIVEN tempDir/specrunner/specs/ 配下に "zebra-cap", "alpha-cap", "middle-cap" の 3 ディレクトリが存在する
      各ディレクトリに有効な spec.md が存在する
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex が ["alpha-cap", "middle-cap", "zebra-cap"] の順で返される
```

---

## TC-DC-019: collectSpecIndex — Purpose が存在しない spec.md は空文字列フォールバック

- **Category**: correctness
- **Priority**: should
- **Source**: T-02, D5, Risks

```
GIVEN tempDir/specrunner/specs/no-purpose/spec.md が "## Requirements\n\n### Requirement: REQ-001" のみ（Purpose セクションなし）
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex に { capability: "no-purpose", purpose: "", requirementCount: 1 } が含まれる
AND   例外は投げない
```

---

## TC-DC-020: collectSpecIndex — Requirement が 0 件の spec.md

- **Category**: correctness
- **Priority**: should
- **Source**: T-02, Risks

```
GIVEN tempDir/specrunner/specs/empty-reqs/spec.md が Purpose のみ存在し Requirement が 0 件
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex に { capability: "empty-reqs", purpose: "...", requirementCount: 0 } が含まれる
```

---

## TC-DC-021: DynamicContext 型に specIndex フィールドが存在する

- **Category**: correctness
- **Priority**: must
- **Source**: T-01, 要件2

```
GIVEN collectDynamicContext を実行した結果 ctx
WHEN  ctx の型を検査する
THEN  ctx が "specIndex" プロパティを持つ
AND   ctx.specIndex が配列である
AND   各要素が capability (string), purpose (string), requirementCount (number) を持つ
```

---

## TC-DC-011: buildInitialMessage — specIndex が非空の場合に Baseline Specs テーブルが含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T-05, 要件3

```
GIVEN dynamicContext.specIndex = [
        { capability: "cli-commands", purpose: "Define the CLI subcommands", requirementCount: 5 },
        { capability: "propose-session", purpose: "Run a propose session", requirementCount: 7 }
      ]
WHEN  buildInitialMessage("request body", "my-slug", "feat/my-slug", dynamicContext) を呼び出す
THEN  返却文字列に "Baseline Specs" が含まれる
AND   "cli-commands" が含まれる
AND   "propose-session" が含まれる
AND   "5" と "7" が含まれる（requirement 数）
AND   "Define the CLI subcommands" が含まれる（purpose）
```

---

## TC-DC-012: buildInitialMessage — specIndex が空の場合にテーブルが含まれない

- **Category**: correctness
- **Priority**: must
- **Source**: T-05, 要件3

```
GIVEN dynamicContext.specIndex = []（空配列）
AND   dynamicContext.changesList = []（空配列）
WHEN  buildInitialMessage("request body", "my-slug", "feat/my-slug", dynamicContext) を呼び出す
THEN  返却文字列に "Baseline Specs" が含まれない
AND   "Repository Context" が含まれない（既存動作を維持）
```

---

## TC-DC-013: buildInitialMessage — changesList と specIndex の両方を同時に処理できる

- **Category**: correctness
- **Priority**: must
- **Source**: T-05, 要件3

```
GIVEN dynamicContext = {
        gitLog: "abc123 feat: something",
        diffStat: "1 file changed",
        changesList: ["existing-feature"],
        specIndex: [{ capability: "foo-cap", purpose: "Foo purpose", requirementCount: 3 }]
      }
WHEN  buildInitialMessage("request body", "my-slug", "feat/my-slug", dynamicContext) を呼び出す
THEN  "existing-feature" が含まれる（changesList セクション）
AND   "foo-cap" が含まれる（specIndex テーブル）
AND   "Repository Context" が含まれる
AND   "Baseline Specs" が含まれる
```

---

## TC-DC-014: buildInitialMessage — changesList のみ・specIndex のみの独立した条件分岐

- **Category**: correctness
- **Priority**: must
- **Source**: T-05

```
[Subcase A] changesList のみ存在する場合
GIVEN dynamicContext.changesList = ["some-feature"]
AND   dynamicContext.specIndex = []
WHEN  buildInitialMessage を呼び出す
THEN  "some-feature" が含まれる
AND   "Baseline Specs" が含まれない

[Subcase B] specIndex のみ存在する場合
GIVEN dynamicContext.changesList = []
AND   dynamicContext.specIndex = [{ capability: "bar", purpose: "Bar purpose", requirementCount: 2 }]
WHEN  buildInitialMessage を呼び出す
THEN  "bar" が含まれる
AND   "Baseline Specs" が含まれる
AND   changesList セクション（既存）は出力されない
```

---

## TC-SP-001: PROPOSE_SYSTEM_PROMPT に "Baseline Spec 参照" セクションが含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T-06, 要件5

```
GIVEN PROPOSE_SYSTEM_PROMPT 文字列
WHEN  その内容を検査する
THEN  "Baseline Spec 参照" というセクション見出しが含まれる
AND   "specrunner/specs/" という文字列が含まれる
AND   "Read は許可" または Read を許可する旨の記述が含まれる
AND   "delta spec" を書く前に baseline spec を Read するよう指示する文が含まれる
```

---

## TC-SP-002: PROPOSE_SYSTEM_PROMPT — "Baseline Spec 参照" が path-fence の直後に配置される

- **Category**: architecture
- **Priority**: should
- **Source**: T-06, D4

```
GIVEN PROPOSE_SYSTEM_PROMPT 文字列
WHEN  "CRITICAL BOUNDARY (path-fence)" と "禁止事項" の位置を検査する
THEN  "Baseline Spec 参照" セクションが "CRITICAL BOUNDARY (path-fence)" の後かつ "禁止事項" の前に存在する
```

---

## TC-SP-003: PROPOSE_SYSTEM_PROMPT — specIndex テーブルへの参照指示が含まれる

- **Category**: correctness
- **Priority**: should
- **Source**: T-06

```
GIVEN PROPOSE_SYSTEM_PROMPT 文字列
WHEN  その内容を検査する
THEN  "specIndex" または "initial message" に specIndex を利用して baseline spec を特定するよう促す文が含まれる
```

---

## TC-TYPE-001: buildInitialMessage の第4引数が DynamicContext 型を受け取れる

- **Category**: correctness
- **Priority**: must
- **Source**: T-04, 要件4

```
GIVEN DynamicContext 型のオブジェクト（gitLog, diffStat, changesList, specIndex を含む）
WHEN  buildInitialMessage("body", "slug", "branch", dynamicContext) を呼び出す
THEN  型エラーなしでコンパイル・実行できる（bun run typecheck が pass）
AND   従来の partial pick ({ changesList?: string[] }) と同じフィールドへのアクセスが正しく動作する
```

---

## TC-TYPE-002: propose.ts の呼び出し元は変更不要（後方互換性）

- **Category**: correctness
- **Priority**: must
- **Source**: T-04, D3

```
GIVEN propose.ts が deps.dynamicContext（型: DynamicContext | undefined）を buildInitialMessage に渡している
WHEN  bun run typecheck を実行する
THEN  propose.ts に型エラーが発生しない
AND   既存テスト TC-DC-005〜010 が全 pass
```

---

## TC-REG-001: 既存テスト TC-DC-001〜004 がリグレッションなし

- **Category**: correctness
- **Priority**: must
- **Source**: T-07, T-08

```
GIVEN 本変更（specIndex フィールド追加）を適用した状態
WHEN  bun run test を実行する
THEN  TC-DC-001〜004（collectDynamicContext の既存テスト）が全 pass
AND   TC-DC-005〜010（buildInitialMessage / buildImplementerInitialMessage / buildCodeReviewInitialMessage）が全 pass
```

---

## TC-REG-002: bun run typecheck が全 pass

- **Category**: correctness
- **Priority**: must
- **Source**: T-08, 受け入れ基準

```
GIVEN 本変更を全て適用した状態
WHEN  bun run typecheck を実行する
THEN  型エラーが 0 件
```

---

## TC-REG-003: bun run test が全 pass

- **Category**: correctness
- **Priority**: must
- **Source**: T-08, 受け入れ基準

```
GIVEN 本変更を全て適用した状態（T-01〜T-07 完了）
WHEN  bun run test を実行する
THEN  全テストスイートが pass
AND   TC-DC-011〜018 が新規 pass
AND   既存テストにリグレッションなし
```

---

## TC-INT-001: collectSpecIndex — paths.ts の specsDirRel() を使用している

- **Category**: architecture
- **Priority**: should
- **Source**: T-02, 要件6

```
GIVEN src/git/dynamic-context.ts の実装
WHEN  specsDirRel() の利用箇所を検査する
THEN  collectSpecIndex 内で specsDirRel() を import・使用している
AND   スペックディレクトリのパスがハードコードされていない
```

---

## TC-INT-002: collectDynamicContext — specIndex が並列収集される

- **Category**: performance
- **Priority**: could
- **Source**: T-03, D2

```
GIVEN collectDynamicContext の実装
WHEN  Promise.all の引数を検査する
THEN  collectSpecIndex(cwd) が他のフィールド（gitLog, diffStat, changesList）と同じ Promise.all に含まれている
AND   直列実行になっていない
```

---

## TC-EDGE-001: collectSpecIndex — ファイルがサブディレクトリではなく直下ファイルの場合はスキップ

- **Category**: correctness
- **Priority**: should
- **Source**: T-02

```
GIVEN tempDir/specrunner/specs/ 配下に spec.md が直接置かれている（ディレクトリではない）
AND   tempDir/specrunner/specs/valid-cap/spec.md が正常に存在する
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex には "valid-cap" のみが含まれる
AND   ファイルがディレクトリとして解釈されない
```

---

## TC-EDGE-002: collectSpecIndex — specrunner/specs/ に spec.md が 1 件のみ存在する場合

- **Category**: correctness
- **Priority**: should
- **Source**: T-02

```
GIVEN tempDir/specrunner/specs/single-cap/spec.md のみ存在する
WHEN  collectDynamicContext(tempDir, "main") を呼び出す
THEN  ctx.specIndex が [{ capability: "single-cap", ... }]（1 要素の配列）を返す
```

---

## TC-EDGE-003: buildInitialMessage — dynamicContext が undefined の場合（後方互換）

- **Category**: correctness
- **Priority**: must
- **Source**: T-05, TC-DC-006 維持

```
GIVEN dynamicContext を渡さない（undefined）
WHEN  buildInitialMessage("body", "slug", "branch") を呼び出す
THEN  "Baseline Specs" が含まれない
AND   "Repository Context" が含まれない
AND   slug と branch と request body は含まれる（既存動作を維持）
```
