# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md 要件と spec.md シナリオの対応確認
要件 1〜5 それぞれに対し、spec.md の Scenario が要件を網羅していることを確認した（計 13 シナリオ）。
選別述語・scopedTestPatterns バリデーション・空集合 deferred・floor tamper 非検出・config/docs 追随の 5 要件とシナリオが 1:1 に対応している。

### 2. gate.ts の現状コードとの照合
`src/core/step/bite-evidence/gate.ts` を実読し、request.md の「現状コードの前提」を検証した：

- **行番号 36-38**: `isExcludedPath` は `startsWith("specrunner/changes/") || startsWith(".specrunner/")` のみ — 一致。
- **行番号 154-157**: フィルタは `changedFilesResult.files.filter((f) => !isExcludedPath(f))` のみ — 一致。
- **行番号 159-165**: 空集合を `verdict: "failed"` で返す — 一致。
- **行番号 10-14（JSDoc）**: `strategy-deferred` の列挙に「no test files」と記載されている（request が「doc comment は strategy-deferred と記す」と言う通り）— 一致。
- **行番号 76 のコメント**: `5. No materialized test files → failed.` — doc と実装の乖離が実在することを確認。

### 3. achieved-assurance.ts の現状コードとの照合
`src/core/archive/achieved-assurance.ts` を実読した：

- **行番号 21**: `import { isExcludedPath, FORWARD_TYPES } from "../step/bite-evidence/gate.js"` — 一致。
- **行番号 265**: `materializedTestFiles = changedFilesResult.files.filter((f) => !isExcludedPath(f))` — 一致。
- `isExcludedPath` を `gate.js` から直接 import しているのは `achieved-assurance.ts` のみ（grep で全ソース検索済み）。

### 4. config schema と validation の現状確認
- `src/config/schema/types.ts:142-163`（`VerificationConfig`）に `scopedTestPatterns` フィールドが存在しないことを確認。
- `src/config/schema/validation.ts:264-299`（verification スキーマ）に `scopedTestPatterns` が無いことを確認。
- `coverage.include` に `array(nonEmptyString(...)).check(minLength(1, ...))` パターンが使われていることを確認（D6 の実装根拠）。

### 5. 既存テストとの衝突確認
`src/core/step/bite-evidence/__tests__/gate.test.ts` の全 TC を確認した：

- TC-003〜TC-008, TC-022, TC-030〜TC-032 が存在。
- すべての materializedTestFiles が `*.test.ts` 命名（例: `src/__tests__/feature.test.ts`）— default パターン `**/*.test.*` に一致するため、実装後も green のまま。
- **空集合 → failed の挙動を直接ピンするテストは存在しない** — design の「No existing test fixes the old empty→failed behavior」という主張は正確。

### 6. pipeline routing の確認
`src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` で確認：

- `strategy-deferred → verification`（pass-through）— 確認済み（TC-026）。
- `failed → escalation` — 確認済み（TC-026）。

### 7. 既存 floor テストの `diffPathsBetweenCommits` fake 実装確認
`tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts:238-248` を確認した。
fake の `diffPathsBetweenCommits` は `_paths: string[]` 引数を無視し、常に固定の `diffFiles` を返す実装になっている。
→ T-06 の新テストで「非テストファイルの編集が tamper にならない」ことを正しく検証するには、
  `paths` 引数を尊重する（`diffFiles` と `paths` の共通部分を返す）新しい fake が必要。
  tasks T-06 AC にも「The fake `diffPathsBetweenCommits` MUST honor its `paths` argument」と明記されているが、
  実装者が見落とした場合に緑テストが偽陽性になるリスクがある。

### 8. glob 変換ロジック D3 のコーナーケース確認
D3 で定義された `**/*.test.*`、`**/*.spec.*`、`**/*_test.*` の変換結果を手追いした：

- `**/*.test.*` → `^(?:.*/)?[^/]*\.test\.[^/]*$` — `foo.test.ts`（ルート）・`a/b/foo.test.ts`（ネスト）の双方で一致、`src/lib.rs` で不一致。
- `**/*_test.*` → `^(?:.*/)?[^/]*_test\.[^/]*$` — `mod/baz_test.ts` で一致。
- `(?:.*/)?` が複数ディレクトリを跨ぐこと（`.*` が `/` を跨ぐ）を確認。

### 9. セキュリティ検証
- `matchesGlob` へのパターン入力はローカル config ファイル由来（リモート入力ではない）。
- 非 `*` 文字のエスケープ要件が D3・T-01 に明記されている。config レベルの信頼（local ユーザーが自身の config を操作）であり許容範囲。
- `scopedTestPatterns: []`（空配列）および非文字列要素を CONFIG_INVALID として拒否することで、無効なパターンが実行時に regex コンパイルエラーを起こすリスクを事前排除している。
- OWASP Top 10 の観点: 本 CLI はローカルツールで Web 境界を持たず、適用対象のリスクカテゴリは存在しない。

### 10. docs/configuration.md の構造確認
`docs/configuration.md` の `## Verification` セクションが存在し、T-08 の追記先として適切であることを確認した。
ただし `scopedTestCommand` 自体は `configuration.md` に未記載であることを確認（後述 Observations 参照）。

## 検証できなかった項目

None — 対象の spec ファイル・実装ファイル・テストファイルはすべて確認できた。

## Findings 詳細

### [medium] T-06 で必要な path-respecting fake の見落としリスク

**ファイル**: `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts:238-248`

既存の `diffPathsBetweenCommits` fake は `paths` 引数を無視して固定の `diffFiles` を返す。
T-06 で追加する「非テストファイルの実装フェーズ編集が tamper にならない」テストが、
この fake のパターンをそのまま踏襲した場合、`materializedTestFiles` の絞り込みが
diff 呼び出しに反映されていなくても green になる（偽陽性）。

tasks T-06 AC に「The fake `diffPathsBetweenCommits` MUST honor its `paths` argument」と
明記されており、要求は仕様化されている。実装者がこの制約を守れば問題ない。

### [low] `**/*_test.*` は Go プロジェクトの `_test.go` にも一致する

**ファイル**: `specrunner/changes/bite-evidence-test-file-selection/design.md:186-191`

design.md の Risk セクションは Rust（`mod_test.rs`）を例示するが、Go も同じ `_test` suffix 慣習を持ち
（`foo_test.go` 等）こちらの方が一般的。`docs/configuration.md` に追記するリスク注記は
「Rust や Go 等、`_test` suffix を使う言語では `scopedTestPatterns` を上書きすること」と
両言語を明示する方が実際のユーザーへの誘導になる。

### [low] `scopedTestCommand` が `docs/configuration.md` 未掲載

**ファイル**: `docs/configuration.md`

T-08 では `scopedTestPatterns` の説明文に「`scopedTestCommand` と対で使う」と記載するが、
`scopedTestCommand` 自体は `configuration.md` に存在しない。本 request のスコープ外だが、
参照先が未記載のままでは docs の一貫性が損なわれる。

### [low] T-07 構造テストはソーステキスト読み取り方式（設計上の脆弱性として記録）

**ファイル**: `specrunner/changes/bite-evidence-test-file-selection/tasks.md（T-07）`

`gate.ts` / `achieved-assurance.ts` のソーステキストを正規表現で検索する方式は、
コメント変更や行再配置で意図せず壊れ得る。選別述語の共有を強制する最も直接的な手段であり
設計判断として妥当だが、テスト自体の脆弱性として記録しておく。
