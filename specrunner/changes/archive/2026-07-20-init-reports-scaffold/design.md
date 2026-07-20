# Design: init が実行結果を報告する — repo 外の無言スキップと再実行時の無言成功を解消する

## Context

`specrunner init` は自分がやった仕事を報告しない。両方向に無言になっている。

現状コード（`src/cli/init.ts`）の関連挙動:

- `runInit` は最初に config（`~/.config/specrunner/config.json`）を書き、その後で「cwd が git repo なら」project scaffold（`.gitignore` 追記 + `specrunner/drafts` + `specrunner/changes` の mkdir）を作る、という順序になっている。
- `src/cli/init.ts:139-152` — scaffold 作成は `git rev-parse --show-toplevel` の `exitCode === 0` の場合のみ実行される。`:149` に `Non-zero exit = not a git repo; skip silently`、`:150-151` の catch に `git not available or other error — skip silently` とコメントがあり、**どちらの経路でも `return 0`**（`:154`、catch 外で唯一の return）。→ **無言スキップ**。
- `src/cli/init.ts:136` — config 既存時は `logInfo("Config already exists. Skipping global config generation.")` のみ出力。`:144-147` の scaffold 作成が成功しても何も出力しない。→ 半初期化状態からの復旧（git repo 内での init 再実行）が起きているのに、出力は `Skipping` 一行だけで**無言成功**。
- `src/cli/init.ts:133-134` — config 新規作成時の出力は `logSuccess("Config saved.")` + login 案内のみ。scaffold への言及なし。

補助関数:

- `src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore(repoRoot)` は冪等。`newContent === content` なら早期 return（`:95`）し、何も書かない。現状の戻り値は `Promise<void>` で「変更したか否か」を呼び出し側に伝えない。
- `src/util/paths.ts` の `draftsDir()` = `"specrunner/drafts"`、`changesDirRel()` = `"specrunner/changes"`。
- `src/util/spawn.ts` の `spawnCommand` は **reject しない**。プロセス起動失敗（ENOENT 等）時は `proc.on("error")` で `{ exitCode: null, stdout, stderr: err.message }` を resolve する。非ゼロ終了は `{ exitCode: <code>, ... }` を resolve する。
- ログ出口（`src/logger/stdout.ts`）: `logSuccess` / `logInfo` / `logError` は **stderr** へ書く。**stdout** へ書くのは `logResult`（末尾改行付き）と `stdoutWrite`。

実測（pristine な環境、npm 公開物 v0.4.1）:

1. 空 dir で `init` → 出力は `Config saved.` のみ・exit 0・`specrunner/` は生成されない。
2. 直後の `doctor` → `workflow-structure: specrunner/ is missing dirs: drafts, changes`。
3. `git init` 後に `init` 再実行 → 出力は `Skipping` のみだが、FS には `changes/` と `.gitignore` が生成されている。

README（`README.md:11-14`）の Quick Start は `npm install -D` → `npx specrunner init` → `npx specrunner login` の並びで、cwd が git repo である前提に言及していない。新規ユーザーはほぼ確実に無言スキップを踏み、以降どのコマンドも scaffold を補完しない（`request new` は `drafts/` のみ作成）ため、半初期化が静かに継続する。

CLI 配線: `src/cli/command-registry.ts:277` は `process.exit(await runInit({ runtime, provider }))`。`runInit` の戻り値がそのままプロセス exit code になる。

## Goals / Non-Goals

**Goals**:

- **G1**: cwd が git repo でない場合、非ゼロ exit で停止し、git repo を要求する処方を stderr に出す。global config を含め FS に何も作らない。git バイナリ不在も同じくエラーとして報告する（無言スキップの全廃）。
- **G2**: `init` の実行結果を項目別（global config / `.gitignore` / `specrunner/drafts` / `specrunner/changes`）に created / already-exists として **stdout** に列挙する。config 既存かつ scaffold 欠損の半初期化状態では欠損分を補完し created として報告する。
- **G3**: 完全初期化済み repo での再実行は全項目 already-exists の報告 + exit 0（冪等）。
- **G4**: README Quick Start に git repo 前提（`git init` を含む形）を明記する。

**Non-Goals**（request のスコープ外をそのまま踏襲）:

- doctor の hint 文言の整合（別 request）。
- `managed setup` / provider 選択フロー（`resolveInitProvider`）の変更。今回は分岐順序を変えるが、provider 解決ロジック自体は不変。
- `request new` 等、init 以外のコマンドの scaffold 補完責任。
- `--runtime managed|local` 非推奨フラグの exit code（現状 2 を維持）。

## Decisions

### D1: git repo チェックを最優先の前置ゲートにし、失敗時は config を含め何も書かず非ゼロ exit する

`runInit` の処理順を「config → scaffold」から「**git repo ゲート → config → scaffold → 報告**」へ変える。非推奨 `--runtime` フラグの引数エラー（現状の exit 2）チェックの直後、config の存在確認・provider 解決・`saveConfig` の**前**に git repo 判定を置く。

判定は既存同様 `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` を使い、結果を 3 分岐する:

- `exitCode === 0` → git repo。`repoRoot = stdout.trim()` を確定し、以降の処理へ進む。
- `exitCode === null` → git バイナリを起動できなかった（ENOENT 等）。git-unavailable エラーを stderr に出して非ゼロ exit。
- それ以外（`exitCode !== 0`、典型は 128）→ git repo でない。repo-required エラーを stderr に出して非ゼロ exit。

**Rationale**: 「どこまで済んだか」が実行場所依存になる非決定性（config だけ書けて scaffold は場所次第で落ちる現行分岐）が今回の欠陥の根。ゲートを前置し、repo でなければ config も書かないことで、init の到達点を「repo 内で全項目 or 何もしない」の二値に固定する。

**Alternatives considered**:
- 自動 `git init` する → 却下。ユーザーの repo 状態に勝手に触る（グローバル規律「明示指示された動詞以上のことをしない」に反する）。
- scaffold のみ作る（config は書く現行維持） → 却下。`.gitignore` が git 前提であり、worktree 運用の前提も崩れる。到達点の非決定性が残る。
- warn を出して exit 0 → 却下。無言スキップの半減にしかならず、CI で誤成功（exit 0）が残る。

### D2: 報告は項目別に stdout へ列挙する（logSuccess/logInfo ではなく logResult）

global config / `.gitignore` / `specrunner/drafts` / `specrunner/changes` の 4 項目について、それぞれ `created` または `already exists` を 1 行ずつ **stdout** に出す。

出力契約（安定フォーマット）— 各行は `<label>: <status>`:

| label | status（いずれか） |
|-------|-------------------|
| `global config` | `created` \| `already exists` |
| `.gitignore` | `created` \| `already exists` |
| `specrunner/drafts` | `created` \| `already exists` |
| `specrunner/changes` | `created` \| `already exists` |

出口は `logResult`（`src/logger/stdout.ts`、stdout + 末尾改行）を使う。**`logSuccess` / `logInfo` は stderr に出るため報告には使わない**（受け入れ基準 T2〜T4 が「stdout へ報告」を要求しているため、出口の取り違えは契約違反になる）。既存の login 案内 `logInfo(...)` は stderr のままでよい（プログラム結果ではなく次アクション案内のため）。既存の `logSuccess("Config saved.")` と `logInfo("Config already exists. Skipping ...")` は D2 の項目別報告に置き換えて撤去する。

**Rationale**: 「initialized」の一行要約では、半初期化からの補完（config は既存、scaffold だけ新規）と全新規が区別できず、復旧手段としての init 再実行が発見不能なまま。項目別列挙にすることで「今回何が作られ、何が既にあったか」が常に読める。

**Alternatives considered**:
- 一行要約「initialized」 → 却下（上記の通り区別不能）。
- stderr へ報告 → 却下。受け入れ基準が stdout を要求。プログラム結果（何が作られたか）は pipe 可能な stdout が適切で、進捗ログ（stderr）とは役割が異なる。

### D3: created / already-exists の判定手段を項目ごとに定める

観測に基づく判定を各項目に持たせる（agent の自己申告ではなく FS の観測結果で分岐する）:

- **global config**: 既存の存在確認結果（`fs.access(configPath)` の成否＝現行の `configExists` フラグ）をそのまま使う。存在 → `already exists`、不在 → 作成して `created`。
- **`.gitignore`**: `ensureDotSpecrunnerGitignore` の戻り値を `Promise<void>` から `Promise<boolean>`（＝ファイルを書き換えたか）に変える。`newContent === content` の早期 return を `return false`、実際に `writeFile` した経路を `return true` にする。`true` → `created`、`false` → `already exists`。
- **`specrunner/drafts` / `specrunner/changes`**: `fs.mkdir(dir, { recursive: true })` の戻り値を使う。recursive mkdir は「最初に作成したディレクトリのパス（string）」を返し、既存なら `undefined` を返す。非 `undefined` → `created`、`undefined` → `already exists`。別途 `fs.access` を呼ぶ必要はない。

`ensureDotSpecrunnerGitignore` の戻り値変更は **additive**（既存呼び出し側 `src/cli/init.ts` / `src/cli/run.ts` と既存テスト `tests/unit/util/gitignore.test.ts` はいずれも戻り値を読んでいない）。よって既存テストは無変更で green を保つ。

**Rationale**: 各項目の created/exists は「実際に FS を変えたか」で決まる。mkdir と gitignore は既に冪等な変更検知の情報を内部に持つ（mkdir は戻り値、gitignore は `newContent === content`）ので、それを呼び出し側へ露出するのが最小差分。config は既に `configExists` を持っている。

**Alternatives considered**:
- 各項目で事前 `fs.access` を追加して存在判定 → 却下。mkdir/gitignore の内部が既に持つ情報の二重取得になり、TOCTOU 的な齟齬も生む。

### D4: 環境エラーの exit code は 1、引数エラーは既存の 2 を維持する

git repo でない / git 不在の環境エラーは `return 1`。非推奨 `--runtime` フラグの引数エラーは現状どおり `return 2`。成功は `return 0`。

**Rationale**: このプロジェクトの exit code 慣習（0 = 成功 / 1 = 実行時・環境エラー / 2 = 引数エラー）に整合。受け入れ基準 T1 は「非ゼロ」を要求するのみだが、環境要因を 1 に固定して引数エラー 2 と区別する。

### D5: 処方文（prescription）の内容

repo-required エラー（stderr、logError 経由）: git repo 内で実行することを要求し、対処として `git init`（ここで初期化）または既存 repo への移動を案内し、その後 `specrunner init` を再実行するよう促す。**自動で `git init` はしない**旨が読み手に伝わる文面にする。

git-unavailable エラー（stderr、logError 経由）: git を起動できなかったことと、git を PATH 上にインストールしたうえで git repo 内で再実行するよう案内する。

具体文言は実装時に確定してよいが、両者とも「git repo を要求する」処方を含むこと（T1 が固定する観測点）。

## Risks / Trade-offs

- **[Risk] 既存 TC-002 テストの期待が反転する**（`tests/init.test.ts:189-198`：非 git dir での `init` が exit 0 を期待）。→ Mitigation: これは本 request で出力契約が変わる init テストであり、受け入れ基準 T6 が明示的に期待更新を許容している。T1 として「非ゼロ exit + config を含め FS 無変更 + 処方が stderr」に更新する（後述 T-04）。破壊確認（修正無効化で exit 0 落ち）を T1 に組み込む。

- **[Risk] cwd を mock しない既存 config テストが git repo 前提に暗黙依存する**（`tests/init.test.ts` の config 生成系、`tests/unit/config/runtime-config.test.ts:220,416,429`）。これらは `process.cwd()` を mock せず実行され、テストプロセスの cwd（本 repo = git worktree）で `git rev-parse` が成功する。→ Mitigation: テスト実行 cwd は常に git repo なので現状のまま green。コード側でこれらのテストを壊す要素はなく、テスト改変も不要。設計上の依存として本節に明記するにとどめる。

- **[Risk] `.gitignore` の `created` 報告が「specrunner エントリは既存だが `node_modules/` だけ補完した」ケースでも出る**。`ensureDotSpecrunnerGitignore` は `node_modules/` 不在時も書き換える（`src/util/gitignore.ts:86-92`）ため、この場合 `changed === true` になる。→ Mitigation: 許容する。報告の意味は「今回 `.gitignore` を書き換えた」であり、実際に書き換えた以上 `created`（＝変更あり）で正しい。半初期化補完（T4）の主目的である「欠損 scaffold を沈黙させない」は満たされる。

- **[Trade-off] provider 対話プロンプトはゲート通過後にのみ発生する**。repo 外では provider を聞かずに即エラー終了する。これは意図的（config を書かない以上 provider を聞く意味がない）で、UX 上も早期に停止するほうが良い。

## Open Questions

なし。報告フォーマットの厳密文字列（D2 の `<label>: <status>`）は本設計で確定させ、spec の Scenario と test で固定する。
