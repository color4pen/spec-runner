## 1. slugify 関数の修正

- [x] 1.1 `src/util/slugify.ts` line 22 の non-ASCII 除去 regex を変更する
  ```diff
  - let slug = description.replace(/[^\x00-\x7F]/g, "");
  + let slug = description.replace(/[^\x00-\x7F]+/g, " ");
  ```
  連続する non-ASCII 文字列を 1 つのスペースに置換する。後続の `[^a-z0-9]+` → `-` 変換でハイフン区切りになる。
- [x] 1.2 JSDoc コメント（line 13）を更新する: `Non-ASCII characters (including Japanese) are removed` → `Consecutive non-ASCII characters are replaced with a space (word boundary)`

**受け入れ基準**: `slugify("pipeline完了時にPR URLをstdoutに表示する")` が `"pipeline-pr-url-stdout"` を返す。

## 2. テストの追加

- [x] 2.1 `tests/unit/util/slugify.test.ts` に以下のテストケースを追加する:
  - TC-SL-007: 日本語混在 description から ASCII 部分で意味のある slug を生成する
    ```ts
    expect(slugify("pipeline完了時にPR URLをstdoutに表示する")).toBe("pipeline-pr-url-stdout");
    ```
  - TC-SL-008: slug が 50 文字以下であることを日本語混在入力で確認する
    ```ts
    const result = slugify("very-long" + "日本語".repeat(10) + "description-that-is-long-enough-to-exceed-limit");
    expect(result.length).toBeLessThanOrEqual(50);
    ```
- [x] 2.2 既存テスト TC-SL-001〜006 が全て pass することを確認する（変更不要、回帰確認のみ）

**受け入れ基準**: `bun run test` が全 pass。

## 3. 検証

- [x] 3.1 `bun run typecheck` が green
- [x] 3.2 `bun run test` が green
