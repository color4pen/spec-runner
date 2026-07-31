# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `src/core/step/bite-evidence/test-file-selection.ts` — 新規モジュール全体
- `src/core/step/bite-evidence/gate.ts` — 変更後の全体（selectMaterializedTestFiles 組み込み、空集合 strategy-deferred 化）
- `src/core/archive/achieved-assurance.ts:1-30, 250-310` — import + floor 適用箇所
- `src/config/schema/types.ts:160-173` — `scopedTestPatterns` 型宣言
- `src/config/schema/validation.ts:260-300` — zod schema 追加部分
- `docs/configuration.md` — scopedTestPatterns セクション
- `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts` — TC-001〜005, TC-015〜020 カバー
- `src/core/step/bite-evidence/__tests__/gate-empty-selection.test.ts` — TC-009〜011, TC-014 カバー
- `src/core/step/bite-evidence/__tests__/shared-selection-imports.test.ts` — TC-021, TC-022 カバー
- `src/config/__tests__/verification-scoped-patterns.test.ts` — TC-006〜008, TC-023〜024 カバー
- `tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts` — TC-012, TC-013 カバー
- `specrunner/changes/bite-evidence-test-file-selection/verification-result.md` — 検証結果確認

### 確認した内容

**選別述語の実装（test-file-selection.ts）**
- `isExcludedPath`: `specrunner/changes/` / `.specrunner/` の2系統を除外。gate.ts から移設済み
- `matchesGlob`: `**/` → `(?:.*/)?`、単独 `*` → `[^/]*`、`**`（`/` なし）→ `.*`、`.` → `[._]`。正規表現を `^...$` でアンカー
- `resolveScopedTestPatterns`: 設定値が非空配列なら使用、そうでなければ `DEFAULT_SCOPED_TEST_PATTERNS` のコピーを返す
- `selectMaterializedTestFiles`: exclusion AND pattern-match の AND 合成

**gate.ts の変更**
- `selectMaterializedTestFiles` を shared module から import
- `isExcludedPath` は re-export のみ（後方互換）— 定義は `test-file-selection.ts` に一元化
- 空集合 → `strategy-deferred`（旧: failed）に修正済み。コメント(:13, :76 相当)も追随

**achieved-assurance.ts の変更**
- `selectMaterializedTestFiles` を同一モジュールから import、floor の tamper 対象集合を test files のみに絞り込み

**Config validation**
- `scopedTestPatterns`: `nonEmptyString` 要素の配列 + `minLength(1)` — 空配列・空文字列要素ともに CONFIG_INVALID

**テストカバレッジ（must 16件すべて確認）**
- TC-001〜005: 選別述語の単体テスト — fixture JSON / .rs / index.ts 除外、*.test.ts / *.spec.ts / *_test.ts 包含、パターン置換を固定
- TC-006〜007: CONFIG_INVALID — 空配列・非文字列要素を検証で棄却
- TC-008: 有効パターンが config に保存される
- TC-009: 空集合 → strategy-deferred（failed でない）
- TC-010〜011: red→green = passed、red→red = failed
- TC-012〜013: 非テストファイル編集は tamper でない、テストファイル編集は tamper
- TC-014: tamper mismatch は変わらず failed
- TC-021〜022: import 構造の共有を source-level で固定

**依存ガード（TC-026）**
`git diff main...HEAD -- package.json` が空 — 新規 runtime 依存なし ✓

**保護ファイル（TC-027）**
`src/core/runtime/local.ts` / `src/core/port/runtime-strategy.ts` / `.specrunner/config.json` の diff なし ✓

**Verification 結果**
build / typecheck / test（9822 passed） / lint / coverage — 全フェーズ passed ✓

## 検証できなかった項目

TC-025 は手動項目（docs レビュー）— docs/configuration.md の scopedTestPatterns セクションは存在し、デフォルトパターン・scopedTestCommand との対、置換動作、polyglot 向け override 例が記載されていることを読んで確認済み。ただし glob セマンティクスの記述に 1 件不正確な箇所あり（Findings 参照）。

## Findings 詳細

### F-001: docs/configuration.md の glob `.` セマンティクス記述が実装と乖離

`docs/configuration.md` の scopedTestPatterns セクション（229 行目）は「literal characters (including `.`) match literally」と記載する。しかし `matchesGlob` の実装では `.` パターン文字を `[._]`（ドットまたはアンダースコア）に変換する。このため `**/*.test.*` は `foo_test_ts`（ドットをアンダースコアに置換した文字列）にもマッチする。

実装の意図は `test-file-selection.ts` のコメントに正確に記述されており（`.` → `[._]` でドット記法とアンダースコア記法の両方をカバーする）、動作は仕様通りで正しい。docs 側の記述が実装の動作を正確に反映していない。

ユーザーが `**/*.test.*` のようなパターンを設定したとき、ドット区切りとアンダースコア区切りの両方を取り込む動作は設計意図であり、機能の安全側の誤り（含めすぎ）にあたる。ただし「`.` はリテラルとして働く」と信じているユーザーがアンダースコア命名のファイルを除外しようとした場合、意図と異なる挙動になる。
