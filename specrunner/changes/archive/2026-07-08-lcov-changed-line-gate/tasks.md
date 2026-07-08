# Tasks: verification 変更行実行検証（lcov changed-line gate）

> 依存順:
> T-01（config）→ T-02..T-05（純粋コア: lcov / changed-lines / evaluator / orchestrator）→ T-06（runner 配線）。
> T-07（TC-ID 厳密化）は独立。T-08（docs）は独立。T-09（テスト）は該当実装後。
> 実装は `node:fs/promises` / `node:path` / `node:child_process`（`bun:*` / `Bun.*` は禁止）と既存 `util/glob-match.ts` を用い、外部依存を追加しない。

## T-01: `verification.coverage` config を schema に追加する

- [x] `src/config/schema.ts` に `CoverageConfig` interface を追加する:
  - `command: ShellCommand`（coverage 付きテスト実行コマンド）
  - `lcovPath: string`（cwd 相対の lcov 出力パス）
  - `include: string[]`（検証対象 surface glob、必須・非空）
  - `exclude?: string[]`（除外 glob、任意）
  - `minChangedLineCoverage?: number`（0〜1 の強化閾値、任意）
- [x] `VerificationConfig` に `coverage?: CoverageConfig` を追加する（既存 `commands?` は保持）。
- [x] `configSchema` の `verification` object に `coverage` optional object の zod validation を追加する:
  - `command`: 既存 `shellCommandSchema` を再利用。
  - `lcovPath`: 必須・非空 string（`minLength(1)`）。
  - `include`: 必須・非空 array（要素は非空 string、`array(...).check(minLength(1))` 相当で空配列を拒否）。
  - `exclude`: optional array（要素は非空 string）。
  - `minChangedLineCoverage`: optional number、範囲 0〜1（`gte(0)` / `lte(1)`）。
  - エラーメッセージは既存 schema の書式（`"must be a non-empty string."` / `"must be an array."`）に揃える。
- [x] `RawConfig.verification` は既に `unknown` passthrough のため型追加は不要（確認のみ）。

**Acceptance Criteria**:
- `SpecRunnerConfig["verification"]["coverage"]` に型安全にアクセスできる。
- well-formed な coverage config が validation を通過し、`include` 欠落 / `include` 空配列 / `lcovPath` 欠落 が validation エラーになる。
- 既存 config validation テストが green。`typecheck` が green。

## T-02: lcov 最小パーサ `lcov.ts` を追加する

- [x] `src/core/verification/lcov.ts`（新規）に `parseLcov(text: string): Map<string, Map<number, number>>` を追加する。
  - `SF:<path>` でファイルセクション開始、`DA:<line>,<count>` を `Map<line, count>` に蓄積、`end_of_record` でセクション確定。
  - `FN` / `BRDA` / `LF` / `LH` 等の他レコードは無視する。
  - 同一 line に複数 DA があれば count は最大値（または加算方針を 1 つ選び固定）。
- [x] SF パス正規化ヘルパを追加する（cwd を受け、絶対で cwd 配下ならプレフィクス除去、先頭 `./` 除去 → repo-root 相対 POSIX）。返す Map のキーは正規化済みパスにする。
- [x] 依存追加なし（`node:*` のみ）。

**Acceptance Criteria**:
- `SF`/`DA` を含む lcov テキストから `{ file → { line → count } }` を返す。
- SF が絶対パス（cwd 配下）/ `./` 付き / 相対 のいずれでも、同一の repo-root 相対キーに正規化される（各入力を個別テストで固定）。
- 空文字列 / `SF` 不在 → 空 Map。`typecheck` が green。

## T-03: 変更行導出 `changed-lines.ts` を追加する

- [x] `src/core/verification/changed-lines.ts`（新規）に純関数 `parseUnifiedDiffChangedLines(diffText: string): Set<number>` を追加する。
  - hunk ヘッダ `@@ -a,b +c,d @@` の HEAD 側 `+c,d` から `[c, c+d-1]` を収集。`,d` 省略時は 1 行、`d=0`（純削除）は行を追加しない。
- [x] 薄い git spawn ラッパ `getChangedFilesAndLines({ cwd, baseBranch, spawn })` を追加する:
  - 対象ファイル: `git diff --name-only --diff-filter=d <baseBranch>...HEAD`（削除除外）。
  - 各ファイルの変更行: `git diff --unified=0 <baseBranch>...HEAD -- <file>` → `parseUnifiedDiffChangedLines`。
  - 返り値は `Map<string, Set<number>>`（キーは repo-root 相対 POSIX、git 出力そのまま）。
  - `baseBranch` 未指定時は `"main"` を既定にする。
  - git 実行は runner と同じく `node:child_process.spawn` を直接使う（`checkPackageJsonScriptsIntegrity` と同じ前例）。spawn は差し替え可能に引数注入しテスト可能にする。

**Acceptance Criteria**:
- `parseUnifiedDiffChangedLines` が「追加のみ `+c,d`」「`,d` 省略の 1 行」「`d=0` の純削除（行なし）」「複数 hunk」の各 diff fixture で正しい行集合を返す（純関数を直接テスト）。
- `typecheck` が green。

## T-04: 判定コア `evaluateChangedLineCoverage`（純関数）を追加する

- [x] `src/core/verification/changed-line-coverage.ts`（新規）に純関数を追加する:
  `evaluateChangedLineCoverage(input: { lcov: Map<string, Map<number, number>>; changedLinesByFile: Map<string, Set<number>>; include: string[]; exclude?: string[]; minChangedLineCoverage?: number }): { status: "passed" | "failed"; failedFiles: { file: string; reason: "not-loaded" | "unexecuted" }[]; skippedFiles: string[]; stdout: string }`
- [x] 各変更ファイル `f`（`changedLinesByFile` のキー）について決定表（design D3）を適用する:
  - `include` 不一致 or `exclude` 一致 → `skippedFiles` に入れて対象外。
  - 対象内で `lcov` に `f` の `SF` が無い → `failedFiles`（reason `not-loaded`）。
  - lcov にあり、変更 DA 行（`f` の変更行 ∩ lcov DA 行）が空 → pass。
  - 変更 DA 行があり、実行された変更 DA 行（count > 0）の割合が閾値未満 → `failedFiles`（reason `unexecuted`）。既定閾値は「実行 >= 1」、`minChangedLineCoverage` 指定時は `executed / changedDa >= 閾値`（design D10）。
- [x] glob 照合は `src/util/glob-match.ts` の `globMatch` を再利用する。
- [x] `stdout` は human-readable にし、fail 時は失敗ファイルを reason 付きで列挙する。

**Acceptance Criteria**:
- fixture の lcov + 変更集合で以下が固定される（純関数を直接テスト、`typecheck && test` green）:
  - 変更ファイルの DA 行が全て未実行 → failed + 失敗ファイル列挙
  - 変更 DA 行が 1 行でも実行 → passed
  - 変更行に DA 無し → passed
  - lcov 不在ファイル → failed
  - `exclude` 宣言ファイル → 対象外（fail 原因にならない）
  - `include` 外ファイル → 対象外

## T-05: ゲート orchestrator `runChangedLineCoverageGate` を追加する

- [x] `src/core/verification/changed-line-coverage.ts` に orchestration 関数
  `runChangedLineCoverageGate({ slug, cwd, coverage, baseBranch, spawn }): Promise<PhaseResult>` を追加する:
  1. `coverage.command` を実行する（`commands.ts` の `spawnCommand` を再利用、`sh -c` + node_modules/.bin PATH）。
  2. exit code 非 0 → `PhaseResult { phase: "changed-line-coverage", status: "failed", ... }`（stdout/stderr を載せる）。
  3. `coverage.lcovPath`（cwd 相対）を読む。不在・空・パース不能 → failed。
  4. `getChangedFilesAndLines` で変更行、`parseLcov` で lcov（SF は cwd 正規化）を得る。
  5. `evaluateChangedLineCoverage` を呼び、fail なら status failed + 失敗ファイル列挙、pass なら passed の `PhaseResult` を返す。
- [x] phase 名は `"changed-line-coverage"`。`PhaseResult` の `exitCode` は passed=0 / failed=1 とする（既存 test-coverage phase の慣習に合わせる）。

**Acceptance Criteria**:
- coverage コマンド exit 非 0 → failed（テストで固定）。
- コマンド成功だが lcov 不生成 → failed（テストで固定）。
- lcov あり + 突合結果に応じて passed/failed を返す。
- `typecheck` が green。

## T-06: runner の commands path / phases path にゲートを配線する

- [x] `src/core/verification/runner.ts` の `runVerification` から、`verificationConfig?.coverage` と `baseBranch` を `runVerificationCommands` / `runVerificationPhases` の両方へ引き渡す（既存 signature `runVerification(slug, cwd, verificationConfig?, baseBranch?)` は不変）。
- [x] 両 path で、主検証ループの**後**にゲートを配置する:
  - `coverage` 宣言なし → phase を追加しない。代わりに verification-result.md に「changed-line coverage gate: skipped（`verification.coverage` 未設定）」の note を出す（`writeVerificationResult` の verdict 直下、既存「passed with skips」note と同じ領域。`## Phase:` セクションは増やさない）。
  - `coverage` 宣言あり + 先行が failed（fail-fast）→ `changed-line-coverage` phase を status `skipped` で push（他 phase の fail-fast skip と同様）。
  - `coverage` 宣言あり + 先行が全 passed → `runChangedLineCoverageGate` を実行し、返った `PhaseResult` を `phases` に push する（verdict 集約より前に push）。
- [x] verdict 集約（`some(status==="failed")`）はゲート phase を含めて計算されること（push 後に集約）。

**Acceptance Criteria**:
- coverage 宣言時、phases path / commands path の**両方**で `changed-line-coverage` phase が実行され verdict に反映される（テストで固定）。
- coverage 未宣言時、`phases.length`・verdict・`## Phase:` セクション数が coverage 導入前と同一で、skip note が verification-result.md に含まれる。
- 既存の `tests/unit/core/verification/runner.test.ts` / `tests/unit/verification/runner-commands.test.ts` が**無変更で green**。

## T-07: TC-ID 照合を substring から ID 境界の厳密一致に修正する

- [x] `src/core/verification/test-coverage.ts` の found 判定（`:208` `text.includes(tcId)`）を ID 境界の厳密一致に変える:
  - `tcId` の前が英数字でなく、後が数字でも `-数字` でもない位置でのみマッチ（`TC-1` が `TC-10` / `TC-1-2` に誤マッチしない）。
- [x] assertionless 判定（`:222` の `text.includes(tcId)`）にも同じ厳密一致を適用する。
- [x] 既存の assertionless ヒューリスティック（`expect(|assert(|assert.`）の振る舞いは変えない（照合の厳密化のみ）。found / assertionless / missing の他ロジックは維持する。

**Acceptance Criteria**:
- `TC-1`（must）で、テストに `TC-10` はあるが `TC-1` 単独が無いとき missing になる（テストで固定）。
- `TC-1` が境界付きで存在するとき found になる。
- 既存の `tests/unit/core/verification/test-coverage.test.ts` が green（既存 ID は `TC-001` 等で誤マッチに依存しないため無変更で通る想定。通らない箇所があれば厳密化に沿って最小修正）。

## T-08: docs/configuration.md に verification.coverage を追記する

- [x] `docs/configuration.md` の verification セクションに `verification.coverage` の説明を追加する:
  - フィールド（`command` / `lcovPath` / `include` 必須 / `exclude` / `minChangedLineCoverage`）と JSON 例。
  - 決定表の要点（lcov 不在 = fail-closed / 変更 DA 無し = pass / 実行ゼロ = fail / 対象は include−exclude）。
  - commands path / phases path 両対応、未宣言なら skip（既存挙動不変）。
  - 正当な例外は `exclude` で宣言、残余は escalation → 人の判断 → resume で扱う旨。

**Acceptance Criteria**:
- docs に `verification.coverage` の記述が存在する。既存 docs テスト（あれば）が green。

## T-09: 新規テストで受け入れ基準を固定する

- [x] **判定コア（T-04）**: fixture の lcov + 変更集合で各ケースを固定する（全 DA 未実行 → failed + 列挙 / 1 行実行 → passed / DA 無し → passed / lcov 不在 → failed / `exclude` → 対象外 / `include` 外 → 対象外）。
- [x] **lcov パーサ（T-02）**: SF 正規化（絶対 / `./` / 相対 → 同一キー）と `SF`/`DA` 抽出を固定する。
- [x] **diff パーサ（T-03）**: hunk ヘッダの各形（`+c,d` / `,d` 省略 / `d=0` / 複数 hunk）を固定する。
- [x] **orchestrator（T-05）**: coverage コマンド失敗 → failed、lcov 不生成 → failed を固定する。
- [x] **runner 配線（T-06）**: phases path / commands path の両方で coverage 宣言時にゲートが実行され verdict に反映されること、未宣言時に既存挙動が不変（既存テスト無変更 green）+ skip note を固定する。
- [x] **config validation（T-01）**: well-formed 通過 / `include` 欠落・空 / `lcovPath` 欠落 が validation エラーを固定する。
- [x] **TC-ID 厳密一致（T-07）**: `TC-1` が `TC-10` にマッチしないことを固定する。
- [x] テストは `node:child_process` / `fs` の mock、または一時ディレクトリ + 差し替え可能 spawn を用い、実 git repo に依存しない決定的構成にする（既存 runner テストの mock 方針に合わせる）。

**Acceptance Criteria**:
- request の受け入れ基準（決定表 6 ケース / 未宣言 skip 可視化 + 既存挙動不変 / コマンド失敗・lcov 不生成 → failed / TC-ID 厳密一致 / 両 path でゲート実行）がテストで固定される。
- `bun run typecheck && bun run test` が green。
