## T-01: SpecIndexEntry 型と DynamicContext 拡張

- [x] `src/git/dynamic-context.ts` に `SpecIndexEntry` インターフェースを export する:
  ```typescript
  export interface SpecIndexEntry {
    capability: string;
    purpose: string;
    requirementCount: number;
  }
  ```
- [x] `DynamicContext` interface に `specIndex: SpecIndexEntry[]` フィールドを追加

**受け入れ基準**: `bun run typecheck` が pass

## T-02: collectSpecIndex の実装

- [x] `src/git/dynamic-context.ts` に `async function collectSpecIndex(cwd: string): Promise<SpecIndexEntry[]>` を実装（モジュール内 private、export 不要）
- [x] `specsDirRel()` を `src/util/paths.ts` からインポートして `path.join(cwd, specsDirRel())` でベースディレクトリを取得
- [x] `fs.readdir(specsDir, { withFileTypes: true })` でサブディレクトリを列挙
- [x] 各ディレクトリの `spec.md` を `fs.readFile` で読み取り:
  - `## Purpose` ヘッダーの次の非空行を purpose として抽出（`## ` で始まる次のヘッダーに到達したら打ち切り）
  - `### Requirement:` の出現回数を requirementCount としてカウント
- [x] ディレクトリが存在しない場合・readdir 失敗時は空配列を返す（try-catch、既存の `collectChangesList` と同じパターン）
- [x] 個別の spec.md 読み取り失敗はスキップ（そのエントリを結果に含めない）
- [x] 結果を `capability` 名で昇順ソート

**受け入れ基準**: T-07 のユニットテストで検証

## T-03: collectDynamicContext に specIndex を統合

- [x] `collectDynamicContext` の `Promise.all` に `collectSpecIndex(cwd)` を追加（4番目の並列タスク）
- [x] 返却オブジェクトに `specIndex` フィールドを追加

**受け入れ基準**: `bun run typecheck` が pass

## T-04: buildInitialMessage の引数型を DynamicContext に変更

- [x] `src/prompts/propose-system.ts` に `import type { DynamicContext } from "../git/dynamic-context.js"` を追加
- [x] `buildInitialMessage` の第4引数の型を `dynamicContext?: { changesList?: string[] }` から `dynamicContext?: DynamicContext` に変更
- [x] 既存の `dynamicContext.changesList` アクセスパスは変更不要（`DynamicContext` に `changesList` が含まれる）
- [x] 呼び出し元 `src/core/step/propose.ts` の `buildMessage` は既に `deps.dynamicContext`（型: `DynamicContext | undefined`）を渡しているため変更不要

**受け入れ基準**: `bun run typecheck` が pass。既存テスト TC-DC-005〜010 が全 pass（リグレッションなし）

## T-05: specIndex テーブルを initial message に注入

- [x] `buildInitialMessage` 内で、`dynamicContext?.specIndex` が非空（`length > 0`）の場合に Repository Context セクション内に Baseline Specs テーブルを追加:
  ```markdown
  ### Baseline Specs (specrunner/specs/)

  | Capability | Purpose | Requirements |
  |------------|---------|-------------|
  | cli-commands | Define the CLI subcommands... | 5 |
  | propose-session | Run a propose session... | 7 |
  ```
- [x] changesList セクションと specIndex セクションは独立に条件判定（片方だけ存在する場合も正しく動作）
- [x] 両方とも空の場合は Repository Context セクション自体を出力しない（既存動作を維持）

**受け入れ基準**: T-07 のユニットテストで検証

## T-06: system prompt に baseline 参照指示を追加

- [x] `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` 内、`## CRITICAL BOUNDARY (path-fence)` セクションの直後（`## 禁止事項` の直前）に以下のセクションを追加:
  ```
  ## Baseline Spec 参照

  `specrunner/specs/` 配下の baseline spec の Read は許可する（path-fence の「編集禁止」には該当しない）。
  delta spec（MODIFIED / REMOVED）を書く前に、対応する baseline spec を Read して既存 Requirement を把握すること。
  initial message に specIndex テーブルが含まれている場合は、それを手がかりに関連する baseline spec を特定する。
  ```

**受け入れ基準**: `PROPOSE_SYSTEM_PROMPT` に "Baseline Spec 参照" セクションと `specrunner/specs/` Read 許可の記述が含まれる

## T-07: テスト追加

- [x] `tests/git/dynamic-context.test.ts` に `collectSpecIndex` 関連テストを追加:
  - TC-DC-015: `specrunner/specs/` が存在しない場合に `specIndex` が空配列
  - TC-DC-016: `specrunner/specs/foo/spec.md` に Purpose と Requirement がある場合に正しい SpecIndexEntry を返す
  - TC-DC-017: spec.md が読めないディレクトリはスキップされる
  - TC-DC-018: `specIndex` が capability 名でソートされている
  - 注: `collectSpecIndex` は private 関数のため、`collectDynamicContext` 経由で `specIndex` フィールドをテストする
- [x] `tests/prompts/dynamic-context-prompts.test.ts` に specIndex 注入テストを追加:
  - TC-DC-011: specIndex が存在する場合に Baseline Specs テーブルが含まれる
  - TC-DC-012: specIndex が空の場合にテーブルが含まれない
  - TC-DC-013: DynamicContext 全体を渡した場合に changesList と specIndex の両方が処理される
  - TC-DC-014: changesList のみ・specIndex のみの場合にそれぞれのセクションだけ出力される
- [x] 既存テスト TC-DC-001〜010 が全て pass することを確認

**受け入れ基準**: `bun run test` が全 pass

## T-08: 最終検証

- [x] `bun run typecheck` が pass
- [x] `bun run test` が全 pass
