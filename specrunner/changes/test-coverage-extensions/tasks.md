# Tasks: test-coverage-extensions

## T-01: 拡張子定数配列を定義し collectProjectTestFiles のフィルタを some() 判定に変更する

- [x] `src/core/verification/test-coverage.ts` の module スコープ（既存 `SKIP_DIRS` の近傍）に、
      test ファイル拡張子の定数配列を定義する。export はしない。`as const` を付与する。
  - 配列要素は次の 12 拡張子（順序は ts → js → tsx → jsx → mts → mjs の test/spec ペア）:
    `".test.ts"`, `".spec.ts"`, `".test.js"`, `".spec.js"`, `".test.tsx"`, `".spec.tsx"`,
    `".test.jsx"`, `".spec.jsx"`, `".test.mts"`, `".spec.mts"`, `".test.mjs"`, `".spec.mjs"`。
  - 命名例: `const TEST_FILE_EXTENSIONS = [...] as const;`。
- [x] `collectProjectTestFiles()` 内のファイル判定（現 `test-coverage.ts:48-51` 付近の
      `entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")`）を、定数配列に対する
      `TEST_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))` へ置き換える。
- [x] 走査ロジック（`readdir({ withFileTypes: true })` 再帰、`SKIP_DIRS` 枝刈り、存在しない/読めない
      ディレクトリで空配列を返す resilience）は変更しない。収集対象の拡張子判定のみを変更する。
- [x] `extractMustTcIds` / assertion 存在ゲート（`ASSERTION_RE`）/ `runTestCoveragePhase` の制御フローは
      変更しない。
- [x] ファイル先頭の doc comment（「checks if each TC ID appears in at least one *.test.ts / *.spec.ts file」）
      を、対応拡張子の拡大を反映した表現へ更新する（具体的な配置・依存は変えない）。
      `collectProjectTestFiles` の JSDoc（「collect all *.test.ts / *.spec.ts files」）も同様に更新する。

**Acceptance Criteria**:
- `test-coverage.ts` に test ファイル拡張子の定数配列が定義されている（要件 2 / 受け入れ基準「拡張子リストが定数として定義されている」）。
- フィルタ判定が定数配列の `some()` で行われ、inline の `endsWith` OR 連結が残っていない。
- 走査ロジック・`extractMustTcIds`・assertion ゲートに振る舞いの変化がない。

## T-02: 追加拡張子の収集を検証する unit test を追加する

- [x] `tests/unit/core/verification/test-coverage.test.ts` の `collectProjectTestFiles` describe ブロックに、
      追加 10 拡張子それぞれが収集されることを検証する test を追加する。
  - 検証対象: `.test.js` / `.spec.js` / `.test.tsx` / `.spec.tsx` / `.test.jsx` / `.spec.jsx` /
    `.test.mts` / `.spec.mts` / `.test.mjs` / `.spec.mjs`。
  - 既存ヘルパー `writeTestFile(relPath, content)` で tempDir 配下にファイルを作成し、
    `collectProjectTestFiles(tempDir)` の戻り値に当該ファイルが含まれることを `expect(...).toBe(true)` 等で検証する。
  - 各 test 関数名またはコメントに、対応する TC ID（test-cases.md で割り当てられる must TC ID）を必ず記載する。
- [x] `.test.ts` / `.spec.ts` が引き続き収集されることを検証する test を維持/追加する（後方互換）。
- [x] test/spec 拡張子でないファイル（例: `index.ts` / `component.tsx`）が収集されないことを検証する test を
      維持/追加する（false positive 防止）。
- [x] `runTestCoveragePhase` レベルで、追加拡張子（最低でも `.test.js` と `.test.tsx`）の test ファイルに
      must TC ID + assertion（`expect(`）を配置したケースが `status: "passed"` かつ `foundTcIds` に含まれることを
      検証する end-to-end な test を追加する。`writeTestCasesMd` で must TC を定義する。

**Acceptance Criteria**:
- 追加 10 拡張子すべてについて、収集対象に含まれることを検証する test ケースが存在する。
- `.test.ts` / `.spec.ts` の後方互換を検証する test ケースが存在する。
- 非 test 拡張子が収集されないことを検証する test ケースが存在する。
- 追加 test の関数名またはコメントに対応する TC ID が記載されている。

## T-03: 既存テストの無改変 green を確認する

- [x] 既存の TC-001〜TC-031 系および faithfulness gate テスト、`collectProjectTestFiles` の既存テスト
      （`.test.ts` / `.spec.ts` 収集、`node_modules` / `dist` / `.git` 除外、`dist-tests` 非除外、
      存在しないディレクトリで空配列）が無改変で green を維持することを確認する。
- [x] 拡張子集合が superset であること（既存収集対象が外れないこと）を、既存テストの pass で担保する。

**Acceptance Criteria**:
- 既存テスト群が無改変で green。
- 拡張により既存の収集挙動が回帰していない。

## T-04: 検証ゲートを green にする

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存 + 追加テスト）。
- [x] `bun run lint` が green。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- `bun run lint` が green。
