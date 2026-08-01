# Tasks: verification に lockfile 整合 gate を追加する

> 依存順:
> T-01（detect-pm helper）・T-02（changed-lines helper）は独立。
> T-03（純粋判定コア）→ T-04（gate orchestrator, T-01/T-02/T-03 に依存）→ T-05（runner 配線, T-04 に依存）。
> T-06（implementer prompt）は独立。T-07（受け入れ固定・最終検証）は全実装後。
> 実装は `node:child_process` / `node:fs/promises` / `node:path`（`bun:*` / `Bun.*` は禁止）と既存 util のみを用い、**新規 runtime 依存を追加しない**。
> テストは既存 verification テストの mock 方針（`node:child_process` mock または一時ディレクトリ + 差し替え可能 `spawn`）に合わせ、実 git repo に依存しない決定的構成にする。

## T-01: detect-pm に lockfile 探索・判定ヘルパを追加する

- [ ] `src/util/detect-pm.ts` に純関数 `findLockfile(cwd: string, fsLike?: { existsSync(path: string): boolean }): { pm: PackageManager; filename: string; root: string } | null` を追加する。
  - `detectPackageManager` の phase-1（lockfile 上向き探索、`.git` かファイルシステム root で停止）と同一ロジックで、`LOCKFILE_MAP` の最初にマッチした lockfile を `{ pm, filename, root }` で返す。見つからなければ `null`。
  - 既存 `detectPackageManager` は**無改変**で残す（additive な兄弟関数として追加する。既存 detect-pm テストを壊さない）。
- [ ] `src/util/detect-pm.ts` に `isLockfileName(name: string): boolean` を追加する。`name`（basename）が `LOCKFILE_MAP` のいずれかの lockfile 名に一致するとき `true`。
- [ ] `LOCKFILE_MAP` はモジュール内 private のまま、両ヘルパから参照する（新規に外部公開しない方針を保つ）。

**Acceptance Criteria**:
- `findLockfile` が、lockfile を持つ一時ディレクトリで対応する `{ pm, filename, root }` を返し、lockfile を持たないディレクトリで `null` を返す（`fsLike` 注入で決定的にテスト）。
- `isLockfileName("bun.lock")` / `"package-lock.json"` / `"pnpm-lock.yaml"` / `"bun.lockb"` / `"yarn.lock"` が `true`、`"package.json"` / `"foo.lock"` が `false`。
- 既存 `tests/unit/util/detect-pm*.test.ts`（存在する範囲）が**無変更で green**。`typecheck` が green。

## T-02: changed-lines に name-only 変更ファイル一覧ヘルパを追加する

- [ ] `src/core/verification/changed-lines.ts` に `getChangedFileList(options: { cwd: string; baseBranch?: string; spawn?: SpawnFn }): Promise<string[]>` を追加する。
  - `git diff --name-only --diff-filter=d <baseBranch>...HEAD` を既存 `spawnGit`（同ファイル内）経由で実行し、空行を除いた repo-root 相対 POSIX パスの配列を返す。
  - `baseBranch` 未指定時は `"main"` を既定にする（`getChangedFilesAndLines` と同じ）。
  - git 失敗時は既存 `getChangedFilesAndLines` と同じく **throw** する（呼び出し側の gate が catch して skip に倒す。T-04）。
- [ ] 既存 `getChangedFilesAndLines` は**無改変**で残す（重複する 1 行の git 引数を避けるためのリファクタは本 request のスコープ外。既存 changed-lines テストを壊さない）。

**Acceptance Criteria**:
- `spawn` を注入したテストで、`git diff --name-only --diff-filter=d main...HEAD` の stdout から改行区切りのファイル配列が返る（末尾空行・空文字を除く）。
- git 非 0 終了 / spawn error で throw する。
- 既存 `tests/unit/core/verification/*changed-lines*` 系テスト（存在する範囲）が無変更で green。`typecheck` が green。

## T-03: 判定コア `evaluateLockfileSync`（純関数）を追加する

- [ ] `src/core/verification/lockfile-sync.ts`（新規）に依存関連セクション比較ヘルパを追加する:
  - 定数 `DEP_SECTION_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions", "packageManager"]`。
  - `depSectionsDiffer(basePkg: unknown, headPkg: unknown): boolean` — base/HEAD の parse 済み package.json（`null` 可）から `DEP_SECTION_KEYS` の各値を取り出し、**key を再帰的にソートした canonical JSON** に落として比較する。1 つでも異なれば `true`。
    - `basePkg` が `null`（base に当該 package.json が無い = 新規追加）→ base 側 7 セクションは全て未定義扱い。
    - canonical 化で key 並び替えのみの差は吸収する（偽陽性を作らない）。
- [ ] `src/core/verification/lockfile-sync.ts` に純関数
  `evaluateLockfileSync(input: { depChangedPackageJsons: string[]; lockfileInChangeSet: boolean; lockfileTracked: boolean; pm: PackageManager }): { status: "passed" | "failed" | "skipped"; stdout: string }` を追加する。決定表（design D3）:
  - `depChangedPackageJsons` が空 → `skipped`（依存変更のある package.json なし）。
  - 依存変更あり + `lockfileInChangeSet === true` → `passed`（lockfile 同期済み）。
  - 依存変更あり + lockfile 含まれず + `lockfileTracked === false` → `skipped`（repo が lockfile を追跡していない旨を stdout に明示）。
  - 依存変更あり + lockfile 含まれず + `lockfileTracked === true` → `failed`。stdout に **`<pm> install` を実行して更新された lockfile を commit する**手順と、依存変更のあった package.json パス一覧を含める。
- [ ] `status` に応じた human-readable な `stdout` を生成する（fail 時は対象 package.json と同期手順を列挙）。

**Acceptance Criteria**（純関数を直接テスト、`typecheck && test` green）:
- **#935 シナリオ歯**: `depChangedPackageJsons: ["package.json"]`, `lockfileInChangeSet: false`, `lockfileTracked: true`, `pm: "bun"` → `failed` で、`stdout` に `bun install` と「lockfile を commit」する旨が含まれる。
- 依存変更あり + `lockfileInChangeSet: true` → `passed`。
- `depChangedPackageJsons: []`（scripts / version のみの変更を含む上流を想定）→ `skipped`（fail にならない）。
- 依存変更あり + lockfile 含まれず + `lockfileTracked: false` → `skipped`（stdout に非追跡の明示）。
- `depSectionsDiffer`: `dependencies` に追加がある base/HEAD → `true`。`scripts` / `version` のみ異なり依存 7 セクション同一の base/HEAD → `false`。key 並び替えのみ → `false`。base=`null` かつ HEAD に依存あり → `true`。

## T-04: gate orchestrator `runLockfileSyncGate` を追加する

- [ ] `src/core/verification/lockfile-sync.ts` に phase 名定数 `LOCKFILE_SYNC_PHASE = "lockfile-sync"` と orchestrator
  `runLockfileSyncGate(options: { slug: string; cwd: string; baseBranch: string; spawn?: SpawnFn; fsLike?: { existsSync(path: string): boolean } }): Promise<PhaseResult>` を追加する。手順:
  1. `getChangedFileList({ cwd, baseBranch, spawn })`（T-02）で変更ファイル集合を得る。**throw したら** `PhaseResult { phase: LOCKFILE_SYNC_PHASE, status: "skipped", exitCode: null, stdout: "<diff unavailable — lockfile 同期を検証できませんでした（fail はさせません）> …", ... }` を返す（design D6、silent pass にしない）。
  2. 変更集合から (a) `package.json` で終わるパス集合、(b) `isLockfileName(basename(f))` が真のファイルが 1 つでもあるか（`lockfileInChangeSet`）を求める。
  3. (a) が空 → `skipped`（package.json 変更なし）を返す。
  4. (a) の各 package.json について、base 版を `git show <baseBranch>:<path>`（差し替え可能 `spawn`、env は `stripSecrets`。失敗時 `null`）で、HEAD 版を `node:fs/promises` の `path.join(cwd, <path>)` 読取（失敗時 `null` → 当該ファイルは対象外）で取得し、`JSON.parse`（try/catch、HEAD parse 不能は「依存変更なし」扱い）した上で `depSectionsDiffer` を評価。差がある package.json パスを `depChangedPackageJsons` に集める。
  5. `lockfileTracked` を `findLockfile(cwd, fsLike) !== null || lockfileInChangeSet` で求め、`pm` を `findLockfile(cwd, fsLike)?.pm ?? (await detectPackageManager(cwd)).pm` で求める（design D5）。
  6. `evaluateLockfileSync({ depChangedPackageJsons, lockfileInChangeSet, lockfileTracked, pm })`（T-03）を呼び、`PhaseResult`（`exitCode`: passed=0 / failed=1 / skipped=null、`durationMs` 計測）にマップして返す。
- [ ] git spawn は runner / changed-lines と同じく `node:child_process.spawn` を直接使い（`checkPackageJsonScriptsIntegrity` と同じ前例）、`spawn` を引数注入してテスト可能にする。

**Acceptance Criteria**（一時ディレクトリ + 注入 `spawn`/`fsLike` でテスト、`typecheck && test` green）:
- 変更集合 `["package.json"]` + `git show` の base に依存なし + HEAD ディスクに依存追加 + repo に lockfile 存在（`fsLike`）→ `failed`、stdout に `<pm> install` 手順。
- 変更集合 `["package.json", "bun.lock"]` + 依存追加 → `passed`。
- 変更集合 `["packages/foo/package.json"]`（workspace）+ 依存差 + lockfile 非含 + 追跡あり → `failed`（workspace 配下も検出）。
- `getChangedFileList` が throw する `spawn` → `skipped`、stdout に検査不能（diff unavailable）の明示。
- lockfile を持たない一時ディレクトリ（`findLockfile` null）+ 依存追加 + lockfile 非含 → `skipped`、stdout に非追跡の明示。
- `package.json` を含まない変更集合 → `skipped`。

## T-05: runner の commands 経路 / phases 経路に gate を配線する

- [ ] `src/core/verification/runner.ts` の `runVerificationCommands` と `runVerificationPhases` の**両方**で、主検証ループ・changed-line-coverage gate の**後**（verdict 集約の前）に、`baseBranch !== undefined` のときのみ lockfile-sync gate を配置する（design D2）:
  - 先行が failed（fail-fast）→ `LOCKFILE_SYNC_PHASE` を status `skipped`（stdout: previous phase/command failed）で push する。
  - 先行が全 passed → `runLockfileSyncGate({ slug, cwd, baseBranch })` を実行し、返った `PhaseResult` を `phases` に push する。`status === "failed"` なら `failed = true`。
  - `baseBranch === undefined` → gate を push しない（既存挙動を保つ）。
- [ ] gate phase は既存 verdict 集約（`some(status === "failed")`）に含まれること（push は集約の前）。`writeVerificationResult` は gate の `skipped`/`failed` stdout を表示するため追加改修は不要（確認のみ）。

**Acceptance Criteria**:
- `baseBranch` 指定時、commands 経路 / phases 経路の**両方**で `lockfile-sync` phase が実行され verdict に反映される（新規テストで固定。`runLockfileSyncGate` を mock し呼び出しと verdict 反映を確認、`runner-coverage-gate.test.ts` の gate-mock 方式に倣う）。
- `baseBranch` 未指定時、`lockfile-sync` phase は結果に現れない（新規テストで固定）。
- 先行 phase/command が failed のとき `lockfile-sync` phase は `skipped`。
- 既存の `tests/unit/core/verification/runner.test.ts` / `tests/unit/verification/runner-commands.test.ts` / `tests/unit/core/verification/runner-coverage-gate.test.ts` / `runner-integrity.test.ts` / `runner-git-show-env.test.ts` / `runner-skip-detect.test.ts` / `runner-path-mask.test.ts` が**無変更で green**。

## T-06: implementer の user message に lockfile 同期指示を追記する

- [ ] `src/core/step/implementer.ts` の `buildImplementerInitialMessage` の**両分岐**（`testsMaterialized === true` の implementation-only mode と、default の TDD mode）の手順に、「依存を追加・変更した場合は lockfile（`bun.lock` / `package-lock.json` 等）を同期してから完了する」旨の 1 手順を明記する。
  - 既存の番号付き手順の並び・`end_turn` 手順・`Original request` ブロックを壊さない位置に挿入する。
  - system prompt（`IMPLEMENTER_SYSTEM_PROMPT`）ではなく user message に置く（要件 4 の指定）。build-fixer / code-fixer には追加しない（スコープ外）。

**Acceptance Criteria**:
- `buildImplementerInitialMessage(... testsMaterialized: true)` と `... testsMaterialized: false` の双方の返り値に、lockfile 同期を指示する文言が含まれる（新規テストで固定。`tests/unit/step/implementer.test.ts` か `tests/prompts/implementer-system.test.ts` の近傍に配置）。
- 既存の implementer prompt / step テストが無変更で green。

## T-07: 受け入れ基準を新規テストで固定し、全体を検証する

- [ ] request の受け入れ基準を、対応するテストで固定する（T-01〜T-06 の各 Acceptance に列挙したテストの網羅確認）:
  - 依存追加 + lockfile 変更なし → gate fail + 同期手順を含む（#935 歯、T-03/T-04）。
  - 依存追加 + lockfile 変更あり → pass（T-03/T-04）。
  - scripts / version のみの package.json 変更 → 非 fail（T-03 `depSectionsDiffer` / evaluator）。
  - lockfile 非追跡 repo → skip、diff unavailable → fail せず検査不能を明示（T-04）。
  - workspace 配下 package.json の依存変更でも検出（T-04）。
  - commands 経路・phases 経路の両方で gate が呼ばれる（T-05）。
  - implementer prompt に lockfile 同期指示が含まれる（T-06）。
- [ ] `package.json` に**新規 runtime 依存が追加されていない**ことを確認する（`dependencies` 差分なし。gate 実装は `node:*` + 既存 util のみ）。
- [ ] 既存テストが無変更で green であることを確認する。
- [ ] `bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- request の受け入れ基準（#935 歯 / 依存+lockfile→pass / scripts・version→pass / 非追跡→skip・unavailable→検査不能明示 / workspace 検出 / 両経路 / prompt 指示 / 新規依存なし / 既存テスト無変更 green）が全てテストで固定される。
- `bun run typecheck && bun run test` が green。
