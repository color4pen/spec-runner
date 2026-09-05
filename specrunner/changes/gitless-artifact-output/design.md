# Design: Git非依存 artifact-output profile の成立性設計と最小縦断実測

## Context

### 現状: Git は「公開先」ではなく「実行基盤」

local runtime は Git を実行の土台として使っている。以下は本 change で確認済みの call site（fact-check 済み assertion を含む）:

| 責務 | 実装位置 |
|---|---|
| 実行隔離 | `src/core/worktree/manager.ts:121` — `git worktree add` を spawn |
| 隔離なしモード | `src/core/runtime/local.ts:setupWorkspaceNoWorktree` — `git status --porcelain` / `git checkout -b` / `git add` / `git commit` / `git rev-parse HEAD` |
| revision 識別 | `src/core/runtime/local.ts:688 captureHeadSha` — `git rev-parse HEAD` |
| changed-files 導出 | `src/core/runtime/local.ts:927 listChangedFiles` — `git diff --name-only <baseBranch>...HEAD` |
| step input 検証 | `src/core/runtime/local.ts:1404-1409 validateStepInputs` — artifact 種別 `gitState` が `git rev-parse --git-dir` |
| step 成果物の帰属 | `WorkspaceMaterializer`（`src/core/runtime/workspace-materializer.ts`）が bootstrap commit を作り `appendSynthesizedCommit` へ記録 |
| agent / reviewer 文脈 | `src/git/dynamic-context.ts` — `gitLog` / `diffStat` を `gitExec` 経由で収集 |
| 実行前 gate | `src/core/pipeline/runtime-capability-gate.ts:72-88 assertRuntimeSupportsScope` — `canDeriveChangedFiles()` の 1 述語のみ |

`WorktreeMaterializationPlan`（`workspace-materializer.ts:30-47`）は全 variant が worktree 前提で、artifact-output 相当の variant は存在しない。`--no-worktree` は「repository root で実行する」モードであり Git 非依存ではない。

`src/state/profile.ts` の `STANDARD_PROFILE` は **pipeline assurance profile**（testDerivation / specReview の保証水準）であり、runtime の隔離・authority を表す軸ではない。本 change が導入する profile はこれとは別軸である。

入力経路について: `src/cli/job-start-handler.ts:97-103` で `--from-issue` は generic な job start より前に routing される。`--source <dir>` flag は `src/cli/flag-parser.ts` / `src/cli/command-registry.ts` のいずれにも存在しない（`RUN_JOB_FLAGS` は verbose / quiet / json / no-worktree / issue / detach / from-issue の 7 つ）。

### この change が答えるべき問い

「request と source directory を渡し、検証・レビュー済みの変更成果物を受け取る」を Git なしで成立させられるか。成立させるには Git が暗黙に提供していた保証（revision identity・変更集合・provenance・state 耐久性）を別機構で置換する必要があり、それは既存 runtime への option 追加ではなく **新しい実行 profile** である。

本 change は全面抽象化を先行させず、**最小縦断を実測して成立性と必要境界を確定する**ことをゴールにする。

### 制約

- `architecture/model.md` §3 の closure（domain → ports / persistence / shared-kernel / leaf のみ）を守る。
- B-6 / B-12: subprocess 生成は seam 経由。新規 module は `node:child_process` を直接 import しない。
- CWD ratchet: `process.cwd()` は allowlist 管理。新規 module は path をすべて引数で受け取る。
- 既存 Git profile の挙動・保証を一切変更しない。

## Goals / Non-Goals

**Goals**:

- `.git` を持たない入力 directory に対し、SpecRunner 自身が `git` を spawn せず・GitHub API を呼ばず、入力を破壊せずに「baseline → candidate → agent → verification → review → artifact」の 1 本の縦断を通す。
- Git commit OID の代わりとなる **再計算可能な snapshot digest** による revision identity を契約化する。
- added / modified / deleted を snapshot 比較から導出し、text patch で表現できない変更（binary / mode / symlink / 削除 / 空 directory）を manifest と payload から欠落させない。
- 取得・比較の失敗を「変更なし」に畳まない fail-closed 表現を全経路で持つ。
- Git 依存 operation を **profile capability の data** として宣言し、実行開始前の preflight で effective pipeline を列挙する。
- baseline / candidate digest を artifact・verification record・review record へ束縛する。
- profile ごとの保証差分・unsupported operation を CLI（`specrunner guide`）と README で説明する。
- 実測結果（時間・容量・支配的コスト・停止した call site・置換できた/できない保証・続行判断・次段階 Issue 案）を記録する。

**Non-Goals**:

- Git の再実装、隠れた一時 repository の作成、`git init` による依存の隠蔽。
- Git 以外の VCS provider 抽象化 / multi-forge 対応。
- 既存 Git profile と同等の durability / remote resume / distributed execution の初回提供。
- source directory への自動適用（apply command の実装も本 change では行わない。契約だけ定義する）。
- 既存 `--no-worktree` の意味変更。
- `job start --source <dir>` の CLI 配線（surface は設計するが実装は次段階 Issue。理由は D2 / D15）。
- provider runner の分割 refactoring（R4）、snapshot 性能の先回り最適化。
- 既存 `LocalRuntime` / `ManagedRuntime` / `WorkspaceMaterializer` / `Pipeline` engine の behavior 変更。

## Decisions

### D1: profile を「実行 authority の軸」として新設し、既存 assurance profile とは別軸にする

artifact-output profile を、`RuntimeStrategy` の実装差でも pipeline profile（standard / fast / design-only）でもなく、**execution profile**（実行 authority + 隔離機構 + 成果物出口）という新しい軸として宣言する。実体は 2 値の id（`git-pr` = 既存、`artifact-output` = 新設）と、profile が provide する capability 集合の純データテーブル。

- Rationale: 「Git 依存 operation を散在する if 文で無効化しない」（設計要求 7）を構造で担保するには、無効化理由を **1 箇所のデータ**に集約し、実行前に判定できる形にする必要がある。`RuntimeStrategy` の method を増やす方向だと、判定が実行時の分岐として core 全域へ滲む（Stop Condition「core 全域への条件分岐拡散」に該当する）。`src/state/profile.ts` の assurance profile に相乗りしないのは、あちらが「保証水準の lattice」であり `satisfiesFloor` の意味論を持つのに対し、こちらは「何ができないか」の capability 集合で、比較演算の意味が異なるため。
- Alternatives considered:
  - (a) `RuntimeStrategy` に `canPush()` / `canCreatePr()` … を足す — 述語が増えるたびに call site が散り、preflight で「pipeline 全体の可否」を一括判定できない。却下。
  - (b) `PipelineDescriptor` に artifact-output 専用 descriptor を追加する — pipeline 形状（step の並び）と実行 authority は直交する軸であり、profile × pipeline の組合せ爆発を descriptor 側へ持ち込む。却下。
  - (c) 既存 `EffectiveProfile`（assurance）へ field 追加 — 意味の異なる 2 軸を 1 型に混ぜると `computePolicyDigest` の入力が変わり、既存 job state の digest 互換性に影響する。却下。

### D2: 最小縦断は既存 CommandRunner を通さない独立 orchestrator（probe）として実装する

最小縦断は `ArtifactOutputRun`（新規 module）が所有し、agent / verification / review / spawn / clock / runId をすべて注入 seam として受け取る。`CommandRunner` / `LocalRuntime` / `Pipeline` engine には触れない。

- Rationale: 既存 `CommandRunner.execute()` は `setupWorkspace` → `reloadJobState` → `buildDeps` → `registerCleanup` → `pipeline.run` の順で Git 前提（`WorkspaceContext.worktreePath`、slug store の stateRoot、`synthesizedCommits`、`collectDynamicContext`）を織り込んでおり、ここへ profile 分岐を入れると「既存 profile の挙動を変えない」保証をテストで固定できない。request の最小実測スコープも「CLI サブコマンドとしての完成度は必須としない」と明示している。まず縦断を独立に成立させ、どの call site が本当に共通化可能かを実測してから統合する（設計要求 8:「共通化は実測で同じ意味と確認できた pure contract に限定」）。
- Alternatives considered:
  - (a) `RuntimeStrategy` の 3 実装目（`ArtifactOutputRuntime`）を作る — port の method の多くが Git 意味論（`captureHeadSha` / `listCommitChangedFiles` / `readFileAtCommit` / `lastCommitTouchingPath` …）であり、null / unavailable を返す stub の山になる。stub の意味を consumer が「変更なし」と誤読する経路（Stop Condition の fail-open）を新規に作る。却下。
  - (b) `LocalRuntime` に `artifactOutput` オプションを足す — 既存 profile の regression 面が最大になる。却下。

### D3: revision identity は snapshot digest（再計算可能・machine 非依存）

snapshot は「entry の集合」であり、digest はその正規化直列化に対する SHA-256。

- entry kind: `file` / `symlink` / `dir` の 3 種のみ。それ以外（fifo / socket / device / 不明）は entry にせず **unsupported として fail-closed**（D4）。
- path: source root からの相対 POSIX path、先頭 `./` なし、区切りは `/`。Unicode 正規化は**しない**（NFD/NFC を勝手に畳むと別 entry の衝突を招く）。UTF-8 として解釈できない path は unsupported。
- 並び順: path の UTF-8 byte 昇順。`readdir` の返却順・inode 順・時刻・絶対 path は identity に混ぜない。
- mode: 実行 bit のみを 2 値で保持（`100644` / `100755`）。symlink は `120000`、dir は `40000`。owner / group / umask / timestamps は identity に含めない。
- content digest: file は内容 byte の SHA-256、symlink は link target 文字列の byte を kind tag 付きで SHA-256、dir は content digest なし。
- snapshot digest: `schemaVersion` + 適用された exclusion 規則 + 各 entry の `kind \0 path \0 mode \0 contentDigest \n` を上記順で streaming hash した SHA-256。表記は `sha256:<hex>`（既存 `ArtifactRef.hash` / `MainCheckoutGuardSnapshot.hash` と同じ）。dir エントリは contentDigest を持たないが、**フィールド区切りの `\0` は保持し、contentDigest 部分を空文字列とする**。すなわち dir エントリの byte 列は `dir\0<path>\040000\0\n`（末尾の `\0` と `\n` を含む）と確定する。この表現を唯一の正規形とし、`\0` を省略した形（`dir\0<path>\040000\n`）は不正とする。
- 空 directory は entry として保持する（Git は表現できないが、tarball 展開物では意味を持つため）。

- Rationale: 「時刻・絶対 path・traversal 順を混ぜない」（設計要求 3）を満たしつつ、同一入力から誰でも digest を再計算できる（検証可能性）。`util/hash.ts` の `hashObject` を使わず専用 streaming hash にするのは、大規模 tree で巨大な canonical JSON 文字列を一度メモリに作らないため（Non-Goal の「先回り最適化」ではなく OOM を避ける下限要件）。
- Alternatives considered:
  - (a) Git 互換の tree OID を自前計算 — 「Git の再実装」に該当。空 directory / mode 表現も Git の制約を引き継ぐ。却下。
  - (b) mtime + size の高速 identity — 内容が変わらない再書き込みや mtime 保存 copy で誤判定し、identity が「再計算可能」でなくなる。却下。
  - (c) 内容 digest のみで path を含めない Merkle root — rename が digest 不変になり、変更集合と digest の意味が乖離する。却下。

### D4: 取得・比較の失敗は必ず DU の失敗 arm。空配列・「変更なし」へ畳まない

snapshot 取得は `{ kind: "ok", snapshot } | { kind: "unavailable", reason, failures[] }`、変更集合導出は `{ kind: "success", changes, unsupported } | { kind: "unavailable", reason }` を返す。I/O エラー・permission 拒否・unsupported entry kind・path decode 失敗・source root 外へ出る symlink は、すべて失敗 arm に入れる。部分 snapshot は返さない。

- Rationale: 既存 code base が `ChangedFilesResult` / `WorktreeInspectionResult` で確立している「never throw, DU で unavailable」の慣行に揃える。同時に、既存 `scope-check` の教訓（`synthesizeScopeUnverifiableFinding` の rationale が「`listChangedFiles` が `[]` を返すのは構造的制約であり変更なしを意味しない」と明記している）をそのまま新 profile にも適用する。Stop Condition「changed-files 不明を空配列へ fail-open しないと既存 pipeline を再利用できない」に抵触しないことをこの形で保証する。
- Alternatives considered:
  - (a) throw で表現 — 呼び出し側が catch を書き忘れると「握りつぶし = 変更なし」に落ちる経路が生まれる。却下。
  - (b) 読めなかった entry を skip して partial snapshot を返す — まさに禁止された挙動。却下。

### D5: workspace 所有権 — run root は source の外、evidence は agent 非書込領域

run root（呼び出し側が親 directory を指定、SpecRunner が `<parent>/<runId>/` を作成・所有）配下の layout:

| path | 所有者 | agent 書込 | 寿命 |
|---|---|---|---|
| `run.json` | SpecRunner | 不可 | 永続（cleanup 後も残す durable evidence） |
| `baseline/snapshot.json` | SpecRunner | 不可 | 永続 |
| `candidate/` | SpecRunner が materialize、agent が変更 | 可 | 成功時は既定で保持、明示 cleanup で削除可 |
| `steps/` | SpecRunner | 不可 | 永続 |
| `artifact.staging/` → `artifact/` | SpecRunner | 不可 | 永続 |

- candidate には **利用者の source だけ**を materialize する。SpecRunner の pipeline 成果物（request の写し・step result・run state）は `steps/` 側に置き、candidate tree に混ぜない。
- materialize は symlink を追跡せず（`dereference: false`）そのまま symlink として複製し、mode の実行 bit を保存する。source root の外を指す symlink（絶対 path・`..` で外へ出る相対）は materialize 前の baseline snapshot 段階で unsupported として fail-closed。
- cleanup 責務: SpecRunner が作った run root だけを消す。source は決して消さない。失敗時は candidate を残す（事後解析のため）。

- Rationale: 「runtime state / baseline evidence を agent writable 領域だけに置かない」（設計要求 2）を layout で満たす。candidate に SpecRunner 成果物を混ぜないのは、artifact が「利用者の変更だけ」を含むという artifact contract（D9）を単純に保つため — 混ぜると除外規則が manifest の意味に恒久的に食い込む。
- Alternatives considered:
  - (a) candidate 内に `specrunner/changes/<slug>/` を overlay し変更集合から除外する — 除外規則の正しさに artifact の正しさが常時依存し、除外漏れが利用者の artifact を汚す。実 agent adapter は cwd 相対で result file を書くため production では必要になりうるので OQ-2 として残す。今回は却下。
  - (b) run root を OS temp 固定 — 呼び出し側が artifact の置き場を選べず、大規模 tree で temp 領域を溢れさせる。却下。
  - (c) hardlink / reflink で materialize — 高速だが、agent の in-place 書き換えが source を破壊する経路を作り D6 と両立しない。却下。

### D6: source 不変性は「copy-only + 前後 digest 照合」で成功時・失敗時とも保証する

artifact-output profile は source directory に対する write 経路を一切持たない（読み取りのみ）。加えて run 開始時の baseline digest と、run 終了時（成功・失敗・halt のいずれでも）に再取得した source digest を照合し、不一致なら run 全体を `source-mutated` として fail-closed で記録する。

- Rationale: 「元 source が成功時・失敗時とも変更されない」は AC であり、「write していない」という実装の主張だけでなく**観測**でも示す必要がある。再取得 digest は第三者による実行中変更も検出でき、開始時 snapshot identity の固定（設計要求 2）と整合する。
- Alternatives considered:
  - (a) fs.watch による監視 — platform 依存で取りこぼす。却下。
  - (b) 終了時照合をしない — AC を機械検証できない。却下。
  - Trade-off: 終了時に source を再走査するため大規模 tree では走査コストが増える。実測項目（D16）として記録する。

### D7: 変更集合は snapshot 比較のみから導出し、rename 推定はしない

baseline / candidate の entry map を突き合わせ `added` / `modified` / `deleted` を導出する。kind が変わった場合（file → symlink など）は `deleted` + `added` の 2 entry として表現する。mode だけの変化も `modified`。rename 推定は行わない（delete + add）。

- Rationale: 設計要求 4 の明示要求。rename 推定は heuristic であり、初回 profile で誤検出の責任を負う理由がない。kind 変化を単一 `modified` に畳むと、適用側（patch / payload）が旧 kind の削除を落とす危険がある。
- Alternatives considered:
  - (a) content digest 一致による rename 検出 — 初期必須にしない、と request が明示。却下。
  - (b) kind 変化を `modified` + flag で表現 — 適用手順が「削除してから作成」である事実を manifest 上で暗黙にする。却下（ただし entry には旧 kind を補助情報として残す）。

### D8: patch 表現可能性は分類し、表現できないものは payload で必ず補完する

各変更 entry を patch 表現可能性で分類する:

| 分類 | 条件 | `changes.patch` | payload |
|---|---|---|---|
| `included` | change=added/modified かつ kind=file かつ UTF-8 text（NUL byte なし）かつ size 上限内 | unified diff hunk を含む | 含む（candidate bytes） |
| `included:deletion` | change=deleted かつ kind=file かつ 旧側が UTF-8 text（NUL byte なし）かつ size 上限内 | 削除 hunk を含む（`--- /dev/null` 形式） | なし（candidate が存在しない） |
| `omitted:binary` | change=added/modified かつ NUL byte を含む / UTF-8 decode 不可 | 含まない | 含む（candidate bytes） |
| `omitted:binary-deletion` | change=deleted かつ 旧側が binary（NUL byte を含む / UTF-8 decode 不可） | 含まない（binary 内容を unified diff に含めない） | なし（candidate が存在しない） |
| `omitted:size` | change=added/modified かつ size 上限超過 | 含まない | 含む（candidate bytes） |
| `not-applicable` | kind が symlink / dir、または mode のみの変更 | 含まない | metadata として manifest に記録（symlink target を含む） |
| `unsupported` | payload としても表現できない（fifo 等） | — | — → **artifact を finalize しない**（fail-closed） |

削除 entry に `not-applicable` を使わないことで、manifest の `patch` フィールド値から `changes.patch` の実内容が 1:1 で推定できる（`included` / `included:deletion` → patch に hunk あり、それ以外 → patch に hunk なし）。manifest には全変更 entry が必ず現れ、`patch` 欄で分類を明示する。「patch に出なかったので変更なし」は構造的に起こらない。

- Rationale: 設計要求 4 / AC の中核。unified diff は text 変更のための表現であり、それを唯一の payload にすると binary / mode / symlink / 削除が落ちる。削除 text ファイルを専用分類 `included:deletion` とすることで、manifest の分類と `changes.patch` の実内容の対応が 1:1 になり consumer が patch 内容を分類から確実に推定できる。削除 binary ファイルに `omitted:binary-deletion` を設けることで、「binary 削除」の未定義状態を解消する（binary 内容は unified diff に含めず、存在しない candidate は payload に収録しない）。unsupported を黙って落とさず finalize 拒否にするのは、Stop Condition の裏返し（契約を定義できるなら fail-closed で通す）。
- Alternatives considered:
  - (a) binary を base64 で patch へ埋める（git binary patch 相当） — 独自 patch 方言になり適用ツールが SpecRunner 専用になる。payload で完全性は担保済み。却下。
  - (b) 全部 bundle にして patch を出さない — 「表現可能な text 変更の unified diff」は artifact 契約の必須要素。却下。

### D9: artifact は 1 つの出力単位。finalize は atomic、source へ自動適用しない

`artifact/` の内容: `manifest.json` / `changes.patch` / `payload/`（added・modified の candidate 内容を path 構造のまま） / `verification.json` / `review.json` / `APPLY.md`（適用手順と unsupported entry の有無）。

- 生成は `artifact.staging/` に書き切ってから `artifact/` へ rename（atomic finalize）。途中失敗時に `artifact/` は存在しない。
- artifact は source へ自動適用しない。将来 apply command を提供する場合も別の明示操作とし、**適用先の現在 digest が manifest の baseline digest と一致しない限り上書きしない**ことを契約として `APPLY.md` と manifest に記載する（本 change では apply を実装しない）。
- `manifest.json` の必須欄: schemaVersion / profile id / runId / source 情報（root path・適用 exclusion） / baseline digest / candidate digest / 変更 entry 配列（path・change・kind・mode・両側 content digest・payload 参照・patch 分類） / unsupported 配列 / patch coverage / verification 参照と束縛 digest / review 参照と束縛 digest / resume 可否 / unsupported operation 一覧。

- Rationale: 「成功時に 1 つの出力単位として取得できる」（設計要求 5）と partial failure 処理（設計要求 6）を staging + rename の 1 手で同時に満たす。baseline digest 一致を適用の前提として先に契約化しておかないと、後から apply を足したときに「digest 不一致でも上書き」の実装が容易に生まれる。
- Alternatives considered:
  - (a) tar / zip を bundle として出す — 追加実装・依存が要る。directory bundle でも「完全な変更 payload」の要件は満たせる。配布形態は OQ-3。
  - (b) 逐次書き込み（staging なし） — 途中失敗で半端な artifact が残り、成功と区別できない。却下。

### D10: verification / review は「凍結した candidate revision」に束縛する。drift は fail-closed

verification と review は次の順で実行する: candidate snapshot → digest 確定 → 実行 → 再 snapshot → digest 照合。digest が一致した場合のみ record に digest を束縛して有効とする。不一致（実行中に candidate が変わった）は `revision-drift` として halt し、artifact を finalize しない。

加えて、**cross-phase 一致チェック**を artifact finalize 直前に行う: verification record の bound digest と review record の bound digest が等しいことを確認し、不一致の場合は `revision-drift` として halt し finalize しない。これにより、verification フェーズ終了〜review フェーズ開始の間に外部プロセスが candidate を変更し各フェーズ単独の drift チェックは通過したが両 digest が乖離するシナリオを防ぐ。manifest の `candidateDigest` は verification bound digest（step 6 の frozen snapshot）を正規値として使用する。

- Rationale: 「digest が verification / review の対象 revision と一致すること」（設計要求 3）を、記録の書式ではなく**実行手順**で保証する。Git profile では commit OID が実行対象の固定を担っていたので、それを snapshot 側で置換する。フェーズ単独の drift チェックだけでは cross-phase の乖離を検出できないため、cross-phase 一致チェックを finalize 前の最終防衛線として必須にする。Stop Condition「revision 不一致でも verification / review を有効として扱う必要がある」に抵触しないことをこの決定で示す。
- Alternatives considered:
  - (a) 実行前 digest のみ記録 — verification が workspace を汚す（build 生成物等）ケースで record の digest が実際の対象と乖離する。却下。
  - (b) build 生成物を exclusion に足して drift を無視 — exclusion 規則が verification の副作用に引きずられ、識別子の意味が実行系依存になる。却下（利用者が明示 exclusion を宣言することは可能で、その場合 exclusion は digest 入力と manifest に記録される）。

### D11: 「git を呼ばない」を runtime guard + import ratchet + 依存不在の 3 層で機械検証する

1. **runtime guard**: profile が使う subprocess seam は guarded wrapper 越しにのみ渡す。command 名（basename）が `git` / `gh` の場合は実行せず fail-closed error を投げる。縦断テストは記録用 spawn を注入し、記録された command 列に git / gh が 0 件であることを assert する。
2. **static ratchet**: 新規 module tree が `util/git-exec` / `core/worktree/**` / `adapter/github/**` / `kernel/github-client` / `src/git/**` の value import を持たないことを grep 検査する（type-only import は除外）。
3. **依存不在**: probe の依存に GitHub client を含めない（型としても受け取らない）。GitHub API 呼び出しは構造的に到達不能。

対象は SpecRunner 自身が発行する spawn に限る。agent subprocess（Claude Code CLI / Codex）が内部で呼ぶ git は対象外であり、その旨を guard の doc と guide topic に明記する。

- Rationale: AC「機械的に検証できる」を、実行時の観測（1）と構造（2, 3）の両方で押さえる。1 だけだと将来 module 内部に直接 spawn 経路が足されたとき縦断テストの網羅性頼みになり、2 だけだと注入経路経由の git 実行を見逃す。
- Alternatives considered:
  - (a) `PATH` から git を外して実行 — 環境依存で再現性がない。却下。
  - (b) guard を warning に留める — fail-open。却下。

### D12: preflight は「effective pipeline」を実行前に列挙し、実行可能範囲を先に表示する

capability id（`git-revision` / `git-commit-attribution` / `git-remote-publish` / `github-api` / `branch-borne-state` / `changed-files` 等）を定義し、(a) profile が provide する集合、(b) step が require する集合をデータ表で宣言する。preflight は `PipelineDescriptor` × profile から `{ supported: step[], unsupported: { step, missing[] }[], executable: boolean }` を導出する純関数。artifact-output profile の初期 unsupported は request が挙げた 6 種（push / PR create / merge、feature branch への archive record、commit 採択と commit egress ledger、branch checkpoint からの remote reattach、issue 起点の unattended managed runtime、commit OID を要する operation）。加えて入力経路の gate として `--from-issue` / `--issue` を明示 unsupported とする。

**step → required capability マッピング**（データ表の骨格。T-05 実装時は `STEP_NAMES` の実名と照合して完成させる）:

| step | required capabilities |
|---|---|
| `pr-create` | `git-remote-publish`, `github-api` |
| `merge` | `git-remote-publish`, `github-api` |
| `archive` (branch-borne record) | `git-commit-attribution`, `branch-borne-state` |
| `branch-checkpoint` | `branch-borne-state`, `git-revision` |
| `commit-adopt` | `git-commit-attribution`, `git-revision` |
| `egress-ledger` | `git-commit-attribution`, `branch-borne-state` |
| `design` | なし（capability 要求なし） |
| `implementer` / `agent` | なし |
| `verification` / `code-review` / `conformance` / `adr-gen` | なし |

上表で「なし」の step は artifact-output profile でも supported になる。「なし」以外の step が artifact-output profile に含まれる場合、preflight がその step を `unsupported` として列挙し `executable: false` を返す。このマッピングをデータとして `execution-profile.ts` に宣言することで、`if` 文の散在による leakage（本来 unsupported な step が supported と判定される fail-open）を構造的に防ぐ。

`git-pr` profile は全 capability を provide するため、既存 3 pipeline（standard / fast / design-only）に対する unsupported は空集合になる（＝既存挙動不変をテストで固定する）。

- Rationale: 設計要求 7 の「pipeline を開始してから unsupported step で初めて停止しない」を、既存 `assertRuntimeSupportsScope`（1 述語・permissionScope 宣言時のみ発火）を一般化せずに実現する。既存 gate に触れないのは、その意味論を変えると fast profile の既存挙動に影響するため。
- Alternatives considered:
  - (a) `assertRuntimeSupportsScope` を拡張 — 既存 profile の gate 挙動に触れる。却下。
  - (b) step 側に `requiresGit: true` の boolean を持たせる — 「何が足りないか」を示せず、capability の粒度も表現できない。却下。

### D13: lifecycle — 初期 profile は resume 非対応。対応範囲を実行前に宣言する

- job identity: `runId`（呼び出し側注入 or 明示生成。`Date.now()` / 乱数を pure module に埋めない）。配置は run root（D5）。
- 記録先: `run.json` に status（`running` / `completed` / `halted` / `failed`）・phase・baseline/candidate digest・timing・capability report を書く。halt / failure も同じ file に確定させる。
- resume: **初期 profile では非対応**。`run.json` の `resume.supported = false` を書き、preflight でも「この profile は resume を提供しない」と表示する。branch-borne checkpoint も remote reattach も提供しない。
- process crash 後: candidate は再利用しない（再開は新しい run root での再実行）。crash 後に残る candidate は解析用の残骸であり、次 run の入力として採用しない。
- partial failure: artifact finalize 前の失敗 → `artifact/` は作られない。`run.json` / `baseline/snapshot.json` / candidate は残る。finalize 後の失敗 → artifact は valid、`run.json` に post-finalize 失敗として記録。
- cleanup 後に残る durable evidence: `run.json` と `artifact/`。

- Rationale: user story 5 は「resume を提供しないなら、対応できる pipeline と停止時の成果物を明確に限定する」「既存 resume が動くように見せて途中で Git 前提に落ちる状態は作らない」を要求している。D2 により既存 resume 経路（`ResumeCommand` / branch-borne state）とは配線されないため、「動くように見える」経路は構造的に存在しない。
- Alternatives considered:
  - (a) local state だけで resume を初回提供 — step 境界の再入契約（session 継続・iteration budget・findings ledger）まで設計対象になり、Stop Condition「remote resume まで同時設計しないと成立しない」に近づく。次段階 Issue に分離。却下。
  - (b) 既存 `.specrunner/local/<slug>/` sidecar を流用 — repo root 前提（slug store の stateRoot）で、非 Git source では意味が定まらない。却下。

### D14: agent / reviewer への Git 文脈は snapshot 由来文脈へ置換する

`DynamicContext` の `gitLog` / `diffStat` に相当する枠へ、snapshot 由来の provenance block を入れる純関数を用意する: baseline digest / candidate digest / profile 名 / 変更 entry の要約（path・change・kind・patch 分類） / patch の抜粋（上限付き） / unsupported entry 一覧。履歴が存在しないことは「空文字」ではなく「この profile には revision 履歴が存在しない」と明示的に書く。

- Rationale: 設計要求 4。空文字を渡すと agent は「変更なし / 履歴なし」と解釈しうる（fail-open の人間版）。明示文言により、reviewer は「文脈が取得できなかった」と「文脈として存在しない」を区別できる。
- Alternatives considered:
  - (a) `collectDynamicContext` に profile 分岐を入れる — `src/git/` は shared-kernel であり profile を知るべきでない。却下。

### D15: 説明面（CLI / README）は capability テーブルから導出する。`--source` は設計のみ

`specrunner guide artifact-output` topic と README の該当節で、(i) `--no-worktree` との違い、(ii) 提供する保証と提供しない保証、(iii) unsupported operation 一覧、(iv) 現状は preview（`job start --source <dir>` は未配線）であることを説明する。unsupported 一覧は D12 の capability テーブルから文字列生成し、テーブルと doc の drift をテストで禁止する。

`--source <dir>` の CLI surface（`job start` に string flag、`--from-issue` / `--issue` と排他、指定時は artifact-output profile を選択、`--no-worktree` とも排他）は design として確定させ、実装は次段階 Issue に分ける。

- Rationale: AC「CLI / README で説明される」を満たしつつ、未配線の flag を露出して「指定できるのに動かない」状態を作らない。guide は repo 外でも動く既存 command で、Git を要求しない点でも profile の説明先として適切。
- Alternatives considered:
  - (a) `--source` を実装して preflight エラーだけ返す — 機能があるように見える。却下。
  - (b) README だけ — AC が CLI も要求。却下。

### D16: 実測は run が出す metrics を正本とし、判断（続行 / 縮小 / 中止）まで文書に残す

`ArtifactOutputRun` は metrics（phase 別 duration ms・baseline / candidate entry 数・走査 byte 数・artifact 容量・payload 容量・patch 行数）を `run.json` に記録する。縦断テストは (i) 小 fixture、(ii) 規模 fixture（多数の小 file）の 2 ケースを回し、metrics が欠落なく出ることを assert する。実測値そのものは assert しない（環境依存のため）。実測レポート（停止した call site / 置換できた保証・できない保証 / 新しい runtime-profile 境界 / 時間・容量 / 支配的コスト / 続行判断 / 次段階 Issue 案）は repo の docs に残す。

- Rationale: AC「実測結果と次段階の分割 Issue 案が記録される」。閾値 assert にしないのは CI の flake を作らないため（Non-Goal「性能の先回り最適化」とも整合）。
- Alternatives considered:
  - (a) 性能 assert を入れる — CI flake を作り、最適化を前倒しさせる。却下。
  - (b) 実測を手作業のみで記録 — 再現性がない。却下（metrics は機械出力、解釈のみ人手）。

## Risks / Trade-offs

- [Risk] 大規模 source（`node_modules` を含む tree 等）で baseline / candidate / 終了時照合の複数回走査が支配的コストになる → Mitigation: 既定 exclusion は最小（`.git/` のみ、D3 で digest 入力に記録）とし、追加 exclusion は呼び出し側が明示宣言できる形にする。コストは D16 の metrics で実測し、incremental snapshot の要否判断材料として記録する（先回り最適化はしない）。
- [Risk] candidate に SpecRunner の pipeline 成果物を置かない設計（D5）は、cwd 相対に result file を書く実 agent adapter と噛み合わない可能性 → Mitigation: 最小縦断は injected runner で成立させ、実 agent 配線時の overlay 要否を OQ-2 として実測後に判断する。overlay が必要になった場合も「overlay prefix は manifest に記録し、変更集合から除外した事実を明示する」ことを前提とする。
- [Risk] unified diff を自前実装するため、大きな text file で計算量・メモリが問題になる → Mitigation: size 上限を超えた entry は `omitted:size` として patch から外し payload で表現する（D8）。上限値は manifest に記録し、利用者が「なぜ patch に出ないか」を追跡できる。
- [Risk] `.git` を既定 exclusion にすることが「Git を暗黙に特別扱いしている」と読まれうる → Mitigation: exclusion は authority ではなくデータ（digest 入力に含まれ manifest に出力される）であり、Git を参照する処理は一切ないことを doc と test で示す。`.git` を含めたい利用者は exclusion を空にできる。
- [Risk] 新規 module 群が production 経路から薄くしか参照されず（guide topic の capability テーブルのみ）、実質 dead code に見える → Mitigation: preview として位置づけ、docs に次段階 Issue（CLI 配線）を明記する。縦断テストが常時実行されるため behavior は固定される。
- [Trade-off] resume 非対応（D13）は Git profile より durability が明確に低い。これは「暗黙の保証低下」ではなく、preflight・`run.json`・guide topic の 3 箇所で明示する仕様上の差分として扱う。
- [Trade-off] D2 により当面 2 つの実行経路（Git profile / artifact-output profile）が並存し、snapshot 由来 context・artifact 生成のロジックは共有されない。共有は実測後に pure contract 単位でのみ行う（設計要求 8）。

## Open Questions

- OQ-1: exclusion 規則の設定入口。最小縦断では呼び出し側が明示引数で渡す。CLI 配線時に `.specrunner/config.json` の設定にするか flag にするかは次段階 Issue で決める。
- OQ-2: 実 agent adapter を artifact-output profile に配線する際、pipeline 成果物（step result / rules.md / request の写し）を candidate 内に overlay する必要があるか。必要な場合の除外契約と、それが artifact の意味に与える影響。実測後に判断する。
- OQ-3: artifact の配布形態（directory のまま / 単一 archive へ集約）。D9 は directory を採用したが、CI 環境間で受け渡す用途では単一 file が要求される可能性がある。
- OQ-4: verification の実行 cwd と依存解決（source に依存物が含まれない場合の扱い）。最小縦断では注入 executor で回避するため未確定。
- OQ-5: 同一 machine resume を次段階で提供する場合の candidate 再利用安全条件（candidate digest と `run.json` の記録一致を再開の前提にできるか）。
- OQ-6: `--source` 指定時の profile 選択を暗黙にする（`--source` があれば artifact-output）か、明示 flag を要求するか。

## Migration Plan

- 本 change は **純増（additive）**。既存 module の behavior 変更は行わない。変更する既存 file は、guide topic 追加（`src/core/command/guide.ts` と topic 数を数える既存テスト）、README、docs のみ。
- rollback: 新規 module 群と guide topic・doc を削除すれば元に戻る。既存 profile の state / artifact 形式・CLI 引数・pipeline 定義には触れないため、進行中 job への影響はない。
- 次段階（本 change のスコープ外、実測レポートに Issue 案として記録する）: (1) `job start --source <dir>` の CLI 配線と profile 選択、(2) 実 agent adapter の配線と overlay 契約（OQ-2）、(3) apply command（baseline digest 一致を前提とする適用）、(4) 同一 machine resume（D13 / OQ-5）、(5) incremental snapshot（実測が要求した場合のみ）。
