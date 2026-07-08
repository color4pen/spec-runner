# Design: post-merge-integrity-check

## Context

`job archive --with-merge` は `runMergeThenArchive` (`src/core/archive/merge-then-archive.ts`)
を実行し、対象 PR の checks が green になったら無人で squash merge して main に取り込む。
merge は GitHub REST API (`mergePullRequest`, `merge-then-archive.ts:478`) 経由で行われ、
成功後は `runPostMergeCleanup` (`src/core/archive/post-merge-cleanup.ts`) が worktree / feature
branch を後片付けする。

squash merge の結果生成される「base + squash された変更」の合流結果（＝ merge 後の main の
内容）は、どのゲートも検証していない。PR 単体の verification が green でも、squash 時に
lockfile が壊れる等で main が壊れることがある。壊れた main は以後の全 job の workspace setup
（frozen install）を止め、原因の merge を特定するまで運用全体が停滞する。

実害の本質は「検知が遅く、原因の merge への帰属が難しい」ことにある。下流 job の
workspace setup 失敗として事後検知されると、どの merge が壊したのか帰属できず、全 job が
停まる。そこで **merge を実行した直後・同じ archive 実行の中で** merge 後の main の整合性を
機械検証し、失敗を escalation として即時に帰属・可視化する。

### 現状コードの前提

- merge は `merge-then-archive.ts` Step 5（`mergePullRequest`）。成功で `stdoutWrite("PR #N merged
  successfully.")` を出し、Step 6 で `runPostMergeCleanup` を呼ぶ。
- `runPostMergeCleanup` は archive 済み PR の resume 経路（Step 2 `:189`）と merge-during-wait
  経路（Step 4 `:317`）でも呼ばれる。これらは「別実行 / 別プロセスによる merge」を後追いで
  片付ける経路である。
- archive 経路は「base working tree を汚さない」を不変条件とする（orchestrator は base branch を
  checkout / commit / push しない。post-merge-cleanup は job status を書かない）。
- `merge-then-archive.ts` は `spawn: SpawnFn`（`src/util/spawn.ts`）と `githubToken` を input に
  受け取り、`baseBranch`（既定 "main"）を解決済み（`resolvedBaseBranch`）。
- `ShellCommand`（`src/config/schema.ts:115`, `string | { name?: string; run: string }`）は
  `verification.commands` / `workspace.setup` で既用。共通 zod schema `shellCommandSchema`
  （`schema.ts:693`）がある。実行は各所で `sh -c <run>` 経由。
- escalation は `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })`
  （`src/core/finish/escalation.ts`）。merge-then-archive は conflict / timeout / protected-paths 等で
  既にこの形式を多用している。
- 認証付き git transport は `createTransportAuth({ token, cwd }).wrapSpawn(spawn)`
  （`src/git/transport-auth.ts`）で fetch / push に auth header を注入する。orchestrator が既用。

## Goals / Non-Goals

**Goals**:

- repo config に post-merge 整合性検証コマンド（`ShellCommand` 形）を宣言可能にする。
- `job archive --with-merge` が **この実行で行った** squash merge の直後に、merge 結果を反映した
  main 上で当該コマンドを実行する。exit 0 なら従来どおり cleanup → 完了する。
- 検証失敗（非 0）時は escalation として報告する。内容に (a) この merge により main の整合性検証が
  失敗した事実（PR 番号 / merge commit SHA での帰属）、(b) 失敗コマンドの出力、(c) 対処（lockfile を
  再生成して main へ修正を push する等）を含める。**merge 済みのため rollback は行わない**。
  merged を merged でないと偽らない。
- config 未宣言のとき挙動が一切変わらない（後方互換、既存テスト無変更 green）。
- merge 結果の materialize / 実行 / 判定ロジックを純度高く分離し、注入 `SpawnFn` でユニットテスト可能にする。

**Non-Goals**:

- merge の自動 rollback / revert（不可逆操作の自動化はしない）。
- squash merge 自体の lockfile 再生成・修復。
- pre-merge の prospective merge tree 検証（`git merge-tree` の事前 materialize + install。
  コスト・複雑度が高く、得られる差分は「壊れた main の存在時間の短縮」のみ。実害は post-merge
  即時検証で消える。必要になれば別 request）。
- 後続 job / inbox の自動停止機構（escalation による可視化のみ。要件5）。
- main の恒常監視・定期ヘルスチェック。
- `--with-merge` を使わない手動 merge 経路。

## Decisions

### D1: 検知点は「この実行の squash merge 直後・cleanup 前」に限定する

`runMergeThenArchive` の Step 5（merge 成功）と Step 6（cleanup）の間に整合性検証を挿入する。
merge 成功（`mergeResult.merged === true`）を確認した直後にのみ実行し、失敗時は cleanup を
実行せず escalation を返して短絡する。

**この実行が行った merge の経路（Step 5→6）にのみ挿入し、以下の経路には挿入しない**:

- Step 2（`:189`）: 既に MERGED + archived の resume 経路。crash 後・または整合性 escalation 後の
  再実行で cleanup を完走させるための経路であり、ここで再検証すると (i) resume の度に fetch +
  materialize + install が走る、(ii) main が壊れたままだと escalation ループに陥り cleanup が永久に
  完走しない＝実質的な「停止機構」になり要件5に反する。
- Step 4（`:317`）: wait 中に別プロセス / 別実行が merge した経路。その merge は「この実行の merge」
  ではないため、この実行に帰属させて検証・escalation するのは誤帰属になる。

**Rationale**: 要件2「merge 成功後」＝この実行の merge 直後。要件の attribution は「この merge に
より」であり、検知点を「この実行の merge」に一意に紐付けることで機械的帰属が成立する。resume /
merge-during-wait を対象外にすることで、停止機構化（要件5違反）と誤帰属を同時に避ける。

**Alternatives considered**:
- 全 `runPostMergeCleanup` 呼び出し点の前で検証: 上記 (i)(ii) の停止機構化・誤帰属を招く。不採用。
- `mergePullRequest` adapter 内で検証: adapter は「GitHub API を呼ぶ」責務に閉じる。main の
  materialize + shell command 実行は core の責務で、config 由来の業務判断を adapter に持ち込むのは
  層の越境。不採用。

### D2: merge 結果は ephemeral な detached worktree に materialize して検証する

merge 後の main の内容（＝ merged commit の tree）を、`git worktree add --detach <tmp> <mergeSha>`
で作った一時 worktree に checkout し、その中で検証コマンドを実行する。実行後は
`git worktree remove --force` + `git worktree prune` で撤去する（best-effort、finally）。
一時 worktree の path は既存 worktree 規約と衝突しない名前
（例: `.git/specrunner-worktrees/integrity-<slug>-<sha8>`）とする。

**Rationale**: 検証は「merge 結果を反映した main 上」で行う必要がある（要件2）。merge は REST API
経由でリモートに対して行われるため、cwd（親 repo）のローカル main は merge を反映していない。
merge 結果を得るには merged commit を materialize するしかない。detached worktree を使うことで:

- 正確に「base + squash」の合流結果 tree を検証できる（feature branch の tree では base の進みを
  反映せず、合流結果と一致しない）。
- 既存不変条件「base working tree を汚さない」を守れる（cwd の作業ツリー・ローカル base branch を
  一切変更しない。fetch は remote-tracking ref の更新のみ）。
- worktree は本 project の隔離プリミティブであり、新しい概念を増やさない。

pre-merge の merge-tree materialize が「却下」なのに post-merge の materialize が許容される理由:
merge は既に実在の commit として origin に存在するため、合成 merge は不要で「1 回の checkout +
1 回の install」で済む。実害（検知の遅さ・帰属不能）は post-merge 即時検証で消える。

**Alternatives considered**:
- cwd 上で base を checkout + `reset --hard origin/<base>` して検証: 「base working tree を汚さない」
  不変条件に反し、ユーザーのローカル状態（別 branch・未コミット変更）を破壊しうる。不採用。
- feature branch worktree（cleanup 前に残存）を再利用: tree が合流結果と一致せず、`--no-worktree`
  モードでは独立 worktree が存在しない。検証対象が誤る。不採用。
- `WorktreeManager.create` の再利用: 規約 path `<slug>-<jobId8>` が job 自身の worktree path と
  衝突しうる。整合性検証専用に別名 detached worktree を直接張る方が単純。不採用。

### D3: merge commit SHA と merged tree はローカル fetch で解決し、GitHubClient port は変更しない

一時 worktree を張る前に、`githubToken` で auth 注入した spawn を用いて cwd で
`git fetch origin <baseBranch>` を実行し、merged commit の object をローカルに取り込む。
`git rev-parse origin/<baseBranch>` で materialize/attribution 用の SHA を解決する。

**Rationale**: 帰属に必要なのは「PR 番号（確定）」と「検証した merge の SHA」。fetch 後の
`origin/<baseBranch>` tip は squash merge により生成された commit そのものであり、これを SHA として
報告すれば「検証したまさにその tree」を指す最も正直な attribution になる。`mergePullRequest` の
REST 200 応答は `sha` を含むが、これを取り出すには port interface 拡張が必要で、GitHubClient の
全 test double / adapter に波及する。ローカル rev-parse なら port 無変更で同じ SHA が得られ、
変更範囲を最小化できる（最小依存 North Star）。fetch は auth 注入 spawn で行うため private HTTPS
repo でも動作する。fetch は remote-tracking ref の更新のみで作業ツリーを汚さない。

**Alternatives considered**:
- `mergePullRequest` の戻り値に `sha?: string` を追加して伝搬: port + adapter + 全 GitHubClient
  fake に波及。ローカル rev-parse で同値が得られるため、変更範囲を優先して不採用。
- fetch せず cwd のローカル base を使う: merge を反映しておらず検証対象が誤る。不採用。

### D4: 設定は `archive.postMergeVerify: ShellCommand[]` に置く

`SpecRunnerConfig.archive`（既存 `ArchiveConfig`）に `postMergeVerify?: ShellCommand[]` を追加し、
`configSchema` の archive セクションに `optional(array(shellCommandSchema, ...))` を追加する。

```jsonc
// <repo-root>/.specrunner/config.json
{
  "archive": {
    "postMergeVerify": ["bun install --frozen-lockfile"]
  }
}
```

- 未宣言 / `[]` → 検証なし（従来挙動。fetch も worktree も command も実行しない）。
- 各要素は `ShellCommand`（`"cmd"` または `{ name?, run }`）。複数指定時は配列順に fail-fast で実行。
- user global + project local は既存 deep merge で合成される。

**Rationale**: 唯一の消費点が `job archive --with-merge` であり、`ArchiveConfig` は既に merge 系設定
（`mergeWaitTimeoutMs` / `protectedPaths`）を束ねている。同セクションに置くのが凝集的で、設定解決
経路（`loadConfig` → `config.archive`）を再利用できる。型を `ShellCommand[]` とし既存
`shellCommandSchema` / fail-fast 実行モデルを踏襲することで、`verification.commands` /
`workspace.setup` と同じメンタルモデルを保ち、製品面に新しい概念を増やさない（要件・architect 採用）。

**Alternatives considered**:
- 単一 `ShellCommand`: 既存の 2 消費者（いずれも配列）と非対称になり、「install してから smoke
  チェック」等の連結を表現できない。配列 + fail-fast を採用。
- top-level `postMergeVerify`: 現時点の消費者は archive 一択。凝集度を優先し archive 配下に置く。
- `verification.commands` の再利用: verification は PR branch 上の検証であり、意味・実行タイミング・
  対象（合流結果 main）が異なる。同じキーに相乗りさせると意味が混線する。別キーにする。

### D5: 検証失敗は escalation（rollback せず、merged を正直に報告し、cleanup せず短絡）

検証コマンドが非 0 で終了したら `formatEscalation` で escalation を組み、
`{ exitCode: 1, escalation }` を返す。**merge は rollback しない**。

- `failedStep`: `post-merge integrity check (main)`
- `detectedState`（要件3a/3b を内包）:
  - PR #N が `<baseBranch>` に MERGED された事実 + merge commit SHA（先頭 7 桁）での帰属
  - 失敗コマンドのラベルと exit code
  - 失敗コマンドの出力（combined stdout+stderr）
- `recommendedAction`（要件3c）:
  - main が壊れており以後の job の workspace setup が失敗する旨
  - merge は不可逆で auto-revert は不採用のため rollback しない旨
  - 対処手順（`<baseBranch>` を checkout → 失敗コマンドで再現 → lockfile 再生成等で修復 →
    修正を `<baseBranch>` に直接 commit → origin/`<baseBranch>` へ push）
- `resumeCommand`: `specrunner job archive --with-merge <slug>`

**cleanup は行わず短絡する**。理由: (i) 本 file の他 escalation は全て cleanup せず `return` する
統一パターンに従う。(ii) resume 時（Step 2）に MERGED + archived を検出して `runPostMergeCleanup`
を実行し収束する（D1 の通り resume では再検証しない）。(iii) escalation 対応まで worktree / branch を
残すことで人間が調査に使える。

**Rationale**: merge は不可逆であり自動 revert はより大きい事故の種になる（architect 採用）。
merged を merged でないと偽らず、人間の判断（escalation → 修正 push）に渡す。attribution により
「どの merge が壊したか」を機械化し、下流 job 失敗による事後検知（帰属困難・全 job 停止）を
置き換える。

**Alternatives considered**:
- 失敗時に cleanup してから escalation: 「cleanup + escalation を同時に返す」新パターンになり、本
  file の統一パターン（escalation は短絡）から外れる。resume で収束するため cleanup 遅延は無害。不採用。
- 失敗時に merge を revert: Non-Goal（不可逆操作の自動化はしない）。不採用。

### D6: インフラ失敗（fetch / worktree add / remove）は best-effort で warn + continue

検証コマンドの実行に到達する前段（fetch 失敗・worktree add 失敗・SHA 解決失敗）は「整合性検証の
失敗」ではなく「検証を実行できなかった」インフラ事象として扱う。この場合は stderr に「main を
検証できなかった（＋理由）」旨を明示的に warn し、`{ ok: true }` を返して cleanup へ続行する
（merge は既に成功済み）。worktree の撤去失敗も同様に warn のみ。

**Rationale**: merge は成功しており、インフラ blip（一時的なネットワーク断等）で archive 全体を
止める / 誤 escalation するのは要件5（停止機構を設けない）の精神・post-merge-cleanup の
best-effort 哲学に反する。ただし「検証が pass した」と偽ってはならないため、実行できなかった事実は
warn で正直に可視化する。escalation を出すのは「コマンドが実際に走って非 0 だった」整合性失敗の
ケースに限定し、シグナルの意味を明確に保つ。

**Alternatives considered**:
- インフラ失敗も escalation: 一時的な blip で誤 escalation が増え、「integrity 失敗」シグナルの
  意味が薄れる。pass と偽らない warn で足りる。不採用。

### D7: config → CLI → orchestrator の配線と実行手段

- `src/cli/archive.ts` の `--with-merge` ブロックは既に `loadConfig()` を呼び `config.archive` を
  読んでいる。同所で `config.archive?.postMergeVerify` を読み、`runMergeThenArchive` の input に
  `postMergeVerify?: ShellCommand[]` として渡す。config load 失敗の fallback では undefined
  （＝検証なし、後方互換）。
- `runMergeThenArchive` は `postMergeVerify` が空 / undefined のとき整合性検証を完全にスキップする
  （fetch も worktree も command も走らせない）。
- 検証ロジックは新モジュール `src/core/archive/post-merge-integrity.ts` の
  `runPostMergeIntegrityCheck` に分離する。input は `{ slug, cwd, baseBranch, commands, spawn,
  githubToken?, prNumber }`、戻り値は `{ ok: true } | { ok: false; escalation: string }`。
  内部で `createTransportAuth({ token: githubToken, cwd }).wrapSpawn(spawn)` で auth 注入 spawn を
  作り、fetch / worktree / command 実行を行う。command は `spawn("sh", ["-c", cmd.run], { cwd:
  <worktree> })` で実行（既存の ShellCommand 実行踏襲、`stripSecrets` 済み env は SpawnFn が担保）。

**Rationale**: 既存の設定解決経路と escalation formatter を再利用し、検証の I/O を注入 `SpawnFn` に
閉じる。これにより post-merge-integrity をユニットテストで完全に駆動でき、`node:child_process` /
`process.env` を直接触らず architecture 不変条件（B-6 / B-12）を満たす。

## Risks / Trade-offs

- [Risk] fetch 後の `origin/<baseBranch>` tip が、並行 merge により「この PR の merge commit」以外に
  なる（別 PR が直後に merge）。
  → Mitigation: attribution の PR 番号は常に確定。SHA は「検証時点の main の tip」として報告し、
  実際に検証した tree を正直に指す。`--with-merge` の merge は通常直列であり実害は小さい。並行時も
  「現 main が壊れている」事実の可視化としては正しい。

- [Risk] detached worktree での install（例: `bun install --frozen-lockfile`）に時間がかかる。
  → Mitigation: 1 job の archive 時に 1 回のみ。config 宣言時だけ発生し、未宣言 repo には一切の
  追加コストなし。pre-merge merge-tree 検証より軽い（合成 merge 不要）。

- [Trade-off] 検証失敗時に cleanup を遅延し worktree / branch を残す。
  → resume（Step 2）で収束する。残存は調査に使え、best-effort cleanup が二重実行されても冪等。

- [Risk] コマンド出力に一時 worktree の絶対 path が混じり escalation が冗長化しうる。
  → Mitigation（任意）: 必要なら `maskAbsolutePaths`（`src/util/path-mask.ts`, leaf）で正規化してよい。
  secrets は SpawnFn の `stripSecrets` で子プロセス env から除去済みのため出力への漏洩リスクは低い。

- [Risk] SSH origin / token 不在の repo で fetch が ambient 認証に依存する。
  → Mitigation: `createTransportAuth` は非 HTTPS / token 不在時は透過（ambient git 挙動を保持）。
  fetch 失敗時は D6 により warn + continue で archive を止めない。

## Open Questions

- なし（検知点・materialize 方式・rollback 非実施・設定注入・停止機構なしの各判断は
  architect 評価で確定済み）。
