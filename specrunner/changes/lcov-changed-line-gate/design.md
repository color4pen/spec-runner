# Design: verification に変更行の実行検証（lcov changed-line gate）を追加する

## Context

現行の test-coverage 検査（`src/core/verification/test-coverage.ts`）は、test-cases.md の `Priority: must` TC ID が、いずれかのテストファイル内に**文字列として存在するか**だけを照合する（`:208` `text.includes(tcId)`）。この検査は次の 2 つの穴を持つ:

1. **実行の事実を検証しない**: TC ID をコメントに書きさえすれば、実装コードを一切実行しないテスト（ソースを文字列で読んで内容を照合するだけのテスト等）でも verification は green になる。「テストが実際に変更コードを実行しているか」はどのゲート（verification / code-review / conformance）も機械検証しておらず、実行ゼロの形骸テストが全ゲートを素通りし得る。
2. **substring 誤マッチ**: `TC-1` が `TC-10` にもマッチする。

「テストが実質的か」を LLM レビューに読ませるのは不確実性の再導入である。本変更は「**変更行が実行されたか**」という機械検証を追加する。継ぎ目は **git diff（言語非依存）× lcov（標準交換形式）× exit code** のみに限定し、spec-runner にソース／テストの言語別パースを一切持たせない。lcov は vitest / coverage.py / cargo-llvm-cov 等、主要言語の coverage ツールが出力できる共通形式であり、この 3 点だけで言語横断に「変更行の実行」を導出できる。

### 現状構造（変更の土台）

- **分岐**: `runVerification(slug, cwd, verificationConfig?, baseBranch?)`（`runner.ts:307`）が `verification.commands` の有無で `runVerificationCommands`（`:326`）/ `runVerificationPhases`（`:399`）に分岐する。
- **phases path**: `build → typecheck → test → lint → security → test-coverage` を fail-fast で実行（`:435`〜）。`test-coverage` は CLI 内部処理として `runTestCoveragePhase` を呼ぶ（`:451-453`、commands path では走らない）。
- **commands path**: repo 供給 command を `sh -c` で順次実行（`spawnCommand`、`commands.ts`）。**`baseBranch` を受け取っていない**（`runVerificationCommands` の引数に無い）。
- **verdict 集約**: 両 path とも `phases` 配列に対し `some(status==="failed")` → failed、全 skipped → `VERIFICATION_NO_RUNNABLE_PHASES`。
- **結果出力**: `writeVerificationResult` が verification-result.md を生成。verdict が passed でも test phase に skip があれば「passed with skips」note を verdict 直下に挿入する既存機構がある（`:138-147`）。
- **既存 seam の前例**:
  - 変更ファイル導出: `LocalRuntime.listChangedFiles`（`local.ts:702`）が `git diff --name-only <baseBranch>...HEAD` を cwd で実行。
  - 直接 git spawn: `checkPackageJsonScriptsIntegrity`（`runner.ts:202`）が runner 内で `spawn("git", …)` を直接呼ぶ前例。
  - glob 照合: `globMatch(filePath, pattern)`（`util/glob-match.ts`、repo-root 相対 POSIX、依存なし）。fast pipeline の forbidden surfaces（`{ id, paths }` の配列 config）と同型の「data は repo が宣言」パターン。
  - config resolver: `resolveArchiveConfig` / `resolvePipelineForbiddenSurfaces`（`schema.ts`）。
- 検証は job worktree 内で実行され、base branch との diff は git から機械的に導出できる。

## Goals / Non-Goals

**Goals**:

- `verification.coverage` config（coverage 付きテスト実行コマンド・lcov 出力パス・`include` 必須 glob・`exclude` 任意 glob）を追加し、zod validation を通す。
- 宣言時、coverage コマンドを実行し、lcov（`SF:` / `DA:` 行）を**自前の最小パーサ**（依存追加なし）で読み、base branch との変更行と突合して、変更ファイルごとに「実行された変更行があるか」を機械判定するゲートを追加する。
- ゲートは **commands path / phases path の両方**で、主検証の後に実行する。
- fail 時は該当ファイルを列挙して verification を failed にする。coverage コマンド失敗・lcov 不生成も fail（宣言された保証を黙って落とさない）。未宣言なら skip し、skip の事実を verification-result に可視化する。
- 既存 TC-ID 照合を **traceability 検査**として残置しつつ、照合を substring から **ID 境界の厳密一致**に修正する。
- 既定閾値「変更ファイルごとに実行された変更行 > 0」。より強い閾値は config で任意強化でき、既定挙動は不変。

**Non-Goals**（request のスコープ外を継承）:

- branch coverage / 実行率レポートの高度化。
- lcov 以外の形式（cobertura 等）のサポート。
- テスト内容の意味的検証（assert の妥当性）。coverage は「実行の事実」のみを保証する。
- mock 汚染（afterAll 未復元等）の検出。
- 特定 coverage ツールの導入・強制（コマンドは repo 供給の opaque command として扱う）。
- spec-runner 自身の `.specrunner/config.json` へのゲート有効化（本 PR では宣言しない。Open Questions 参照）。

## Decisions

### D1: 継ぎ目を git diff × lcov × exit code に限定する（言語非依存）

ゲートが依存する外部情報は次の 3 点のみとし、ソース／テストの言語別パースを CLI に一切持たせない:

1. **git diff**: base branch との変更ファイルと**変更行番号（HEAD 側）**。言語非依存。
2. **lcov**: coverage ツールが出力する `SF:`（ソースファイル）/ `DA:`（行番号,実行回数）のみを読む。他レコード（`FN`/`BRDA`/`LF`/`LH` 等）は無視。
3. **exit code**: coverage コマンドの成否。

- **Rationale**: 「どのコードがテストで実行されたか」を言語横断で機械導出できる最小集合。JS 固有のパース（後述 D7 の却下案）を避け、fast pipeline forbidden surfaces と同じ「機構は一様・data のみ可変」を貫く。
- **Alternatives considered**: assert 有無の言語別静的検出 → JS 固有パースで他言語破綻（却下、request 記載）。テスト実質性を LLM reviewer に読ませる → 判断の再導入で保証にならない（却下、request 記載）。

### D2: config は `verification.coverage`。`include` 必須の surface 宣言 + fail-closed

`verification` セクションに `coverage` を追加する:

```jsonc
{
  "verification": {
    "coverage": {
      "command": "vitest run --coverage",          // ShellCommand（string | { name?, run }）
      "lcovPath": "coverage/lcov.info",             // cwd 相対の lcov 出力パス（必須）
      "include": ["src/**"],                         // 検証対象 surface の glob 配列（必須・非空）
      "exclude": ["src/**/*.d.ts", "src/generated/**"], // 除外 glob（任意）
      "minChangedLineCoverage": 0                    // 任意の強化閾値（既定挙動 = > 0 実行）
    }
  }
}
```

- `include` は**必須かつ非空**。「どこのコードがテストに実行されるべきか」を repo が一度データで宣言する契約とする。空 include はゲートを無害化する footgun なので validation で拒否する。
- `exclude` は任意。正当にテスト不能な surface 内ファイルはここで宣言する（ゲート側に per-file 例外機構を足さない）。
- glob は repo-root 相対 POSIX で `globMatch` に渡す（forbidden surfaces / archive.protectedPaths と同じ空間）。
- **Rationale**: fast pipeline forbidden surfaces と同型。ゲートの on/off・対象に LLM 判断を挟まず、機構は一様・data のみ可変。fail-closed（D4）と組み合わせ、「宣言した surface は必ずロードされる」を強制する。
- **Alternatives considered**: `include` 任意（無指定=全ソース）→ 却下: 全 repo のソースツリー構造を CLI が推測することになり、対象決定に暗黙判断が入る。repo が宣言する data に倒す。must TC 件数など LLM 生成物をゲートのスイッチにする → agent 出力がゲートを外せる構造で「judgment をゲートに挟まない」原則違反（却下、request 記載）。

### D3: 判定は変更ファイルごとの決定表（fail-closed）

対象は「base…HEAD の変更ファイル（削除は除外、D6）」のうち `include` にマッチし `exclude` にマッチしないもの。各対象ファイル `f` について:

| 状態 | 判定 |
|------|------|
| `f` が lcov に **存在しない**（`SF:` 無し = テスト実行で一度もロードされていない） | **fail**（fail-closed） |
| `f` が lcov に存在し、変更行に DA レコード（実行可能行）が**無い**（型定義・コメント等の非実行行のみの変更） | pass |
| `f` が lcov に存在し、変更 DA 行があり、**1 行も実行されていない**（既定閾値） | **fail** |
| `f` が lcov に存在し、変更 DA 行のうち閾値以上が実行されている | pass |
| `include` 不一致 または `exclude` 一致 | 対象外（判定しない） |

- **Rationale**: 「lcov 不在 = 未ロード = 未実行」を fail に倒すことで、テストが surface を丸ごと素通りするケース（false-green の大半）を捕捉する。正当な例外は `exclude` で宣言（判断を data に寄せる）。
- **Alternatives considered**: lcov 不在をスキップ（fail-open）→ 却下: 「テストが一度も読み込んでいない」が最悪ケースなのに素通りし、動機を満たさない。既定 100% 閾値 → 型定義行・防御的コードで誤爆し調整コスト過大（却下、request 記載）。まず実行ゼロ検出から。

### D4: ゲートは主検証後に実行。宣言時のみ phase を足し、未宣言時は非 phase の note で可視化

- **宣言時（`verification.coverage` あり）**: `changed-line-coverage` phase を主検証の**後ろ**に追加する。両 path で fail-fast に参加する（先行 phase が failed なら skipped）。先行が全て passed のときにゲートを実際に実行する。coverage コマンド失敗 / lcov 不生成 → failed（D5）。判定 fail → failed（該当ファイル列挙を stdout に）。
- **未宣言時**: phase を**追加しない**。代わりに verification-result.md に「changed-line coverage gate: skipped（`verification.coverage` 未設定）」の**note**（既存「passed with skips」note と同じ verdict 直下領域）を出す。

- **Rationale**: 既存 runner テストは coverage 未設定で `phases.length` を厳密固定している（phases path で `=== 6`、commands path で `=== 0` / `=== 2` / `=== 3` 等）。未宣言時に phase を足すとこれらが破れ、受け入れ基準「config 未宣言 → 既存挙動が不変（既存テスト無変更 green）」に反する。よって未宣言時は phase を増やさず note で可視化し、宣言時のみ phase を足す（宣言時は既存テストが coverage を設定しないので不変）。
- **Alternatives considered**: 常に skipped phase を追加 → 却下: 既存の `phases.length` 固定テストを一斉に壊す。未宣言時は完全無音 → 却下: 「skip した事実を可視化」の要件を満たさない。

### D5: coverage コマンド失敗・lcov 不生成は fail（宣言された保証を黙って落とさない）

ゲートが実行される（宣言あり・先行 passed）とき:

- coverage コマンドの exit code が非 0 → **failed**（stdout/stderr を結果に載せる）。
- コマンド成功でも `lcovPath` のファイルが不在・空・パース不能 → **failed**。

- **Rationale**: 宣言した保証（変更行の実行検証）を、道具の失敗を理由に静かに無効化しない。commands path の主テストとは別に coverage 専用コマンドを走らせるため、二重実行になり得るが、それは repo が opaque command として選ぶ設計上の許容コスト。
- **Alternatives considered**: lcov 不在をスキップ扱い → 却下: 未ロード fail-closed（D3）と矛盾し、保証を落とす。

### D6: 変更行の導出は `git diff --unified=0 <base>...HEAD`。純粋パーサ + 直接 git spawn

変更行番号は次で導出する:

- 対象ファイル集合: `git diff --name-only --diff-filter=d <baseBranch>...HEAD`（削除ファイルは除外。削除されたファイルは HEAD に存在せず lcov で検証不能なため対象にしない）。`listChangedFiles`（`local.ts:702`）と同じ `<baseBranch>...HEAD`（merge-base）base を用い、既存の changed-files seam と一貫させる。
- 変更行: `git diff --unified=0 <baseBranch>...HEAD -- <対象>` の hunk ヘッダ `@@ -a,b +c,d @@` から **HEAD 側（`+c,d`）** の行番号 `[c, c+d-1]` を収集（`d=0` は純削除で HEAD 側行なし）。
- runner から `git` を直接 spawn する（`checkPackageJsonScriptsIntegrity` と同じ前例）。純粋な hunk パーサ関数と、薄い git spawn ラッパに分離してテスト可能にする。
- `baseBranch` が undefined のときは `"main"` を既定にする（`scope-check.ts:53` と同じ既定）。

- **Rationale**: `--unified=0` で厳密に変更行のみを取得でき、context 行の混入を避ける。パースは純関数に切り出し、diff テキストの fixture で決定的にテストする。
- **Alternatives considered**: `runtimeStrategy.listChangedFiles` 経由 → 却下: runner は step 層の非 CLI コンポーネントで `deps.runtimeStrategy` を持たず、既に git を直接 spawn する層。行番号取得の API も無い。runner 内直接 spawn が既存パターンに合う。

### D7: lcov は `SF:`/`DA:` のみの自前最小パーサ。SF パスは repo-root 相対に正規化

`parseLcov(text)` は次のみを解釈する（依存追加なし）:

- `SF:<path>` でファイルセクション開始。`DA:<line>,<count>` を `Map<line, count>` に蓄積。`end_of_record` でセクション確定。他レコードは無視。
- **SF パスの正規化**: coverage ツールは SF を絶対パス / cwd 相対 / `./` 付き等で出す。git diff 出力・`include`/`exclude` glob と突合するため、SF を **cwd 起点の repo-root 相対 POSIX** に正規化する（絶対で cwd 配下ならプレフィクス除去、先頭 `./` 除去）。正規化後のキーで突合する。

- **Rationale**: 突合の 3 者（lcov SF・git diff path・glob）を同一パス空間に揃えないと fail-closed が誤爆する（正規化漏れで「lcov に居るのに不在扱い」→ 誤 fail）。パス空間の一致がゲートの正しさの要。
- **Alternatives considered**: 既存 lcov ライブラリ導入 → 却下: minimal-deps North Star に反する。`SF`/`DA` だけで足りる。

### D8: 判定コアは純関数。orchestration と分離

- `evaluateChangedLineCoverage({ lcov, changedLinesByFile, include, exclude, minChangedLineCoverage })` を**純関数**とし、決定表（D3）を実装して `{ status, failedFiles, skippedFiles, stdout }` を返す。受け入れ基準「fixture の lcov + 変更集合で各ケースを固定」はこの純関数を直接叩いて満たす。
- `runChangedLineCoverageGate({ slug, cwd, coverage, baseBranch, spawn })` が orchestration（コマンド実行 → lcov 読取 → diff 導出 → 純関数呼び出し → `PhaseResult` 生成）を担う。

- **Rationale**: 判定ロジックを I/O から切り離し、決定的な fixture テストで全分岐を固定する（Verify don't trust: observable な純関数出力で二重検証）。
- **Alternatives considered**: 全部を 1 関数に → 却下: git/コマンド/fs を毎テストで用意する必要が生じ、決定表の網羅が困難。

### D9: TC-ID 照合は traceability として残置。substring → ID 境界の厳密一致に修正

`test-coverage.ts` の照合を、`text.includes(tcId)` から **ID 境界の厳密一致**に変える。`TC-1` が `TC-10`（後続が数字）や `TC-1-2`（後続が `-数字`）に誤マッチしないよう、ID の前後を境界で区切る（前は英数字でない、後は数字でも `-数字` でもない）。この修正を found 判定・assertionless 判定の両方（どちらも `.includes` を使う）に適用する。

- 既存の assertionless（`expect(|assert(|assert.`）ヒューリスティックの**振る舞いは変えない**（照合の厳密化のみ）。合否の「実質」は本ゲートに移り、TC-ID 照合は「test-cases.md とテストの紐付け（traceability）」という別軸の検査として残る。
- **Rationale**: traceability と実行検証は別軸。TC-ID 照合の全廃は反証不足で却下（request 記載）。誤マッチだけは明確なバグなので厳密化する。
- **Alternatives considered**: TC-ID 照合の全廃 → 却下（request 記載）。assertionless ヒューリスティックの撤去 → 却下: 未宣言時の既存挙動不変（受け入れ基準）に反し、スコープ外。

### D10: 既定閾値は「実行された変更行 > 0」。`minChangedLineCoverage` で任意強化

変更 DA 行のうち実行された割合を `executed / changedDa` とし:

- `minChangedLineCoverage` 未指定 → pass 条件は `executed >= 1`（実行ゼロ検出。既定挙動）。
- 指定時（0〜1）→ pass 条件は `executed / changedDa >= minChangedLineCoverage`。
- `changedDa` が空（実行可能な変更行が無い）→ 閾値に関わらず pass。

- **Rationale**: request 要件 6。既定は実行ゼロ検出に留め誤爆を避ける。より強い保証が欲しい repo は data で強化でき、既定挙動は変えない。
- **Alternatives considered**: 既定 100% → 却下（request 記載、誤爆過大）。

### D11: commands path に baseBranch を通す

`runVerification` は既に `baseBranch` を受けるが、`runVerificationCommands` に渡していない。ゲートが commands path でも動くよう、`runVerificationCommands` / `runVerificationPhases` の両方へ `coverage` config と `baseBranch` を引き渡す。

- **Rationale**: 要件 3「commands path でも機能すること」。既存 signature（`runVerification(slug, cwd, verificationConfig?, baseBranch?)`）は不変で、内部引き回しのみ追加する。

## Risks / Trade-offs

- **[Risk] パス空間の不一致で fail-closed が誤爆する**（lcov SF が絶対パス、git diff が相対）→ **Mitigation**: D7 の SF 正規化を専用のユニットテスト（絶対 / `./` 付き / 相対の各入力 → 同一 repo 相対キー）で固定する。
- **[Risk] 未宣言時に phase を足して既存テストを壊す** → **Mitigation**: D4 で未宣言時は note のみ（phase 追加なし）。実装タスクの受け入れ基準に「既存 runner テスト無変更 green」を明記。
- **[Risk] coverage 専用コマンドが主 test phase とテストを二重実行しコストが増える** → **Trade-off**: coverage 計測は instrumentation コストが伴い分離が自然。二重実行は repo が opaque command を選ぶ設計上の許容コスト（Non-Goal: ツール強制なし）。
- **[Risk] `--unified=0` の hunk パースが rename / 追加のみ / 削除のみで境界誤り** → **Mitigation**: 純粋 hunk パーサを diff fixture（追加のみ `+c,d` / `d=0` の純削除 / 複数 hunk）で固定する。
- **[Trade-off] 未宣言 → ゲート無効**により、宣言するまで実行検証はゼロ。これは意図した挙動（保護対象は repo が宣言する data、fast forbidden surfaces と同型）。TC-ID traceability は未宣言でも従来どおり働く。

## Migration Plan

- 本変更は additive: config キー新設 + 宣言時のみ発火する新 phase + TC-ID 照合の厳密化（substring 依存の既存テストは無いため回帰なし）。
- 既存 repo（coverage 未宣言）: 挙動不変（note が 1 行増えるのみ、phase 数・verdict は不変）。
- coverage を宣言した repo: 主検証後に changed-line-coverage phase が走る。誤爆の残余（surface 内だが正当にテスト不能な稀ケース）は `exclude` 宣言、または既存の escalation → 人の判断 → resume 経路を安全弁とする（ゲート側に例外機構を足さない）。
- rollback: config キーは optional。未指定なら発火しないため、revert は無害。

## Open Questions

- spec-runner 自身の `.specrunner/config.json` でゲートを有効化するか（dogfooding）。本 PR では宣言しない: 本 PR の変更行が自 repo の coverage 閾値を満たさないと自身の verification が落ちる循環を避けるため。ゲートの安定後に別 request で dogfooding を検討する。
- `minChangedLineCoverage` の妥当な既定強化値（例: 変更 DA 行の 100% を要求）を将来 repo 実績から決めるか。現状は「> 0 実行」の緩い側に倒し、強化は各 repo の data に委ねる。
