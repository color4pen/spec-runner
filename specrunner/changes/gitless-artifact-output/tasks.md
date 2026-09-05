# Tasks: Git非依存 artifact-output profile

実装順序は T-01 → T-12。T-01〜T-05 は純粋 module（I/O なし）、T-06〜T-09 が I/O と orchestration、T-10〜T-11 が検証、T-12 が説明面。

**全タスク共通の遵守事項**（`architecture/model.md` 由来）:

- 新規 module は `node:child_process` を直接 import しない（B-12）。subprocess は注入された seam 型（`SpawnFn` を `import type` で参照）越しにのみ使う。
- 新規 module は `process.cwd()` を呼ばない（CWD ratchet）。path はすべて引数で受け取る。
- 新規 module は `src/adapter/**` を import しない（B-1）。stdout / stderr へ直接書かない（B-7、必要なら `logger/stdout` seam 経由）。
- `src/core/artifact-output/**` と `src/core/snapshot/**` は `util/git-exec` / `core/worktree/**` / `adapter/github/**` / `kernel/github-client` / `src/git/**` を **value import しない**（`DynamicContext` 等の type-only import は可）。

---

## T-01: unified diff / text 判定の leaf util を追加する

- [ ] `src/util/unified-diff.ts` を新規作成する（leaf 層 — 何も import しない）
- [ ] `classifyContent(bytes: Uint8Array): "text" | "binary"` を実装する: NUL byte を含む、または UTF-8 として decode できない場合 `binary`
- [ ] `buildUnifiedDiff(oldText, newText, opts: { oldPath, newPath, context?: number })` を実装する: LCS ベースで hunk を生成し、`--- <oldPath>` / `+++ <newPath>` / `@@ -a,b +c,d @@` の標準 unified 形式を返す。context 既定は 3
- [ ] 追加のみ（旧側なし）・削除のみ（新側なし）・末尾改行なし（`\ No newline at end of file`）・空 file を扱えるようにする
- [ ] 改行コードは byte 列として保持し、CRLF を LF へ正規化しない
- [ ] 生成した diff が `src/core/verification/changed-lines.ts` の `parseUnifiedDiffChangedLines` で解釈できる hunk header 形式であることを test で確認する
- [ ] unit test を `src/util/__tests__/unified-diff.test.ts` に置く

**Acceptance Criteria**:
- `src/util/unified-diff.ts` は import 文を 1 つも持たない
- 同一入力に対して常に同一の diff 文字列を返す（決定的）
- binary bytes（NUL 含む）に対して `classifyContent` が `binary` を返す
- 生成 diff の hunk header が `parseUnifiedDiffChangedLines` で解析でき、変更行番号が一致する
- 追加のみ / 削除のみ / 末尾改行差分 / 空 file の 4 ケースが unit test で covered

---

## T-02: snapshot の型契約と digest 計算（純粋）を実装する

- [ ] `src/core/snapshot/types.ts` を新規作成し、次を定義する:
  - `SnapshotEntryKind = "file" | "symlink" | "dir"`
  - `SnapshotEntry { kind, path, mode, contentDigest? , symlinkTarget?, size? }`
  - `DirectorySnapshot { schemaVersion, exclusions: readonly string[], entries: readonly SnapshotEntry[], digest }`
  - `SnapshotFailure { path, reason }`（reason は `"unreadable" | "unsupported-kind" | "path-not-utf8" | "symlink-escape" | "io-error"`）
  - `SnapshotResult = { kind: "ok"; snapshot } | { kind: "unavailable"; reason: string; failures: readonly SnapshotFailure[] }`
- [ ] `src/core/snapshot/digest.ts` に純関数を実装する:
  - `computeFileContentDigest(bytes)` / `computeSymlinkDigest(target)`（`sha256:<hex>`）
  - `computeSnapshotDigest(schemaVersion, exclusions, entries)`: entry を path の UTF-8 byte 昇順に並べ、`kind \0 path \0 mode \0 contentDigest \n` を streaming で SHA-256 に流す。巨大な中間文字列を作らない。dir エントリは contentDigest を持たないが **フィールド区切りの `\0` は保持し contentDigest を空文字列**とする（`dir\0<path>\040000\0\n`）。この形式を唯一の正規形として実装し、`\0` を省略した形式と混在させない
  - mode 表現: file は `100644` / `100755`、symlink は `120000`、dir は `40000`
- [ ] digest 入力に時刻・絶対 path・inode・owner・umask・traversal 順を含めない
- [ ] unit test を `src/core/snapshot/__tests__/digest.test.ts` に置く

**Acceptance Criteria**:
- `computeSnapshotDigest` は entry 配列の入力順を入れ替えても同じ digest を返す
- executable bit の変化、symlink target の変化、空 directory entry の増減で digest が変化する
- exclusions を変えると digest が変化する（exclusion が identity の一部である）
- digest は `sha256:` + 64 hex 文字である
- `digest.ts` は fs / child_process を import しない

---

## T-03: source / candidate の snapshot 収集を fail-closed で実装する

- [ ] `src/core/snapshot/collect.ts` を新規作成し、`collectSnapshot(root: string, opts: { exclusions: readonly string[] }): Promise<SnapshotResult>` を実装する
- [ ] traversal は `lstat` ベースで symlink を追跡しない。file / symlink / dir 以外の entry kind は `unsupported-kind` failure として収集する
- [ ] symlink の target を解決し、root の外を指す（絶対 path または `..` で外へ出る）場合は `symlink-escape` failure とする
- [ ] path を root からの相対 POSIX path へ正規化する（先頭 `./` なし・区切り `/`）。Unicode 正規化はしない。UTF-8 として解釈できない path は `path-not-utf8` failure とする
- [ ] exclusion は path prefix 一致（`".git/"` 形式）で適用し、適用した exclusion 一覧を snapshot に保持する。既定 exclusion は `[".git/"]` を定数として `src/core/snapshot/types.ts` に置き、呼び出し側が上書きできるようにする
- [ ] failure が 1 件でもあれば `{ kind: "unavailable", ... }` を返し、部分 snapshot を返さない
- [ ] 例外を外へ投げない（すべて DU の失敗 arm へ写す）
- [ ] 空 directory を entry として記録する
- [ ] unit test を `src/core/snapshot/__tests__/collect.test.ts` に置く（temp directory を使い、既存の `fs` spy setup と衝突しない形にする）

**Acceptance Criteria**:
- 読み取り不能な file を含む tree で `unavailable` が返り、`failures` に該当 path が入る
- fifo など unsupported kind を含む tree で `unavailable` が返る
- root 外を指す symlink を含む tree で `unavailable` が返る
- 正常な tree では entry が path byte 昇順で並び、`digest` が設定されている
- `.git/` 配下が既定で除外され、`snapshot.exclusions` にその規則が記録される
- どの入力でも例外を throw しない

---

## T-04: snapshot 比較（変更集合導出）を純関数で実装する

- [ ] `src/core/snapshot/compare.ts` を新規作成する
- [ ] `ChangeKind = "added" | "modified" | "deleted"`、`ChangeEntry { path, change, kind, previousKind?, mode?, previousMode?, baselineDigest?, candidateDigest?, symlinkTarget?, previousSymlinkTarget? }` を定義する
- [ ] `deriveChangeSet(baseline: DirectorySnapshot, candidate: DirectorySnapshot): ChangeSetResult` を実装する。`ChangeSetResult = { kind: "success"; changes: readonly ChangeEntry[] } | { kind: "unavailable"; reason: string }`
- [ ] kind 変化は `deleted` + `added` の 2 entry として表現する（`previousKind` を added 側に補助情報として持たせる）
- [ ] mode のみの変化は `modified` として表現する
- [ ] rename 推定を行わない（移動は delete + add）
- [ ] 出力順は path byte 昇順で決定的にする
- [ ] 比較対象の snapshot の `exclusions` が異なる場合は `unavailable`（比較不能）を返す
- [ ] unit test を `src/core/snapshot/__tests__/compare.test.ts` に置く

**Acceptance Criteria**:
- 追加・変更・削除がそれぞれ正しい `change` 値で導出される
- binary file の変更が `modified` として出力される（内容種別に依存しない）
- mode のみの変更が `modified` として出力され、`mode` と `previousMode` の双方が入る
- kind 変化（file → symlink）が `deleted` + `added` の 2 entry になる
- 移動が delete + add として表現され、rename entry が存在しない
- exclusions 不一致の snapshot 対では `unavailable` が返る
- `compare.ts` は fs / child_process を import しない

---

## T-05: execution profile capability と preflight（純粋）を実装する

- [ ] `src/core/artifact-output/execution-profile.ts` を新規作成する:
  - `EXECUTION_PROFILE_IDS = { GIT_PR: "git-pr", ARTIFACT_OUTPUT: "artifact-output" }`
  - `RuntimeCapabilityId`（少なくとも `git-revision` / `git-commit-attribution` / `git-remote-publish` / `github-api` / `branch-borne-state` / `changed-files`）
  - profile → provide する capability 集合のテーブル
  - `UNSUPPORTED_OPERATIONS`: artifact-output profile で明示 unsupported とする operation の宣言データ（id・表示名・理由）。少なくとも push / PR create / merge、feature branch への archive record、commit 採択と commit egress ledger、branch checkpoint からの remote reattach、issue 起点の unattended managed runtime、commit OID を要する operation を含める
  - `UNSUPPORTED_ENTRY_ROUTES`: issue 起点 start（`--from-issue`）と issue linkage（`--issue`）
- [ ] `src/core/artifact-output/preflight.ts` を新規作成し、`planEffectivePipeline(descriptor: PipelineDescriptor, profileId): EffectivePipelineReport` を実装する。`EffectivePipelineReport { profileId, pipelineId, supported: string[], unsupported: { step, missing: RuntimeCapabilityId[] }[], unsupportedOperations, executable: boolean }`
- [ ] step → require する capability のテーブルを同 module に data として置く（`if` の散在を作らない）。step 名は `STEP_NAMES` を参照し、文字列 hardcode を避ける
- [ ] `assertEntryRouteSupported({ fromIssue?: boolean; issueLinked?: boolean }, profileId)` を実装し、unsupported な入力経路を fail-closed に拒否する
- [ ] report を人間可読な文字列へ整形する `renderEffectivePipelineReport(report): string` を実装する（stdout へは書かない — 文字列を返すだけ）
- [ ] `git-pr` profile では既存 3 pipeline（standard / fast / design-only）の unsupported が空になるようテーブルを組む
- [ ] unit test を `src/core/artifact-output/__tests__/preflight.test.ts` に置く

**Acceptance Criteria**:
- `planEffectivePipeline(STANDARD_DESCRIPTOR, "git-pr")` の `unsupported` が空で `executable === true`
- `planEffectivePipeline(FAST_DESCRIPTOR, "git-pr")` / `DESIGN_ONLY_DESCRIPTOR` も同様に unsupported が空
- artifact-output profile では pr-create step が unsupported に現れ、`missing` に publish 系 capability が入る
- `assertEntryRouteSupported` が `--from-issue` / `--issue` を artifact-output profile で拒否し、`git-pr` profile では拒否しない
- preflight module は fs / child_process を import しない
- 既存 `src/core/pipeline/runtime-capability-gate.ts` に変更がない

---

## T-06: run workspace（run root・candidate materialize・source 不変 guard・git 拒否 spawn）を実装する

- [ ] `src/core/artifact-output/run-layout.ts` を新規作成し、run root 配下の path 解決関数を置く: `run.json` / `baseline/snapshot.json` / `candidate/` / `steps/` / `artifact.staging/` / `artifact/`。すべて引数 `runRoot` からの導出（`process.cwd()` を使わない）
- [ ] `createRunRoot(parentDir, runId)`: `<parentDir>/<runId>/` と必要な subdirectory を作成する。既存 directory があれば fail-closed
- [ ] `src/core/artifact-output/materialize.ts` を新規作成し、`materializeCandidate(sourceRoot, candidateRoot, snapshot): Promise<void>` を実装する:
  - baseline snapshot の entry 一覧を入力とし、entry に無い path を copy しない（exclusion が確実に効く）
  - symlink は追跡せず symlink として再作成、file の実行 bit を保存、空 directory も作成する
  - source へは一切書き込まない
- [ ] `src/core/artifact-output/source-guard.ts` を新規作成し、`assertSourceUnchanged(sourceRoot, baselineDigest, collect): Promise<SourceGuardResult>` を実装する。`SourceGuardResult = { kind: "unchanged" } | { kind: "mutated"; currentDigest } | { kind: "unverifiable"; reason }`（snapshot 不能は `unchanged` に畳まない）
- [ ] `src/core/artifact-output/guarded-spawn.ts` を新規作成し、`createGitDenyingSpawn(inner: SpawnFn): SpawnFn` を実装する。command の basename が `git` / `gh` の場合は inner を呼ばずに error を投げる。error message に「agent subprocess 内部の git 呼び出しは本 guard の対象外」である旨を含める
- [ ] `SpawnFn` は `src/util/spawn.ts` から `import type` で参照する（value import しない）
- [ ] unit test を `src/core/artifact-output/__tests__/` 配下に置く

**Acceptance Criteria**:
- `materializeCandidate` 後、candidate の snapshot digest が baseline digest と一致する
- materialize が symlink を追跡せず、symlink entry として再作成する
- materialize 実行の前後で source directory の digest が不変
- `assertSourceUnchanged` が変更を検出し、snapshot 不能時は `unverifiable` を返す（`unchanged` にしない）
- `createGitDenyingSpawn` が `git` / `gh` を実行せず error を投げ、他の command は inner に委譲する
- 新規 module に `node:child_process` の import が無い
- materialize 後の candidate に candidate root 外を指す symlink が存在しない（baseline snapshot の symlink-escape failure が materialize 前に fail-closed で停止することで保証。T-03 の path 正規化への暗黙依存ではなく、本 AC として明示）

---

## T-07: patch・manifest・artifact writer（atomic finalize）を実装する

- [ ] `src/core/artifact-output/patch.ts` を新規作成し、変更集合 + 内容読み取り seam から `changes.patch` 文字列と entry ごとの patch 分類（`included` / `omitted:binary` / `omitted:size` / `not-applicable`）を返す関数を実装する。size 上限は定数として宣言し manifest に出力する
- [ ] 削除された text file は削除 hunk として patch に含める
- [ ] `src/core/artifact-output/manifest.ts` を新規作成し、`buildManifest(input): ArtifactManifest` を純関数として実装する。必須欄は design D9 の一覧（schemaVersion / profile / runId / source root と exclusions / baseline digest / candidate digest / 変更 entry 配列 / unsupported 配列 / patch coverage と size 上限 / verification 参照と束縛 digest / review 参照と束縛 digest / resume 可否 / unsupported operation 一覧）
- [ ] `src/core/artifact-output/artifact-writer.ts` を新規作成し、`finalizeArtifact(...)` を実装する:
  - `artifact.staging/` に `manifest.json`・`changes.patch`・`payload/`（added / modified の candidate 内容を path 構造のまま）・`verification.json`・`review.json`・`APPLY.md` を書く
  - すべて書き終えてから `artifact/` へ rename する
  - payload としても patch としても表現できない entry があれば finalize せず fail-closed
  - source directory へは書かない
- [ ] `APPLY.md` は適用手順・unsupported entry の有無・「自動適用しない」「適用は baseline digest 一致が前提」を明記する
- [ ] JSON 書き込みは `src/util/atomic-write.ts` の既存 helper を使う（無い形式は fs で書いたうえで staging→rename に依存する）
- [ ] unit test を `src/core/artifact-output/__tests__/` 配下に置く

**Acceptance Criteria**:
- 成功時に `artifact/` へ manifest / patch / payload / verification record / review record / APPLY.md が揃う
- finalize 途中で失敗させた場合 `artifact/` が存在せず、`artifact.staging/` の残骸が成功と誤認されない
- binary 変更が patch から除外され、payload に candidate bytes が存在し、manifest に `omitted:binary` として現れる
- symlink 変更・mode のみの変更が manifest に metadata（target / mode）付きで現れる
- 削除 entry が manifest と patch の両方に現れる
- 表現不能 entry がある場合 finalize が失敗し `artifact/` が作られない
- `APPLY.md` に「自動適用しない」「baseline digest 一致が前提」の記述がある

---

## T-08: snapshot 由来 context と revision 束縛を実装する

- [ ] `src/core/artifact-output/context.ts` を新規作成し、`buildSnapshotContext({ baselineDigest, candidateDigest, changes, unsupported, patchExcerptLimit })` を純関数で実装する。出力は agent / reviewer prompt へ差し込める 1 block の文字列 + 構造体
- [ ] 履歴が存在しないことを明示する文言を含める（空文字にしない）
- [ ] `src/core/artifact-output/revision-binding.ts` を新規作成し、`runBoundToCandidateRevision(freeze, execute)` 相当の helper を実装する: 実行前 snapshot → digest 確定 → 実行 → 実行後 snapshot → digest 照合 → 一致時のみ `{ kind: "bound", digest, result }`、不一致は `{ kind: "revision-drift", before, after }`、snapshot 不能は `{ kind: "unavailable", reason }`
- [ ] verification record / review record の型（baselineDigest / candidateDigest / outcome / findings 等）を定義し、束縛 digest を必須 field にする
- [ ] unit test を `src/core/artifact-output/__tests__/` 配下に置く

**Acceptance Criteria**:
- context 文字列に baseline digest・candidate digest・変更 path 一覧・patch 非表現 entry 一覧が含まれる
- context の履歴セクションが空文字ではなく明示文言である
- 実行中に candidate を変更する fake を渡すと `revision-drift` が返る
- 変更しない fake では `bound` が返り、束縛 digest が実行前 digest と一致する
- snapshot 不能時に `bound` を返さない
- verification record / review record は digest 欄なしでは構築できない（型で必須）

---

## T-09: ArtifactOutputRun（最小縦断 orchestrator）を実装する

- [ ] `src/core/artifact-output/run.ts` を新規作成し、`runArtifactOutput(input): Promise<ArtifactOutputRunResult>` を実装する
- [ ] 入力（すべて注入。既定値で環境へ触れない）:
  - `sourceRoot` / `runParentDir` / `runId` / `requestFilePath`（または request 内容）/ `exclusions`
  - `pipelineDescriptor` と `profileId`
  - seams: `agent`（candidate に対する変更を行う関数）/ `verify`（command 実行 seam）/ `review`（reviewer seam）/ `spawn`（guarded 化して渡す）/ `now`（時刻取得）
- [ ] 実行順（request の最小実測スコープ 1〜9 に対応）:
  1. preflight（T-05）→ 実行不能なら candidate を作らずに停止し report を結果へ載せる
  2. request 読込
  3. baseline snapshot（source）→ `baseline/snapshot.json` へ evidence 出力
  4. run root / candidate 作成 + materialize（T-06）
  5. agent 実行（candidate に対して追加・変更・削除）
  6. verification（T-08 の revision 束縛で実行）
  7. 変更集合と patch の導出（T-04 / T-07）: **step 6 の revision 束縛が返した frozen candidate snapshot を再利用する（candidate を再走査しない）**。再走査を行うと step 6 終了〜step 7 間の第三者変更により change set 導出に用いる candidate digest と verification record の bound digest が乖離するため、構造的に禁止する
  8. reviewer へ snapshot 由来 context を提示（T-08 の revision 束縛で実行）
  9. artifact finalize（T-07）→ 終了時の source 不変検証（T-06）
- [ ] 各 phase の duration・entry 数・走査 byte 数・artifact / payload 容量・patch 行数を metrics として集計する
- [ ] `run.json` に status（`running` → `completed` / `halted` / `failed`）・phase・digest・metrics・preflight report・`resume: { supported: false }` を書く。halt / failure でも必ず確定させる
- [ ] 成功・失敗・halt のいずれの経路でも終了時に source 不変検証を行い、`source-mutated` を検出したら結果を fail 扱いにする
- [ ] 途中失敗時に `artifact/` を作らない
- [ ] 例外は最終的に結果 DU（`{ kind: "completed" | "halted" | "failed", ... }`）へ写し、呼び出し側に throw を強制しない
- [ ] unit / narrow test を `src/core/artifact-output/__tests__/run.test.ts` に置く

**Acceptance Criteria**:
- preflight が実行不能を返す入力では candidate directory が作られない
- 正常系で 9 phase すべてが実行され、結果に baseline digest / candidate digest / artifact path / metrics が含まれる
- verification 失敗時に halt / failed として `run.json` が確定し、`artifact/` が作られない
- `run.json` に `resume.supported === false` が記録される
- run 内で spawn seam を使う経路はすべて guarded spawn 越しである
- run module が GitHub client を型としても受け取らない
- change set 導出に使った candidate digest が verification record の bound digest と等しい（step 6 の frozen snapshot を再利用し、step 7 で candidate を再走査しないことで構造的に保証）

---

## T-10: Git repository 外 fixture での最小縦断 integration test を追加する

- [ ] `tests/artifact-output-vertical.test.ts` を新規作成する
- [ ] fixture を `fs.mkdtemp(os.tmpdir())` 配下に作り、fixture root から上位に `.git` が存在しないことを test 内で assert する（存在したら fail、skip しない）
- [ ] fixture 内容: text file 複数・binary file（NUL 含む）・実行 bit 付き file・symlink（root 内を指す）・空 directory・後で削除される file
- [ ] fake agent は candidate に対して「追加 / 変更 / 削除 / binary 変更 / mode 変更 / symlink 追加」を行う
- [ ] verification seam は記録付きの実行 seam を注入し、実行された command 列を記録する
- [ ] reviewer seam は受け取った context から candidate digest を抽出して verdict record に載せる
- [ ] 成功ケース: 9 phase 完走 → artifact 一式の存在 → manifest の added / modified / deleted → binary / symlink / mode 変更の欠落なし → verification / review record の digest が manifest の candidate digest と一致 → source digest が baseline と一致
- [ ] 失敗ケース: verification を失敗させ、`artifact/` 不在・`run.json` の terminal status・source digest 不変を確認する
- [ ] fail-closed ケース: snapshot を不能にした状態（読めない entry を含む fixture）で run が「変更なし」で成功しないことを確認する
- [ ] escape symlink fail-closed ケース: fake agent が candidate に candidate root 外を指す symlink（`../` を含む相対ターゲット）を追加し、その後の revision 束縛 snapshot が `unavailable` を返し run が halt することを確認する（`revision-drift` または `unavailable` で停止し、artifact が作られないこと）
- [ ] 規模ケース: 小 file を多数（CI で許容できる範囲、例 1000 件程度）持つ fixture で完走し、metrics（duration / entry 数 / byte 数 / artifact 容量）が欠落なく出ることを確認する。実測値そのものは assert しない
- [ ] 生成した temp directory を後始末する

**Acceptance Criteria**:
- fixture root の祖先に `.git` が無いことが test 内で assert される
- 成功ケースで manifest に added / modified / deleted がすべて出力される
- 成功ケースで `changes.patch` に削除 hunk が存在する（deleted entry の patch 表現が end-to-end で欠落しない。TC-021 の integration 分類の意図を縦断で充足する）
- binary / symlink / mode 変更が manifest と payload から欠落しない
- verification record と review record の束縛 digest が manifest の candidate digest と一致する
- 成功ケース・失敗ケースの双方で source directory の digest が baseline と一致する
- 失敗ケースで `artifact/` が存在しない
- snapshot 不能ケースが「変更なし成功」にならない
- escape symlink fail-closed ケースで run が halt し `artifact/` が作られない
- 規模ケースで metrics の全 field が欠落なく出力される

---

## T-11: Git 非依存性と既存 profile 非干渉の機械検証 test を追加する

- [ ] `tests/unit/architecture/artifact-output-git-free.test.ts` を新規作成する
- [ ] 縦断（T-10 と同じ seam を使う軽量 run）で記録した spawn の command 列に `git` / `gh` が 0 件であることを assert する
- [ ] `src/core/artifact-output/**` と `src/core/snapshot/**` に対する grep 検査:
  - `util/git-exec` / `core/worktree/` / `adapter/` / `github-client` / `src/git/` の value import が 0 件（`import type` 行は除外）
  - `node:child_process` の import が 0 件
  - `process.cwd()` の出現が 0 件
- [ ] 逆方向の検査: `src/core/runtime/**` / `src/core/pipeline/**` / `src/core/step/**` から `core/artifact-output` / `core/snapshot` への import が 0 件
- [ ] `git-pr` profile での preflight が既存全 pipeline に対して unsupported 0 件・executable true であることを assert する（既存挙動不変の固定）
- [ ] `RUN_JOB_FLAGS` の flag 集合が本 change の前後で不変であることを assert する（`--source` を足していないことの固定）

**Acceptance Criteria**:
- 縦断実行中に SpecRunner 自身が発行した spawn に git / gh が 1 件も無いことが機械的に assert される
- 新規 module tree に git / GitHub / child_process / `process.cwd()` の到達経路が無いことが grep で assert される
- 既存 runtime / pipeline / step から新規 module への import が 0 件である
- `git-pr` profile の preflight が全既存 pipeline で unsupported 0 件
- `job start` の flag 集合が変更されていないことが assert される

---

## T-12: 説明面（guide topic / README）と実測レポートを整備する

- [ ] `src/core/command/guide.ts` に `artifact-output` topic を追加する。body は次を含める:
  - source directory を入力に取り、artifact を出力する profile であること
  - `--no-worktree` との違い（`--no-worktree` は repository root で実行する git 前提モード、artifact-output は git を authority として参照しない）
  - 提供する保証（source 不変・snapshot digest による revision identity・変更の欠落なし・fail-closed）
  - 提供しない保証（resume なし・branch borne state なし・remote reattach なし・PR 出力なし）
  - unsupported operation 一覧（`UNSUPPORTED_OPERATIONS` テーブルから map 生成する。文字列を手書きで二重管理しない）
  - 「git を呼ばない」の検証対象は SpecRunner 自身の spawn であり、agent subprocess 内部の git は対象外であること
  - 現状は preview であり `job start --source <dir>` は未配線であること
- [ ] body 内で参照する command は既存 registry に存在するものだけにする（既存 guide test の command 解決検査に適合させる）
- [ ] `src/core/command/__tests__/guide.test.ts` の topic 件数を数える TC（9 件 → 10 件）を更新する。件数以外の既存 assertion は壊さない
- [ ] `src/core/command/__tests__/guide.test.ts`（または新規 test）に「`UNSUPPORTED_OPERATIONS` の全項目が topic body に現れる」検査を追加する
- [ ] README に artifact-output profile の節を追加する（`## Runtime Modes` の近傍）。`--no-worktree` との違い・保証・unsupported operation・preview 状態・`specrunner guide artifact-output` への導線を書く
- [ ] `docs/artifact-output-profile.md` を新規作成し、次を記録する:
  - profile 契約の要約（authority / revision identity / lifecycle / 保証差分）
  - Git が現在担う責務の分類表（snapshot で置換 / profile 固有 / 初期 unsupported）— design の Context 表の call site を分類する
  - Git 前提で停止した call site
  - 置換できた保証 / 置換できない保証
  - 新しい runtime / profile 境界
  - 実測結果（T-10 の規模ケースで観測した時間・容量・支配的コスト）を実際に run して転記する
  - 続行 / scope 縮小 / 中止の判断と根拠
  - 次段階の分割 Issue 案（CLI 配線 / 実 agent 配線と overlay 契約 / apply command / 同一 machine resume / incremental snapshot）
- [ ] docs の `guarantees.md` など既存 doc の記述と矛盾しないことを確認する（矛盾があれば docs 側に profile 差分の 1 行を足す）

**Acceptance Criteria**:
- `specrunner guide artifact-output` が topic を表示し、body が非空である
- topic body に `UNSUPPORTED_OPERATIONS` の全項目が含まれることが test で assert される
- topic body に `--no-worktree` との違いと「agent subprocess 内部の git は対象外」の記述がある
- 既存 guide test（topic 件数 / 一覧導出 / command 解決）が green である
- README に artifact-output の節があり、preview 状態と guide への導線が書かれている
- `docs/artifact-output-profile.md` に責務分類表・実測値・続行判断・次段階 Issue 案が揃っている
- `bun run typecheck` / `bun run lint` / `bun run test` が green
