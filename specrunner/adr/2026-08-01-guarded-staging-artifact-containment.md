# ADR-20260801: guarded staging のビルド産物封じ込め — 除外パターンと量ガード

## ステータス

accepted

## コンテキスト

guarded write steps（`implementer` / `build-fixer` / `code-fixer` / `test-materialize` / `adr-gen`）は出力を事前列挙できないため、`commitAndPush` が worktree の全変更（untracked 含む）を stage する。`src/core/step/write-scope.ts` が当該 steps を `"guarded"` に分類し、`src/core/step/commit-push.ts` が `git status --porcelain` → `changedPaths` 全列挙 → `git add -A -- <changedPaths>` で実現する。

**発生した事故**。0.4.8 利用プロジェクト（TypeScript + Rust）で `implementer` が worktree 内に `.cargo-tmp/` と `cargo vendor` 産物（約 4.8 万ファイル / 880 万行）を作成した。guarded staging が全量を commit し、生成された巨大 pack が `git push` で **HTTP 400** となり job が halt した。復旧は手動除去。混入は staging の構造に由来するため、Rust ビルドが含まれるラウンドでは毎回再発しうる。

push の retry は対処にならない（HTTP 400 の原因は pack サイズであり、再送しても同じ結果になる）。正しい対処は二層である。

1. 既知の一時資材を staging から除外するリポジトリ宣言（commit に混入させない）
2. それでも漏れた大量混入を commit 前に決定的に検出して halt する量ガード（fail-closed の背止め）

また、git のデフォルト untracked 列挙モード（`normal`）はディレクトリ全体を 1 エントリに折り畳むため、4.8 万ファイルが 1〜2 エントリにしか見えない。量ガードが status 件数に依存すると動機となる事故クラスに対して無力になる。

## 決定

### D1: 二層防御 — リポジトリ宣言の除外 ＋ fail-closed 量ガード

除外（`pipeline.stagingExcludePatterns`）は既知の一時資材を staging から取り除く。量ガード（`pipeline.maxStagedFiles`、既定 2000）は宣言されていない大量混入を commit 前に halt する。両者は補完的である。除外のみでは未知パターンへの漏れが残り、量ガードのみでは既知の大量資材のたびに halt して煩い。

**却下案**:
- *push retry のみ追加* — 原因（pack サイズ）に対して無効。同一 pack を再送しても HTTP 400 は変わらない。
- *内蔵デフォルト除外リスト（`.cargo-tmp`、`node_modules` 等）* — エコシステム固有名は際限がなく、意図された成果物と偶然一致した場合に黙って落とす事故を起こす。所有権はリポジトリ宣言に置く。
- *agent に一時資材の置き場を自己申告させる* — 自己申告が staging の入力になる fail-open（bite-evidence の materialize 自己申告案と同じ構造）。

### D2: `matchesGlob` を `src/util/glob-match.ts` に移設し単一実装を共有する

`matchesGlob` 本体を `src/core/step/bite-evidence/test-file-selection.ts` から `src/util/glob-match.ts`（既存の glob ユーティリティファイル）に移す。`test-file-selection.ts` は移設先から import して re-export する（既存テストの import パスを変えない）。新規の guarded staging モジュール（`src/core/step/staging-containment.ts`）も同じ `util/glob-match.js` から import する。どちらのモジュールもローカルに `function matchesGlob` 本体を定義しない。

受け入れ基準が「単一実装 ＋ import 構造の保証」を要求しており、既存の `src/util/glob-match.ts`（`globMatch` が在住）への追加配置が文字通り要件を満たす。

**却下案**:
- *staging 側は既存 `globMatch` を再利用* — bite-evidence と staging で異なる実装を使うことになり、単一実装基準を満たさない。`globMatch` は `?` サポートや `**/`→`(?:.+/)?` の意味差異があり、bite-evidence テストのピン留めが壊れうる。
- *3 つの glob matcher を統合* — 挙動を保存した移設がスコープ。意味論を統合すると既存テストの固定値が書き換わるリスクがあり、スコープ外とした。
- *glob ライブラリ（minimatch 等）を依存追加* — 依存極小 North Star に反する。

### D3: write-scope 検査は除外適用より前に全変更集合に対して実行する

`findWriteScopeViolations`（`protectedCanonPaths` 違反検査）は `changedPaths` 全体に対して先に実行し、その結果を確認してから除外を適用して `stagePaths` を生成する。除外パターンが canon path に一致しても、その path は「stage されない」だけであり「検査されない」にはならない。

これにより除外設定が canon guard の fail-open になる経路を構造的に閉じる。

**却下案**:
- *除外後の survivors に対して検査* — 除外→検査の順序では、リポジトリ設定が `specrunner/changes/**` を除外パターンに記述することで canon guard を迂回できる。この fail-open が本決定が防ぐものそのものである。

### D4: 量ガードは `git add` より前に distinct escalation error で halt する

除外適用後の `stagePaths.length > maxStagedFiles` を確認し、超過した場合は `STAGING_LIMIT_EXCEEDED` エラー（`src/errors.ts` に factory 追加）を `git add` より前に throw して halt する。メッセージには総件数・上位ディレクトリ別集計・出口案内（`stagingExcludePatterns` / `.gitignore` への追加、または `maxStagedFiles` の引き上げ）を含む。`makeCommitFailHalt` がエラーコードを保存して terminal `failed` halt（escalation）に変換する。

**却下案**:
- *stage → index 件数を確認 → 超過なら unstage* — `git add` を実行してから `git rm --cached` で巻き戻す案。guarded sequence に git 呼び出しを追加し（既存の positional fake spawn テストが崩れる）、巻き戻しステップも必要になる。`git add` 前に計数すれば副作用なしに完結する。

### D5: guarded 列挙を `--untracked-files=all` に切り替えて真の件数を取得する

`getWorktreeChangedPaths` に `untrackedMode: "normal" | "all"` パラメーターを追加し、guarded の呼び出し側のみ `"all"` を渡す。これにより git は untracked ディレクトリを個々のファイルに展開して列挙する。4.8 万ファイルのディレクトリは status 上も 4.8 万エントリになり、量ガードが動機となる事故クラスに対して歯を持つ。

guard が超過を検出した場合は `git add` の前に halt するため、数万要素のパスリストが `git add -A -- <paths>` に渡されない（`ARG_MAX` 安全）。scoped の呼び出し側はデフォルト `"normal"` を維持し、挙動変更なし。

**却下案**:
- *`normal` モードの status 件数で判定* — ディレクトリ単位の折り畳みにより事故起因の 4.8 万ファイルが 1〜2 エントリにしか見えず、ガードが無力。
- *`normal` で列挙してから index を展開して件数を取得* — `git add` 実行が必要になり D4 の却下案と同じ問題が生じる。

### D6: config validation は既存パターンを踏襲する

`pipeline` オブジェクトスキーマに:
- `stagingExcludePatterns`: `optional(array(nonEmptyString(...)).check(minLength(1, ...)))` — `[]`・空文字列要素・非文字列要素で `CONFIG_INVALID`
- `maxStagedFiles`: `optional(number(...).check(int(...), gte(1, ...)))` — 0・負・非整数で `CONFIG_INVALID`

既存の `verification.scopedTestPatterns`（非空文字列配列）および `specReview.pollIntervalMs`（正整数）パターンに揃える。デフォルト値（除外空・閾値 2000）は config 層で注入せず `staging-containment.ts` の runtime fallback で解決する（`resolveScopedTestPatterns` 先例と対称）。

`stagingExcludePatterns: []` は「明示的な空」ではなく「フィールド省略と等価な no-op 設定」として**無効**とする。省略によって「除外なし」を表現させることで、設定済みに見える no-op config を排除する。

## 検討した代替案

### Alternative 1: push retry のみ追加（量ガードなし）

事故発生時に push が HTTP 400 で失敗したため、retry を追加して transient エラーとして扱う案。

- **Pros**: 実装が最小（retry ロジックの追加だけ）。
- **Cons**: HTTP 400 の原因は pack サイズであり、同一 pack を再送しても結果は変わらない。retry は transient な 5xx / network エラーに有効な手段であり、400 に適用するのは本質的に誤り。
- **Why not**: 発生源（巨大 pack の生成）に触れておらず、毎回 halt → 手動除去のサイクルが繰り返される。根本治療にならない。

### Alternative 2: 内蔵デフォルト除外リスト（`.cargo-tmp`、`node_modules` 等を既定で除外）

SpecRunner 自身が「よく一時資材になるパス」を内蔵デフォルトとして持ち、ユーザー設定なしに除外する案。

- **Pros**: ゼロ設定で事故クラスの一部を防ぐ。Rust プロジェクトのユーザーが設定を書かずに済む。
- **Cons**: エコシステム固有のパス名は際限がない（Rust の `.cargo-tmp`、Node.js の `node_modules`、Python の `__pycache__` 等）。意図した成果物がたまたまこれらの名前に一致した場合に黙って staging から落とし、commit の欠損を気づかせない事故を生む。
- **Why not**: 「安全な既定」は「何も黙って落とさないこと」。所有権はリポジトリ宣言に置くべきであり、SpecRunner 側に内蔵することは Opt-out が必要な危険な既定になる。`verification.scopedTestPatterns` と同じ「リポジトリ宣言 ＋ 安全な既定（空）」の形を選んだ。

### Alternative 3: agent による一時資材の自己申告

`implementer` 等の agent に「ビルドで作成した一時ディレクトリ」を申告させ、staging がその申告を除外リストとして使う案。

- **Pros**: ツールごとに異なるキャッシュパスに動的に対応できる。設定ファイルを書く必要がない。
- **Cons**: agent の自己申告が staging の制御入力になる fail-open 構造。agent が誤って申告した（または申告しなかった）場合に検出手段がない。bite-evidence の `test-materialize` 自己申告案を却下したのと同じ理由で、agent の出力を信頼の基点に置くことはできない。
- **Why not**: guarded staging の安全性の根拠は「agent の申告に依存しない外部不変条件（config + ガード）」に置く必要がある。申告ベースでは fail-open を構造的に閉じられない。

### Alternative 4: `--untracked-files=normal` のまま status 件数で量ガード

`git status` の既定 `normal` モード（untracked ディレクトリを 1 エントリに折り畳む）のまま、エントリ数を閾値と比較する案。

- **Pros**: `getWorktreeChangedPaths` の呼び出し変更が不要。既存の status 解析コードをそのまま使える。
- **Cons**: `normal` モードでは `.cargo-tmp/`（4.8 万ファイル）が 1 エントリにしか見えない。status 件数 ≤ 2000 であっても `git add -A -- .cargo-tmp/` の展開後は 4.8 万ファイルが staged になる。閾値は無意味であり、動機となる事故クラスに対して完全に無力。
- **Why not**: 量ガードに歯を持たせるには stage 対象の**真の件数**（個別ファイル数）が必要。`--untracked-files=all` による per-file 列挙が唯一の手段。

### Alternative 5: stage 後に index 件数を確認して超過時に unstage

`git add` を先に実行してから `git diff --cached --name-only` で index のファイル数を数え、超過なら `git rm --cached` で全件 unstage してから halt する案。

- **Pros**: 列挙フェーズを変更せずに済む。index が正確な件数を持つ。
- **Cons**: guarded sequence に git 呼び出しを 2 回追加（diff + rm）する。既存の positional fake spawn テスト（TC-002 / TC-017）は git サブコマンドの順序を位置引数で固定しており、呼び出し列が変わるとテストが崩れる。巻き戻しステップ（`git rm --cached`）が部分的に失敗した場合のリカバリも複雑になる。oversized な arg list を `git add` に渡した後での検出になるため、`ARG_MAX` 超過リスクも残る。
- **Why not**: `git add` 前に per-file 列挙（D5）で件数を確定してから判断すれば、git 呼び出しを追加せず、副作用なしに完結する。halt 経路が `git add` より前に確定するため ARG_MAX も安全。

## 影響

### Positive

- guarded staging がビルドのために worktree に作成した一時資材（CARGO_HOME、vendor 等）を commit から機械的に封じられる。
- 宣言されていない大量混入は commit 前に決定的に halt し、復旧不能な HTTP 400 pack エラーが発生源で消える。
- リポジトリ宣言（`stagingExcludePatterns`）が適切に記述されていれば量ガードは発火しない。両者は補完的に機能する。
- 既定空・既定 2000 により既存プロジェクトへの動作変更はない。小規模な guarded staging（< 2000 ファイル）はそのまま commit を継続する。

### Negative

- `--untracked-files=all` に切り替えることで、全 untracked ファイルを個別列挙する分のメモリ・時間コストが増える。untracked 資材が数万ファイルある場合は文字列配列が数 MB になりうる（halt が先に来るため git への arglist は渡らない）。
- 従来は `normal` モードで 1 エントリとして見えていた大量 untracked ディレクトリが量ガードによって halt を引き起こしうる。これは意図した挙動変化（既存の「黙って commit する」が事故だった）。

### Known Debt

- 3 つの glob 実装（`matchesGlob` / `globMatch` / `matchGlob`）が `src/util/glob-match.ts` に混在する状態になる。意味論の統合（`?` サポート有無、`**/` 展開の差異）は将来の request で行う。
- `maxStagedFiles` が大きく引き上げられた場合（数万超）、`git add -A -- <stagePaths>` の arg list が `ARG_MAX` に近づく可能性がある。pathspec バッチ分割は現時点では Non-Goal（既定 2000 ではリスクなし）。

## 参照

- Request: `specrunner/changes/guarded-staging-artifact-containment/request.md`
- Design: `specrunner/changes/guarded-staging-artifact-containment/design.md`
- Related: guarded write steps の定義 — `src/core/step/write-scope.ts`（`GUARDED_WRITE_STEPS`）
- Related: `src/core/step/staging-containment.ts`（除外・量ガードの純関数実装）
- Related: `src/util/glob-match.ts`（`matchesGlob` 移設先）
