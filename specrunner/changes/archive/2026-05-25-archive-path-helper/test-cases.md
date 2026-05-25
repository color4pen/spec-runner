# Test Cases: archive-path-helper

## TC-001: archivedChangesDirRel() が正しいパスを返す

- **Category**: Unit / util/paths
- **Priority**: must
- **Source**: Task 3, 受け入れ基準「新規 helper の unit test を追加」

```
GIVEN: archivedChangesDirRel() を import した状態
WHEN:  archivedChangesDirRel() を引数なしで呼ぶ
THEN:  "specrunner/changes/archive" を返す
```

---

## TC-002: archivedChangeFolderPath() が datedSlug を結合したパスを返す

- **Category**: Unit / util/paths
- **Priority**: must
- **Source**: Task 3, 受け入れ基準「新規 helper の unit test を追加」

```
GIVEN: archivedChangeFolderPath() を import した状態
WHEN:  archivedChangeFolderPath("2026-05-20-my-change") を呼ぶ
THEN:  "specrunner/changes/archive/2026-05-20-my-change" を返す
```

---

## TC-003: archivedChangeFolderPath() の prefix が archivedChangesDirRel() と一致する

- **Category**: Unit / util/paths
- **Priority**: must
- **Source**: 設計判断「behavior change なし」、TC-034 遵守

```
GIVEN: archivedChangesDirRel() と archivedChangeFolderPath() を import した状態
WHEN:  archivedChangeFolderPath("2026-05-20-my-change") の先頭を確認する
THEN:  archivedChangesDirRel() + "/2026-05-20-my-change" と一致する
```

---

## TC-004: archivedChangeFolderPath() にハイフン多めの slug を渡せる

- **Category**: Unit / util/paths
- **Priority**: should
- **Source**: 要件「引数は `<YYYY-MM-DD>-<slug>` 形式」、slug に複数ハイフンが含まれる通常ケース

```
GIVEN: archivedChangeFolderPath() を import した状態
WHEN:  archivedChangeFolderPath("2026-05-20-archive-path-helper") を呼ぶ
THEN:  "specrunner/changes/archive/2026-05-20-archive-path-helper" を返す
```

---

## TC-005: util/paths.ts が他の src/ モジュールを import していない（TC-034 遵守）

- **Category**: Static / module boundary
- **Priority**: must
- **Source**: design.md「TC-034 遵守: util/paths.ts は他の src/ モジュールを import しない」

```
GIVEN: util/paths.ts のソースコードを参照する
WHEN:  import 文を全列挙する
THEN:  src/ 配下のモジュールへの import が 0 件である
       （node:path など標準モジュールのみ許容）
```

---

## TC-006: archivedChangesDirRel と archivedChangeFolderPath が export されている

- **Category**: Static / API surface
- **Priority**: must
- **Source**: 受け入れ基準「util/paths.ts に archivedChangeFolderPath / archivedChangesDirRel helper が export されている」

```
GIVEN: util/paths.ts のソースコードを参照する
WHEN:  export 宣言を確認する
THEN:  archivedChangesDirRel と archivedChangeFolderPath がどちらも named export されている
```

---

## TC-007: request-patterns.ts にパスリテラルが残っていない

- **Category**: Static / リテラル排除
- **Priority**: must
- **Source**: 受け入れ基準「4 箇所のリテラル直書き / inline 構築が helper 経由に置換されている」

```
GIVEN: src/context/request-patterns.ts を参照する
WHEN:  "specrunner", "changes", "archive" のリテラル連結パターンを検索する
THEN:  path.join(cwd, archivedChangesDirRel()) 形式に置換されており
       path.join(cwd, "specrunner", "changes", "archive") は残っていない
```

---

## TC-008: workflow-structure.ts にパスリテラルが残っていない

- **Category**: Static / リテラル排除
- **Priority**: must
- **Source**: 受け入れ基準「4 箇所のリテラル直書き / inline 構築が helper 経由に置換されている」

```
GIVEN: src/core/doctor/checks/repo/workflow-structure.ts を参照する
WHEN:  "specrunner", "changes" のリテラル連結パターンを検索する
THEN:  path.join(ctx.cwd, changesDirRel()) 形式に置換されており
       path.join(ctx.cwd, "specrunner", "changes") は残っていない
```

---

## TC-009: request/store.ts の ARCHIVE_SUBDIR リテラルが削除されている

- **Category**: Static / リテラル排除
- **Priority**: must
- **Source**: 受け入れ基準「4 箇所のリテラル直書き / inline 構築が helper 経由に置換されている」

```
GIVEN: src/core/request/store.ts を参照する
WHEN:  ARCHIVE_SUBDIR 定義および "specrunner", "changes", "archive" リテラルを検索する
THEN:  const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive") が削除され
       archivedChangesDirRel() への参照に置換されている
```

---

## TC-010: archive-change-folder.ts のインライン構築が helper 経由に置換されている

- **Category**: Static / リテラル排除
- **Priority**: must
- **Source**: 受け入れ基準「4 箇所のリテラル直書き / inline 構築が helper 経由に置換されている」

```
GIVEN: src/core/finish/archive-change-folder.ts を参照する
WHEN:  archivePath 構築箇所を確認する
THEN:  `${changesDirRel()}/archive/${dateStr}-${slug}` が削除され
       archivedChangeFolderPath(`${dateStr}-${slug}`) に置換されている
```

---

## TC-011: bun run typecheck が green

- **Category**: Build / 型チェック
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

```
GIVEN: 変更後のコードベースで
WHEN:  bun run typecheck を実行する
THEN:  型エラーが 0 件で終了する
```

---

## TC-012: bun run test が green（既存テスト + 新規テスト）

- **Category**: Build / テスト
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

```
GIVEN: 変更後のコードベースで
WHEN:  bun run test を実行する
THEN:  全テストが pass し、TC-001〜TC-004 に対応する新規テストケースが含まれる
```

---

## TC-013: finish 時の archive rename が同一パスで動作する（リグレッション）

- **Category**: Regression / finish
- **Priority**: must
- **Source**: 受け入れ基準「既存の archive 動作（finish 時の rename）が変わらない」

```
GIVEN: slug "my-change"、dateStr "2026-05-20" を渡す archive-change-folder のロジック
WHEN:  archivedChangeFolderPath("2026-05-20-my-change") で生成したパスを使う
THEN:  以前の `${changesDirRel()}/archive/2026-05-20-my-change` と文字列が一致する
```

---

## TC-014: doctor の changes dir 存在チェックが同一パスで動作する（リグレッション）

- **Category**: Regression / doctor
- **Priority**: must
- **Source**: 受け入れ基準「既存の archive 動作（doctor の存在チェック）が変わらない」

```
GIVEN: workflow-structure.ts の check ロジック
WHEN:  path.join(ctx.cwd, changesDirRel()) でパスを構築する
THEN:  置換前の path.join(ctx.cwd, "specrunner", "changes") と文字列が一致する
```

---

## TC-015: request store の archive lookup が同一パスで動作する（リグレッション）

- **Category**: Regression / request store
- **Priority**: must
- **Source**: 受け入れ基準「既存の archive 動作（request store の lookup）が変わらない」

```
GIVEN: store.ts の ARCHIVE_SUBDIR を参照する lookup ロジック
WHEN:  archivedChangesDirRel() に置換後に同じ cwd でパスを結合する
THEN:  置換前の path.join(cwd, "specrunner", "changes", "archive") と文字列が一致する
```

---

## TC-016: request-patterns の archiveDir が同一パスで動作する（リグレッション）

- **Category**: Regression / request-patterns
- **Priority**: must
- **Source**: 受け入れ基準「既存の archive 動作が変わらない」

```
GIVEN: request-patterns.ts の archiveDir 構築ロジック
WHEN:  path.join(cwd, archivedChangesDirRel()) を呼ぶ
THEN:  置換前の path.join(cwd, "specrunner", "changes", "archive") と文字列が一致する
```

---

## TC-017: スコープ外の CHANGES_DIR 定数値が変わっていない

- **Category**: Static / スコープ外確認
- **Priority**: should
- **Source**: スコープ外「CHANGES_DIR 定数自体の値変更（specrunner/changes のまま）」

```
GIVEN: util/paths.ts を参照する
WHEN:  CHANGES_DIR 定数の値を確認する
THEN:  "specrunner/changes" のまま変更されていない
```

---

## TC-018: archive subdir 構造が変わっていない

- **Category**: Static / スコープ外確認
- **Priority**: could
- **Source**: スコープ外「archive subdir の構造変更（archive/<YYYY-MM-DD>-<slug>/ 形式は維持）」

```
GIVEN: archivedChangeFolderPath("2026-05-20-my-change") の返り値
WHEN:  パスの構造を確認する
THEN:  "archive/<YYYY-MM-DD>-<slug>" のセグメント順が維持されている
```
