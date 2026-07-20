# Tasks: init が実行結果を報告する

実装対象は `src/cli/init.ts`（挙動）、`src/util/gitignore.ts`（戻り値露出）、`README.md`（Quick Start）、
`tests/init.test.ts`（出力契約が変わる既存 init テストの更新 + 新規テスト追加）。

出力契約（design D2 で確定）— stdout に 1 行ずつ `<label>: <status>`:
- label: `global config` / `.gitignore` / `specrunner/drafts` / `specrunner/changes`
- status: `created` | `already exists`
- 出口は `logResult`（stdout）。`logSuccess` / `logInfo`（stderr）は報告に使わない。

## T-01: `ensureDotSpecrunnerGitignore` が変更有無を返すようにする

- [ ] `src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore` の戻り値を `Promise<void>` から `Promise<boolean>` に変更する。
- [ ] 早期 return（`newContent === content`、現 `:95`）を `return false` にする。
- [ ] 実際に `writeFile` する経路（現 `:97`）の後で `return true` にする。
- [ ] 関数の doc コメントに「戻り値: ファイルを書き換えたら true、無変更なら false」を追記する。
- [ ] 既存呼び出し側（`src/cli/init.ts`、`src/cli/run.ts`）は戻り値を読んでいないため、T-02 の init 改修以外は変更不要であることを確認する。

**Acceptance Criteria**:
- `ensureDotSpecrunnerGitignore` の戻り値型が `Promise<boolean>` である。
- specrunner エントリ（および `node_modules/`）が既に揃った `.gitignore` に対しては `false`、書き換えが発生する場合は `true` を返す。
- 既存テスト `tests/unit/util/gitignore.test.ts` が無変更で green（戻り値を読んでいないため）。

## T-02: `runInit` に git repo ゲートと項目別報告を実装する

- [ ] 非推奨 `--runtime managed|local` の引数エラー分岐（現 `:55-63`、`return 2`）は現状維持。
- [ ] その直後・config 存在確認や provider 解決の**前**に git repo ゲートを置く（design D1）:
  - `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` を実行。
  - `exitCode === 0` → `repoRoot = result.stdout.trim()` を確定して以降へ進む。
  - `exitCode === null` → git-unavailable エラーを `logError`（stderr）で出し `return 1`。
  - それ以外（非ゼロ）→ repo-required エラーを `logError`（stderr）で出し `return 1`（design D5 の処方内容。`git init` または既存 repo への移動を案内し、自動 `git init` はしない旨を伝える）。
  - `spawnCommand` は reject しないが、防御的に try/catch で囲み throw も git-unavailable 扱い（`return 1`）にする。
- [ ] global config: 既存の `configExists` 判定を流用。
  - 不在 → 既存の provider 解決 + config 構築 + `saveConfig`（現 `:75-132` のロジックを維持、順序のみゲート後へ移動）。報告 status = `created`。
  - 既存 → config は書かない。報告 status = `already exists`。現 `:136` の `logInfo("Config already exists. Skipping ...")` は撤去。
  - 現 `:133-134` の `logSuccess("Config saved.")` は撤去。login 案内 `logInfo(...)` は残す（stderr、次アクション案内）。
- [ ] `.gitignore`: `const gitignoreChanged = await ensureDotSpecrunnerGitignore(repoRoot);` を呼び、`gitignoreChanged ? "created" : "already exists"` を報告。
- [ ] `specrunner/drafts`: `const draftsCreated = await fs.mkdir(path.join(repoRoot, draftsDir()), { recursive: true });` を呼び、`draftsCreated !== undefined ? "created" : "already exists"` を報告。
- [ ] `specrunner/changes`: `const changesCreated = await fs.mkdir(path.join(repoRoot, changesDirRel()), { recursive: true });` を呼び、同様に報告。
- [ ] 4 項目の報告行を `logResult`（stdout）で 1 行ずつ、`global config` → `.gitignore` → `specrunner/drafts` → `specrunner/changes` の順に出す。
- [ ] 現 `:139-152` の「git repo なら scaffold、非ゼロ/catch で silent skip」ブロックと `Non-zero exit = not a git repo; skip silently` / `git not available or other error — skip silently` コメントを削除する（無言スキップの全廃）。
- [ ] 正常系の最終 `return 0` を維持する。

**Acceptance Criteria**:
- 非 git dir で `runInit({})` が非ゼロ（1）を返し、stderr に git repo を要求する処方が出て、global config・`specrunner/`・`.gitignore` のいずれも作られない。
- git repo 内・config 不在で `runInit({})` が 4 項目すべてを `created` として stdout に報告し exit 0。
- git repo 内・完全初期化済みで再実行すると 4 項目すべてを `already exists` として報告し exit 0、FS 無変更。
- git repo 内・config 既存だが scaffold 欠損で再実行すると `global config: already exists` かつ欠損分が `created` として報告される。
- `Config already exists. Skipping global config generation.` および `Config saved.` の文言がコードから消えている。

## T-03: README Quick Start に git repo 前提を明記する

- [ ] `README.md` の Quick Start（現 `:11-14`）に、`npx specrunner init` の前に git repo 内であること（`git init` を含む形）を組み込む。例: `mkdir` → `cd` → `git init` → `npm install -D @color4pen/specrunner` → `npx specrunner init` の並び、または既存 repo で実行する旨の明示。
- [ ] init が git repo 内での実行を要求すること（repo 外ではエラーで停止すること）が読み手に伝わる 1 文を添える。

**Acceptance Criteria**:
- Quick Start の手順に `git init`（または「git repo 内で実行する」旨）が `specrunner init` より前に含まれる。
- 手順を上から辿ると git repo 前提が満たされる。

## T-04: 既存 init テストの更新と新規テストの追加（T1〜T4 の固定）

`tests/init.test.ts` に対する変更。出力アサートは stdout（`process.stdout.write` の mock）を捕捉して行う。
既存 beforeEach は stdout/stderr を no-op mock している（`() => true`）ため、内容検証には `mockImplementation`
で書き込み文字列を集約する形へ調整するか、`vi.mocked` 経由で呼び出し引数を検査する。

- [ ] **T1（repo 外の明示停止）**: 既存 TC-002（現 `:176-199`、非 git dir で exit 0 と specrunner/ 不在を期待）を更新し、以下を固定する:
  - `runInit({})` が非ゼロ（1）を返す。
  - stderr に git repo を要求する処方が含まれる。
  - non-git dir に `specrunner/` も `.gitignore` も作られない。
  - global config（XDG 配下）も作られない（`fs.access(configPath)` が reject）。
  - **破壊確認**: この T1 テストが、git ゲートを外した実装（init が repo 外でも exit 0 で進む）では exit 0 を返して落ちることをコメントで明記し、アサートが `expect(result).not.toBe(0)` を含むことで担保する。
- [ ] **T2（作成の報告）**: 未初期化の git repo（`git init` 済みの temp dir を cwd に mock、XDG も temp で config 不在）で `runInit({})` を実行し、stdout に `global config: created` / `.gitignore: created` / `specrunner/drafts: created` / `specrunner/changes: created` が個別に出ることを固定する。exit 0。
- [ ] **T3（冪等 + 報告）**: 同 git repo で `runInit({})` を 2 回実行し、2 回目の stdout が 4 項目すべて `already exists` であること、exit 0 であること、2 回目前後で `.gitignore` / `drafts` / `changes` の内容が無変更であることを固定する。
- [ ] **T4（半初期化の補完報告）**: git repo 内で global config を事前作成（XDG 配下）し、scaffold（drafts/changes/.gitignore の specrunner エントリ）は無い状態から `runInit({})` を実行。stdout に `global config: already exists` かつ `specrunner/drafts: created` / `specrunner/changes: created` / `.gitignore: created` が出ることを固定する。exit 0。
- [ ] 既存の T-01 系テスト（現 `:202-268`、git repo 内で scaffold 作成・冪等・config 既存でも scaffold 作成）が新実装でも green であることを確認する。出力契約変更で内容が重複するなら T2〜T4 へ統合してよいが、既存アサート（drafts/changes 作成・exit 0）は保持する。
- [ ] cwd を mock しない config 生成系テスト（現 `:29-174`, `:335-405`）は、テストプロセス cwd が git repo（本 repo）であるため無変更で green であることを確認する。改変しない。

**Acceptance Criteria**:
- T1〜T4 に対応するテストが存在し green。
- T1 テストが `expect(result).not.toBe(0)`（または `toBe(1)`）を含み、破壊確認の意図がコメントで明記されている。
- 既存の config 生成系・provider 系テストは無変更のまま green。

## T-05: 検証（受け入れ基準 T6）

- [ ] `bun run typecheck`（tsc）が green。
- [ ] `bun run test`（vitest）が green。
- [ ] 出力契約が変わった init テスト（T1 の TC-002 更新）以外の既存テストが無変更で green であることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 本 request で出力契約が変わる init テストの期待更新（T-04）を除き、既存テストは無変更で green。
