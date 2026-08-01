# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コードベース照合

**write-scope.ts (lines 33–74)**
- `GUARDED_WRITE_STEPS` = `{ implementer, build-fixer, code-fixer, test-materialize, adr-gen }` — request 記載と一致。
- `protectedCanonPaths(slug)` が返す 6 パスの構造を確認。scope-bypass シナリオで `findWriteScopeViolations` が正しくヒットする構造になっている。

**commit-push.ts (lines 106–158, 570–652)**
- `getWorktreeChangedPaths` は `["status", "--porcelain", "-z", "--no-renames"]` を実行する（`--untracked-files` フラグなし）。git の default `normal` モードはサブディレクトリを 1 エントリに折りたたむため、48k ファイルのツリーが ~1 エントリになる事実を確認 — D5 の根拠が正しい。
- 現在の guarded 分岐シーケンス: status → add → diff --cached --quiet → commit → rev-parse → rev-list → push。除外・量ガードはどちらも git 呼び出しを追加しない（T-05 の制約が現行コードの構造と整合している）。
- `findWriteScopeViolations` (line 586) が `git add` (line 604) より前に実行される — D3「除外より先に scope 検査」の現行実装上の根拠が正しい。
- `changedPaths.length === 0` の fail-closed check (line 627) は T-05 で `stagePaths.length === 0` に切り替える旨が明記されており、実装上の不整合が生じないことを確認。

**errors.ts**
- `makeCommitFailHalt` (step-halt.ts line 336) は `err.code` を保持する → `STAGING_LIMIT_EXCEEDED` が typed halt として surface される経路を確認。
- `writeScopeViolationError` の shape（hint + message、SpecRunnerError コンストラクタ）を確認 — `stagingLimitExceededError` が模倣すべき雛形が明確。

**glob 実装 3 種の照合**
- `matchesGlob` (test-file-selection.ts:51–84): `**/` → `(?:.*/)?`, `**` → `.*`, `*` → `[^/]*`, literal はエスケープ。
- `globMatch` (util/glob-match.ts): `**/` → `(?:.+/)?`（`.+` は 1 文字以上必要、`.*` との差異あり）、`?` サポートあり。
- `matchGlob` (reviewers/glob-match.ts): placeholder 方式で `**/ → (.*/)?`、`? → [^/]`。
- 3 実装は微妙に異なる。D2「`matchesGlob` 移設のみ、3 統合は out-of-scope」は現実的かつリスク最小化の判断として妥当。

**config/schema**
- `PipelineConfig` に `maxRetries` / `fast` のみ（types.ts:236–247）— 新規フィールド追加が必要なことを確認。
- `scopedTestPatterns` の validation パターン（validation.ts:271–276）: `array(nonEmptyString(...)).check(minLength(1, ...))` — T-08 の実装ガイドが既存実装と一致。
- `pollIntervalMs` の positive-int パターン（validation.ts:195–200）: `number().check(int(...), gte(1, ...))` — `maxStagedFiles` の実装ガイドとして正しい。

### シナリオ検証

**除外シナリオ** (spec.md 要件 1)
- `["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"]` で `.cargo-tmp/foo/bar`、`vendor/a/b` を照合: `matchesGlob` の regex 変換でいずれも正しくマッチすることを手動トレース確認。
- 未設定時は `applyStagingExclusions(paths, []) === paths` が成立（空パターンで何も除外されない）。

**scope 迂回封じシナリオ** (spec.md 要件 2)
- `stagingExcludePatterns: ["specrunner/changes/**"]` 設定下で `specrunner/changes/<slug>/design.md` 変更 → `findWriteScopeViolations` はフル `changedPaths` に対して実行される（除外適用前）→ 違反を検出して halt — D3 の実装手順が論理的に正しい。

**量ガードシナリオ** (spec.md 要件 3)
- `--untracked-files=all` による per-file 列挙 → `stagePaths.length` が実ファイル数を反映 → `> maxStagedFiles` で throw → `git add` 前に halt（git add が subcommands に含まれない）— D4・D5 の連携が正しい。
- `summarizeTopDirectories` は `stagePaths` に対して計算（除外後、git add 前）— halt メッセージが正確な情報を提供する。

**合成シナリオ** (spec.md 要件 3、シナリオ 3)
- 除外で `stagePaths.length ≤ maxStagedFiles` になれば量ガードは発火しない。`applyStagingExclusions` → `length` チェックの順序が正しい。

**config validation** (spec.md 要件 4)
- `stagingExcludePatterns: []` → `minLength(1)` で CONFIG_INVALID。
- 空文字列要素 → `nonEmptyString` で CONFIG_INVALID。
- `maxStagedFiles: 0` → `gte(1)` で CONFIG_INVALID。
- 省略 → validation 通過（runtime で default 適用）。

### セキュリティ観点

- **write-scope bypass 不可**: D3 が構造的に保証。除外パターンが canon path にマッチしても "stage されない" だけで "検査されない" にはならない。
- **fail-closed**: 量ガードは commit 前（git add 前）に halt する。git index に何も書かれないため unwind 不要。
- **config が信頼境界内**: `stagingExcludePatterns` は operator（repo owner）が設定するもので、外部入力ではない。最悪の悪用シナリオ（パターンで成果物を意図的に除外）は既存の git 権限モデルより弱い攻撃でない。
- **依存なし**: 既存 `matchesGlob` の再利用で glob ライブラリを追加しない。正規表現インジェクションは `matchesGlob` がリテラル文字をエスケープするため成立しない。
- **ARG_MAX**: default 2000 で pathspec はおよそ 100 KB — safe。limit 引き上げは operator 明示操作。

### docs/configuration.md 確認

- `## Pipeline` セクション（line 361）、`forbiddenSurfaces` の "Array replacement on deep-merge" 注記（line 409）を確認 — T-10 が追加するドキュメントの構造上の置き場として適切。

## 検証できなかった項目

- **実際の `bun run typecheck && test` 実行**: 実装はまだ存在しないため（`staging-containment.ts` 未作成、`getWorktreeChangedPaths` 未変更）、型検査・テスト実行の green を現時点では確認できない。これは T-11 の実装後にのみ確認可能。
- **T-06 / T-07 / T-09 のテストコードの実際の動作**: テスト仕様は tasks.md に記述されているが、テストファイル自体はまだ存在しない。

## Findings 詳細

### F-001: `summarizeTopDirectories` の第 1 セグメント集計は nested artifact dir で診断精度が下がる（informational）

**spec.md** 要件 3 および **tasks.md T-02**: `summarizeTopDirectories` は「最初のパスセグメント（最初の `/` より前）」でグループ化する。

例: `backend/node_modules/foo`、`backend/node_modules/bar` は `backend` にグループされ、`node_modules` は表示されない。  
対象インシデント（`.cargo-tmp/` が repo root 直下）では問題ないが、ネストした artifact ツリーでは出口案内の `dir` 欄が artifact 名でなく親ディレクトリ名になる。

**影響**: エスカレーションメッセージの可読性が落ちる可能性がある。ただし総件数は正確に表示され、operator は出口（stagingExcludePatterns / .gitignore）を案内される。設計の意図（"top contributors by count" ビュー）の範囲内であり、動作の誤りではない。

**提案**: 将来の改善余地として残す（blocking でない）。本仕様は approve で進んでよい。

**種別**: `informational`
