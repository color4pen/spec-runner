# Design: verification に lockfile 整合 gate を追加する

## Context

implementer が `package.json` に依存を追加しても、lockfile（`bun.lock` / `package-lock.json` 等）を同期しないことがある。pipeline 内の verification は worktree 生成時に install 済みの `node_modules` で走るため、依存が既にディスク上に存在しテストは green になる。lockfile の不整合は **CI（frozen-lockfile install）まで顕在化しない**（issue #935）。PR が merge 直前で fail し、手動で lockfile を作り直す羽目になる。

既存の frozen-lockfile 安全網は `postMergeVerify`（`src/config/schema/types.ts:375`、archive `--with-merge` 後に base branch で実行）のみで、検出時点が merge 後＝手遅れである。verification 内に lockfile 整合の機械検査を置き、発生源（implementer の commit 直後）で決定的に検出する。

### 現状構造（変更の土台）

- **分岐**: `runVerification(slug, cwd, verificationConfig?, baseBranch?)`（`src/core/verification/runner.ts:323`）が `verification.commands` の有無で `runVerificationCommands`（`:345`）/ `runVerificationPhases`（`:453`）に分岐する。両関数とも `baseBranch` を受け取る。
- **後段 gate の前例**: changed-line-coverage gate は **commands / phases 両経路の主検証の後段**から呼ばれる（`:398`・`:599`）。対照的に package-json-integrity（`:459-485`）は phases 経路のみで commands 経路に漏れがある。新 gate は前者（両経路）を範とする。
- **verdict 集約**: 両経路とも `phases` 配列に対し `some(status === "failed")` → failed、全 skipped → `VERIFICATION_NO_RUNNABLE_PHASES`。gate phase を push した後に集約される。
- **結果出力**: `writeVerificationResult`（`:130`）が verification-result.md を生成。`skipped` phase は stdout があればそれを表示し（`:184-190`）、`failed` phase は `Step '<phase>' failed` + stdout を表示する。→ gate の note / メッセージは build-fixer が読める。
- **既存 seam**:
  - 変更ファイル導出: `getChangedFilesAndLines`（`src/core/verification/changed-lines.ts:125`）が `git diff --name-only --diff-filter=d <baseBranch>...HEAD` で変更（削除除く）ファイル集合を得る。純粋 hunk パーサ + 差し替え可能 `spawn` の薄いラッパ構成。`runtimeStrategy.listChangedFiles`（`src/core/port/runtime-strategy.ts:479`）も同型の changed-files seam（managed は常に `unavailable`）。
  - package manager 検出: `detectPackageManager(cwd)`（`src/util/detect-pm.ts:48`）が lockfile 上向き探索で `{ pm, root }` を返す。`LOCKFILE_MAP`（`:25-31`、5 エントリ）が lockfile 名 → pm の対応表。
  - 直接 git spawn: `checkPackageJsonScriptsIntegrity`（`runner.ts:218`）が runner 内で `git show <ref>:package.json` を直接 spawn し base 版 package.json を取得する前例。env は `stripSecrets` で filter。
- **implementer prompt**: system（`src/prompts/implementer-system.ts:11-74`）にも user message（`src/core/step/implementer.ts:57-124`、`buildImplementerInitialMessage` の testsMaterialized / default 両分岐）にも依存追加・lockfile 同期の指示は無い。

## Goals / Non-Goals

**Goals**:

- verification の後段（changed-line-coverage gate と同じ **commands / phases 両経路**の位置）に新モジュールの lockfile 整合 gate を追加する。
- gate は **diff 形状検査**とする: base…HEAD の変更ファイル集合に `package.json`（workspace 配下を含む）があり、base 版と HEAD 版で**依存関連セクション**（`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` / `overrides` / `resolutions` / `packageManager`）の内容が異なるのに、同変更集合に lockfile（`LOCKFILE_MAP` 対象）が 1 つも含まれなければ当該 phase を **fail** にする。
- fail メッセージに、検出した package manager の同期手順（`<pm> install` を実行して lockfile を commit する）を案内する。
- 依存関連セクションに差の無い package.json 変更（`scripts` / `version` 等のみ）は **偽陽性を作らない**。
- lockfile 非追跡 repo（base にも HEAD にも `LOCKFILE_MAP` 対象が無い）は skip。diff が導出できない（`unavailable` 等）場合は fail させず、検査不能である旨を phase 結果に**明示**する（黙って pass 扱いにしない）。
- implementer の user message に「依存を追加・変更した場合は lockfile を同期してから完了する」を明記し、halt の発生自体を減らす。
- 既存 seam（detect-pm・changed-lines）を再利用し、新規 runtime 依存を追加しない。

**Non-Goals**（request のスコープ外を継承）:

- frozen-lockfile install の gate 内実実行（重い・`node_modules` 書き換え・network 依存のため却下）。
- `postMergeVerify` の変更（merge 後の安全網はそのまま）。
- JS 以外のエコシステム（`Cargo.lock` / `go.sum` 等）の lockfile 検査。
- build-fixer / code-fixer prompt への同種指示の追加（機械 gate が branch 全体 diff を見るため全 step の混入を検出できる）。
- lockfile の内容が package.json の依存解決として妥当かの検証（frozen install の領域）。gate は「lockfile が同変更集合に含まれるか」という**形状**のみを見る。

## Decisions

### D1: 検査は diff 形状検査（依存関連セクションの deep 比較）。frozen-lockfile install は実行しない

gate は次の 3 情報のみに依存する:

1. **変更ファイル集合**: base…HEAD で変更（削除除く）されたファイル名（`package.json` と lockfile の有無を見る）。
2. **base 版 / HEAD 版 package.json の依存関連セクション**: `git show <baseBranch>:<path>`（base）とディスク上の HEAD 版を parse し、依存関連 7 セクションを deep 比較する。
3. **lockfile 追跡の有無**: repo に `LOCKFILE_MAP` 対象ファイルが存在するか。

- **Rationale**: 軽量・package manager 非依存・決定的・network 不要。frozen install は検出能力は最強だが、重く destructive（`node_modules` 書き換え）で、読み取り検査という verification の性格に合わない。merge 後の安全網（`postMergeVerify`）に既に存在するため、発生源での検出は diff 形状で足りる。
- **Alternatives considered**: frozen-lockfile install の実実行 → 却下（request 記載、重い・destructive・network 依存）。prompt 指示のみ → 却下: agent の遵守頼みで再発する（D7 で二層化）。

### D2: 位置は changed-line-coverage gate と同型の「両経路後段」。baseBranch presence でガード

新 gate `runLockfileSyncGate` を、`runVerificationCommands` / `runVerificationPhases` の**両方**で、主検証（commands / script phases）と changed-line-coverage gate の**後**に配置する。先行検証が failed のときは他 gate と同じく fail-fast で `skipped` にする。

gate は `baseBranch !== undefined` のときのみ実行する（package-json-integrity と同じガード）。base ref が無ければ diff を導出できず検査は本質的に不能なため。production では `deps.request.baseBranch` が常に渡る（`src/core/step/verification.ts:49`）ので、実運用では常時起動する。

- **Rationale**: package-json-integrity（phases 経路のみ）を雛形にすると commands 経路（実運用の多数派）で漏れる。changed-line-coverage は両経路で呼ばれる前例なので、これと同型にすれば漏れが無い。baseBranch ガードは (a) 「base ref 無し = 検査不能」という意味論に一致し、(b) `baseBranch` 無しで `runVerification` を呼ぶ既存テスト群（`runner.test.ts` / `runner-commands.test.ts` の `phases.length` 厳密固定など）を無改変で保全する。
- **Alternatives considered**: baseBranch 未指定時に `"main"` 既定で無条件実行 → 却下: base ref を持たない既存テストで gate が発火し、`phases.length` 固定などを破る。config gate（coverage 同様の opt-in）→ 却下: 「発生源で決定的に検出」の動機に反する。gate は常時 on とし、非該当時は自己 skip（D6）する。

### D3: 判定は純関数の決定表。依存変更 × lockfile 変更 × lockfile 追跡

判定コア `evaluateLockfileSync` を純関数に切り出す。入力は「依存関連セクションが変わった package.json パス集合」「変更集合に lockfile が含まれるか」「repo が lockfile を追跡するか」「検出 pm」。

| 状態 | 判定 |
|------|------|
| 依存関連セクションが変わった package.json が **無い** | skipped（対象なし） |
| 依存変更あり + 変更集合に lockfile が **含まれる** | passed（同期済み） |
| 依存変更あり + lockfile 含まれず + repo が lockfile を **追跡しない** | skipped（非追跡 repo） |
| 依存変更あり + lockfile 含まれず + repo が lockfile を **追跡する** | **failed**（同期漏れ。`<pm> install` 手順を案内） |

- **Rationale**: 決定表を I/O から切り離すことで、受け入れ基準の各ケースを fixture で決定的に固定できる（Verify don't trust: observable な純関数出力で二重検証）。判定の主役は「依存変更があるのに lockfile が変更集合に無い」の一点。
- **Alternatives considered**: 判定を orchestrator に混ぜる → 却下: git / fs を毎テストで用意する必要が生じ、決定表の網羅が困難。fail の代わりに warning → 却下: CI fail という実害が既に出ているクラスであり、pipeline 内で build-fixer に routing される fail が正しい（fail → verification 失敗 → build-fixer の既存リトライ経路に乗る）。

### D4: 偽陽性回避 — 依存関連 7 セクションのみを canonical 比較する

`package.json` の変更検出は行 diff でなく**意味比較**にする。base 版・HEAD 版それぞれから依存関連 7 セクション（`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` / `overrides` / `resolutions` / `packageManager`）を抽出し、各セクションを **key を再帰的にソートした canonical JSON** に落として比較する。1 つでも異なれば「依存変更あり」と判定する。

- `scripts` / `version` / `name` 等の非依存セクションのみの変更は 7 セクションに差が出ないため fail しない（要件 2）。
- key の並び替えだけの変更は canonical 化で吸収し、偽陽性にしない。
- base 版が取得できない（base に当該 package.json が無い = 新規追加）場合、base 側 7 セクションは全て未定義として扱う。HEAD に依存があれば「依存変更あり」になる（新規 workspace パッケージの依存追加も lockfile 同期対象）。
- HEAD 版 package.json が parse 不能な場合は当該ファイルを「依存変更なし」として扱い gate を fail させない（malformed JSON は build/typecheck phase が拾う。lockfile gate は形状検査に徹する）。

- **Rationale**: 行 diff では `scripts` 変更と依存変更を区別できない。parse 済み deep 比較なら区別でき偽陽性を避けられる。
- **Alternatives considered**: `git diff --unified=0` の変更行に `"dependencies"` 等の文字列が含まれるかで判定 → 却下: 文字列一致は不安定（コメント・整形・部分一致）で偽陽性/偽陰性の温床。

### D5: 検査対象の導出は既存 seam を再利用。新規 runtime 依存なし

- **変更ファイル集合**: `changed-lines.ts` に薄い name-only ヘルパ `getChangedFileList({ cwd, baseBranch, spawn })` を追加する。`git diff --name-only --diff-filter=d <baseBranch>...HEAD` の結果（repo-root 相対 POSIX パス）を返す。既存 `getChangedFilesAndLines` と同じ module・同じ `spawnGit` seam・同じ fail-closed throw 方針を踏襲する（gate 側で throw を catch して skip に倒す。D6）。
- **base 版 package.json**: runner 既存の `git show <ref>:<path>` spawn 前例（`checkPackageJsonScriptsIntegrity`）に倣い、`git show <baseBranch>:<path>` を差し替え可能 `spawn` で実行する。env は `stripSecrets` で filter。
- **HEAD 版 package.json**: ディスク上の `path.join(cwd, <path>)` を `node:fs/promises` で読む（`checkPackageJsonScriptsIntegrity` と同じ）。
- **lockfile 追跡判定 / pm 検出**: `detect-pm.ts` に (a) lockfile 上向き探索を lockfile 有無だけ返す `findLockfile(cwd, fsLike?)`、(b) 変更集合中の lockfile 判定用 `isLockfileName(basename)` を追加する。既存 `detectPackageManager` は無改変で残し、`findLockfile` はその phase-1 ループを抽出した additive な兄弟関数とする。
- 使う外部依存は `node:child_process` / `node:fs/promises` / `node:path` と既存 util のみ。**新規 runtime 依存を追加しない**（要件 5）。

- **Rationale**: changed-lines seam と detect-pm seam は既に「diff 導出」「pm/lockfile 検出」の正典。新 gate 専用に別実装を起こさず、既存の一様な機構に data だけ足す。
- **Alternatives considered**: `runtimeStrategy.listChangedFiles` を使う → 却下: runner は step 層の非 CLI コンポーネントで `deps.runtimeStrategy` を持たず、既に git を直接 spawn する層。changed-line-coverage も同じ理由で `getChangedFilesAndLines` を直接使う。`getChangedFilesAndLines` を流用し `.keys()` だけ使う → 却下: 全変更ファイルに per-file unified diff を打つ無駄が生じる。name-only 専用ヘルパの方が軽い。

### D6: 非該当・検査不能は fail させず skipped + 明示 note（silent pass にしない）

gate が fail を返すのは D3 の「依存変更あり + lockfile 含まれず + lockfile 追跡あり」の一点のみ。以下は `skipped` にし、stdout に理由を明示する:

- **diff 導出不能**（`getChangedFileList` が throw = git 失敗 / managed 等で worktree diff 非導出）→ `skipped` + note「diff unavailable — lockfile 同期を検証できませんでした（fail はさせません）」。
- **lockfile 非追跡 repo**（`findLockfile` が null かつ変更集合に lockfile 無し）→ `skipped` + note「repo が lockfile を追跡していません」。
- **package.json 変更なし** / **依存変更なし** → `skipped` + note（対象なし）。

`skipped` は verdict を落とさず（`some(failed)` に数えられない）、他 phase が走る通常 run では `allSkipped` 判定にも影響しない。

- **Rationale**: fail-closed に倒すと managed 等 diff 非導出環境で全 run が止まる。CI 実害（lockfile 不整合）は「依存変更あり + lockfile 無し」の明確なケースのみで発生するので、そこだけ fail し、検査不能は可視化に留める。silent pass（何も出さず passed）は「検査不能」の事実を隠すため採らない。
- **Alternatives considered**: unavailable を failed（fail-closed）→ 却下（request 記載、全 run 停止）。unavailable を passed で無音 → 却下: 検査不能を隠す。skipped + note が「fail させず・可視化する」を同時に満たす。

### D7: prompt 指示（user message）と機械 gate の二層

implementer の user message（`buildImplementerInitialMessage` の testsMaterialized / default **両分岐**）の手順に「依存を追加・変更した場合は lockfile を同期してから完了する」を明記する。system prompt でなく user message に置くのは要件 4 の指定に従うため。build-fixer / code-fixer には足さない。

- **Rationale**: prompt は halt（gate fail → build-fixer routing）の発生頻度を下げる予防層、gate は漏れを決定的に止める検出層。二層で「予防 × 検出」を分担する。build-fixer 等に個別指示を足さなくても、gate は branch 全体 diff を見るため全 step が混入させた不整合を捕捉できる（要件のスコープ外に明記）。
- **Alternatives considered**: prompt 指示のみ → 却下: agent の遵守頼みで再発する。歯は機械検査。gate のみ（prompt 追加なし）→ 却下: 予防層が無いと gate fail → build-fixer リトライの往復が毎回発生し無駄。

### D8: pure evaluator と orchestrator の分離

- `evaluateLockfileSync(input): { status, stdout }` を純関数として決定表（D3）を実装する。受け入れ基準の各シナリオはこの純関数を直接叩いて固定する。
- `runLockfileSyncGate({ slug, cwd, baseBranch, spawn?, fsLike? }): Promise<PhaseResult>` が orchestration（変更集合導出 → base/HEAD 取得 → 依存セクション比較 → lockfile 追跡判定 → 純関数呼び出し → `PhaseResult` 生成）と D6 の skip 分岐を担う。phase 名は `"lockfile-sync"`、`PhaseResult.exitCode` は passed=0 / failed=1 / skipped=null。

- **Rationale**: 判定ロジックを I/O から切り離し、決定的な fixture テストで全分岐を固定する。changed-line-coverage（`evaluateChangedLineCoverage` + `runChangedLineCoverageGate`）と同じ pure/orchestrator 二分割に揃える。

## Risks / Trade-offs

- **[Risk] 新 phase 追加で既存 verification テストが壊れる** → **Mitigation**: D2 の `baseBranch` ガードで、`baseBranch` を渡さない既存テスト（`runner.test.ts` / `runner-commands.test.ts` の `phases.length` 厳密固定・`runner-skip-detect` / `runner-path-mask` / `runner-coverage-gate`）では gate が発火しない。`baseBranch` を渡す既存テスト（`runner-integrity` / `runner-git-show-env`）は `.some(...)` / env アサートのみで、gate が返す `skipped` phase 追加に非依存（tampered ケースは早期 return で gate に到達しない）。実装タスクの受け入れ基準に「既存テスト無変更 green」を明記。
- **[Risk] base ref の three-dot(merge-base) と `git show` tip の不整合**（変更集合は `base...HEAD` = merge-base 基準、依存比較は `git show <baseBranch>:path` = base tip 基準）→ **Mitigation**: fresh worktree では merge-base ≈ base tip で実害ほぼ無し。base が branch 後に進んだ稀ケースでも、誤判定は「依存が実際は base tip と同じなのに merge-base とは違う」極めて限定的な状況に留まる。Open Questions に merge-base 厳密化を残す。
- **[Risk] managed runtime / diff 非導出環境で毎 run skip され検査が働かない** → **Trade-off**: D6 の意図した挙動。diff 非導出では形状検査が本質的に不能。merge 後の `postMergeVerify`（frozen install）が最終安全網として残る。
- **[Risk] malformed な HEAD package.json で gate が誤動作** → **Mitigation**: D4 で HEAD parse 不能は「依存変更なし」に倒し gate を fail させない。JSON 破損は build/typecheck phase が拾う。
- **[Trade-off] 常時 on（config gate なし）** → 非該当 repo（lockfile 非追跡・非 JS）では毎回 `skipped` note が 1 行増えるが、phase として可視化されるのみで verdict・既存挙動に影響しない。config で on/off する footgun を作らない方を採る。

## Migration Plan

- 本変更は additive: 新モジュール（`lockfile-sync.ts`）+ detect-pm / changed-lines への additive helper + runner 両経路への gate 配線 + implementer user message への 1 手順追加。config スキーマ変更なし。
- 既存 repo（lockfile 追跡あり・依存変更を lockfile と同期している PR）: gate は `passed` を返すのみで挙動不変。
- lockfile 非追跡 / 非 JS repo: gate は `skipped` note を出すのみ。
- rollback: gate 配線を外せば無害に revert 可能（config キーが無いため設定移行不要）。

## Open Questions

- monorepo で workspace ごとに個別 lockfile を持つ構成（現状は root lockfile を追跡判定に用いる前提）。root lockfile 前提で足りない実績が出たら `findLockfile` の探索範囲拡張を別 request で検討する。
- base 版取得を `git show <baseBranch>:path` から `git show $(git merge-base <baseBranch> HEAD):path` に厳密化するか。現状は fresh worktree で十分なため tip を用い、実測で問題が出たら移行する。
