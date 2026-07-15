# Design: `job attach --branch` — remote branch から quiescent job を attach する

## Context

ADR-20260605 は truth（`state.json` ＋ `events.jsonl`）を branch-borne に置き、git だけで cross-environment resume を成立させると掲げた。ADR-20260715 はその成立要件（発見・検証・再束縛）を構造判断として ratify 済み。本 change はその behavior 実装であり、新規 architecture ADR を要さない。

`origin/<branch>` の branch-borne checkpoint から quiescent job を発見・検証・materialize・rebind し、以後の `specrunner job resume <slug>` を成立させる `specrunner job attach --branch <branch>` を追加する。

### 現状コード（検証済みの前提）

- `job attach` は存在しない。`src/cli/command-registry.ts` の `job` サブコマンドは start / ls / show / cancel / resume / archive / prune / stats のみ。
- `WorktreeMaterializationPlan`（`src/core/runtime/workspace-materializer.ts:28-33`）は discriminated union。resume 系 2 variant（`resume-recreated` / `resume-without-recorded-worktree`）は `remoteBaseRef`（= `origin/<baseBranch>`）から `--detach` で worktree を作る（`manager.create(..., plan.remoteBaseRef, undefined, setupPlan)`, `:100-101`）。feature branch の HEAD（checkpoint commit）から materialize する経路は無い。
- `WorktreeManager.create(repoRoot, slug, jobId, baseRef?, branchName?, plan?)`（`src/core/worktree/manager.ts:96-103`）: `branchName` があると `git worktree add -b <branchName> <path> <ref>`、無いと `--detach <ref>`。worktree path は `<slug>-<jobId.slice(0,8)>`（`buildWorktreePath`, `:54-57`）。
- liveness sidecar は `.specrunner/local/<slug>/liveness.json`（`{ pid, session, worktreePath, jobId }`）。`LocalRuntime.writeLivenessSidecar`（`src/core/runtime/local.ts:918-930`）が `pid: process.pid` で書く。`listLocalSidecars` / `JobCatalog`（section 2/3）が索引する。
- projection loader `composeSplitLayout(stateJsonPath, eventsPath, slugInject?)`（`src/store/job-state-projection.ts:38-120`）は state.json を読み、`fold(events)` で journal を畳み、`corruption` を返す（journal/projection 整合検証はこれが担う）。`loadSplitLayout` は corruption 時に `journalCorruptedError` を throw。**両者ともファイルパス前提**で、git object の生文字列を直接受けられない。
- capability gate（`src/core/pipeline/runtime-capability-gate.ts`）は「bootstrapJob より前に検査して throw ＝ job state を一切作らない」前例。attach の検証はこれと同型に閉じる。
- `resolveJobStateBySlug`（`src/core/resume/resolve-job.ts`）→ `JobStateStore.list`（`JobCatalog.listWithSourceDirs`, section 2 が `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` を走査、section 3 が sidecar 補完）。attach が worktree ＋ sidecar を作れば resume は無改変で job を発見できる。

## Goals / Non-Goals

**Goals**:

- `specrunner job attach --branch <branch>` を追加。`origin/<branch>` を fetch し、その HEAD tree の checkpoint を **materialize より前に**検証し、自己整合な場合のみ feature branch HEAD から worktree を materialize、liveness sidecar を pid=null で再構築する。
- checkpoint 検証述語（D2）を独立モジュールに閉じ、typed error で拒否する（job state / worktree / sidecar を一切作らない）。
- feature branch HEAD 起点の materialization を **新しい plan variant** として追加。既存 resume 系 plan（base branch 起点）の挙動・コード・テストは無変更。
- attach（tree 検証 → materialize → rebind）と resume（FSM 再開）を別動詞として分離。attach 後の `job resume <slug>` は無改変で成立する。

**Non-Goals**（request のスコープ外に準拠）:

- `running` job の別マシン takeover / lease / epoch（別 ADR）。
- `origin/*` の暗黙走査による発見（branch は明示指定）。
- attach 後の自動 resume（ワンショット alias は後続）。
- 実行経路の state-persist / git 副作用の二相境界の変更。
- managed runtime の attach（本 change は local runtime のみ）。
- `resolveJobStateBySlug` / `JobStateStore.list` / `ResumeCommand` の変更（attach は既存 discovery / resume 経路に無改変で乗る）。

## Decisions

### D1: checkpoint は `origin/<branch>` HEAD tree から checkout せずに読む

materialize より前に検証を閉じる（D2）には、worktree を作らずに tree の中身を読む必要がある。git object store から `git show <ref>:<path>` / `git ls-tree` で読む。

新モジュール `src/git/checkpoint-ref.ts`（src/git/ 層。import は `util/git-exec` / `util/paths` / `errors` に限定 ―― `remote.ts` / `source-revision.ts` と同じ制約）:

- `resolveCheckpointSlug(spawnFn, cwd, ref)`: `git ls-tree --name-only <ref> specrunner/changes/` の entry から `archive` / `canceled` を除外し、`git cat-file -e <ref>:specrunner/changes/<name>/state.json` が成功する dir を集める。**ちょうど 1 件**なら slug、0 件なら「checkpoint 不在」、2 件以上なら「曖昧」を返す。
- `readCheckpointFromRef(spawnFn, cwd, ref)`: slug を解決し、`git show <ref>:specrunner/changes/<slug>/state.json`（必須）、`...events.jsonl`（不在なら空文字）、`git ls-tree -r --name-only <ref> -- specrunner/changes/<slug>/`（tree に存在する artifact 集合）を読む。返り値 `{ slug, stateJson, eventsJsonl, treeFiles }`。git 失敗・checkpoint 不在は typed error。

slug は tree path の dir 名から得る（request 要件「slug は fetch した state から導出」の実装。dir 名 ＝ 規約上 slug であり、後段 (e) で `getJobSlug(state)` と一致検証する）。

**Rationale**: checkout すると tree を「materialize」してしまい D2（検証してから再束縛）に反する。git object 読みは副作用ゼロ（fetch 済み remote-tracking ref の参照のみ）。

**Alternatives considered**: 一旦 worktree を作って worktree から読む → 検証前に worktree を作るので D2 違反、検証失敗時に「一切作らない」を破る。却下。

### D2: 内容ベースの projection compose を追加し、journal/projection 整合を検証に流用する

`composeSplitLayout` はファイルパス前提。attach は生文字列を検証するため、`src/store/job-state-projection.ts` に

```ts
export async function composeSplitLayoutFromContent(
  stateJson: string,
  eventsJsonl: string,
  slugInject?: SlugInjectOptions,
): Promise<{ state: NormalizedJobState; corruption: FoldCorruption | null }>
```

を追加し、既存 `composeSplitLayout` を「ファイルを読んで `composeSplitLayoutFromContent` に委譲する薄いラッパ」に振替える（**挙動不変リファクタ**。既存 `composeSplitLayout` テストは無改変で green）。`corruption` 検出（journal integrity）と `validateJobState`（projection 妥当性）をそのまま流用できる。

**Rationale**: journal/projection 整合（D2 検証項目 b）を再実装せず、正本ロジックを 1 箇所に保つ。ファイル→内容の抽出は behavior を変えない。

**Alternatives considered**: attach 専用に fold / validate を再実装 → 正本の二重化。却下。tree をテンポラリ dir に書き出して既存 loader を使う → 余計な I/O と後始末、検証前の副作用。却下。

### D3: checkpoint 検証述語を独立モジュールに閉じ、typed error で拒否する

`src/core/attach/verify-checkpoint.ts`:

```ts
export interface VerifiedCheckpoint {
  state: NormalizedJobState;
  slug: string;
  jobId: string;
  branch: string;
}
export function verifyCheckpoint(input: {
  slug: string;
  stateJson: string;
  eventsJsonl: string;
  treeFiles: string[];
  branch: string;
  expectedRepo: { owner: string; name: string };
}): Promise<VerifiedCheckpoint>  // 不成立なら throw、materialize 系 I/O なし
```

検証項目（ADR-20260715 D2、request 要件 2）:

- **(b) journal / projection 整合**: `composeSplitLayoutFromContent(stateJson, eventsJsonl)`。state.json 不正 → throw、`corruption !== null` → throw。以降は得られた `state` を使う。
- **(a) status が quiescent**: `state.status === "awaiting-resume"` でなければ throw。これが `running` 拒否を含む（受け入れ基準）。
- **(c) resume point / pipeline 定義が解決可能**: `getPipelineDescriptor(getPipelineId(state))` が throw しない、かつ `resolveResumeStep(undefined, state.resumePoint ?? null, state.step, buildAllowedStepSet(state.reviewers), state.reviewers)` が throw しない。
- **(d) resume 必須成果物が tree に存在**: `treeFiles` が `specrunner/changes/<slug>/request.md` を含む（resume は request.md を parse する）。state.json / events.jsonl は D1 読み取りで存在確認済み。
- **(e) repository / jobId / branch identity 一致**: `state.repository.owner/name === expectedRepo`、`state.jobId` が非空文字列、`state.branch === branch`（引数）、`getJobSlug(state) === slug`（tree dir 名）。

いずれか不成立 → `checkpointNotAttachableError(reason, detail)`（新規 typed error、後述 D6）。この関数は materialize 系 I/O をしない ―― fetch / tree 読みは前段（orchestrator）で済み、ここは判定のみ。**worktree / sidecar / job state を一切作らない**（capability gate と同型）。

**Rationale**: 検証を純関数に閉じると単体テストで各項目を独立に固定できる（受け入れ基準の中心）。materialize から物理的に分離することで「検証 → 生成」の順序を構造で保証する。

**Alternatives considered**: 検証を setupWorkspace / materializer の中に混ぜる → 検証失敗時に worktree を作り始めてしまい「一切作らない」を破る。却下。送信側が `remote-resumable` フラグを state に書く（ADR-20260715 で却下済み）→ 二相の隙間で落ちうりフラグは完全性を保証しない。採らない。

### D4: feature branch HEAD 起点の materialization を新 plan variant として追加する

`WorktreeMaterializationPlan` に variant を 1 つ追加:

```ts
| { kind: "attach-from-checkpoint"; checkpointRef: string; branchName: string }
```

`WorkspaceMaterializer.materialize` に arm を追加:

```
manager.create(host.cwd, slug, jobId, plan.checkpointRef, plan.branchName, setupPlan)
  → git worktree add -b <branchName> <path> <checkpointRef>   （checkpointRef = origin/<branch>）
registerWorkspace(workspace)
writeLivenessSidecar(slug, jobId, worktreePath, null)          // pid=null（D5）
```

resume 系 arm との差:

- **起点**: `checkpointRef = origin/<branch>`（feature branch HEAD ＝ checkpoint commit）。resume 系は `remoteBaseRef = origin/<baseBranch>`。
- **branch 作成**: `-b <branchName>` でローカル feature branch を checkpoint commit に作る（以後の step push が branch 名で成立する）。resume 系は `--detach`。
- **seed しない**: `bootstrapState` persist / `updateJobState(worktreePath)` / `recopyDraftToChangeFolder` を行わない。checkpoint tree に `state.json` / `events.jsonl` / `request.md` が既に含まれ、checkout でそのまま worktree に載る。branch-borne journal が正本であり上書きしてはならない。

既存 4 arm（resume-existing / resume-recreated / resume-without-recorded-worktree / new-run）は無改変。plan union の追加と新 arm の追加のみ。

`LocalRuntime.setupWorkspace` は、新 `WorkspaceOptions.attachCheckpoint?: { branch: string; checkpointRef: string }` が指定されたとき、他の分岐（noWorktree / existingWorktreePath / new-run）より前に early-return で attach plan を組む:

```ts
if (opts?.attachCheckpoint) {
  const plan = { kind: "attach-from-checkpoint",
                 checkpointRef: opts.attachCheckpoint.checkpointRef,
                 branchName: opts.attachCheckpoint.branch };
  return this.materializeWorktree(slug, jobId, plan, opts);
}
```

fetch は orchestrator が既に済ませているため setupWorkspace 側では fetch しない（`origin/<branch>` はローカルに存在する）。

**Rationale**: request 要件 3 が「新 variant として追加、既存 resume 系 plan の挙動不変」を明示。plan union ＋ arm 追加は最小侵襲で、既存 arm のコードに触れないため挙動不変が構造的に保証される。

**Alternatives considered**: resume-recreated の ref を条件分岐で feature branch に切替える → 既存 arm の挙動を変えるリスク、受け入れ基準「既存 plan テスト無改変 green」を脅かす。却下。attach 専用に manager.create を CLI から直接呼ぶ → plan union を通さず、request の「plan variant として追加」に反し materializer の register / liveness 順序を二重化する。却下。

### D5: machine-local reconstruction contract（pid=null 再割当）

attach は sidecar を `{ pid: null, session: null, worktreePath: <規約導出>, jobId: <branch-borne 由来> }` で書く。`worktreePath` は `buildWorktreePath`（`<slug>-<jobId8>`）＝ materialize が返す実 path。`jobId` は検証済み branch-borne state 由来。`pid` は attach が実行プロセスでないため null（resume 時に process.pid へ再割当 ―― ADR-20260715 D3 の「導出ではなく連続性を保つ再割当」）。

`LocalRuntime.writeLivenessSidecar` に optional 引数を追加:

```ts
async writeLivenessSidecar(slug, jobId, worktreePath, pid: number | null = process.pid): Promise<void>
```

デフォルト `process.pid` で既存呼び出し（resume-existing arm / new-run arm / setupWorkspaceNoWorktree）は無改変。attach arm のみ `null` を渡す。`MaterializerHost.writeLivenessSidecar` の型に optional `pid` を反映する（optional なので既存実装・呼び出しと後方互換）。

**Rationale**: pid=null は「quiescent、まだ誰も走らせていない」を表す唯一の正しい値。既存 sidecar 形状（`{ pid, session, worktreePath, jobId }`）を変えず値だけ変える。

**Alternatives considered**: attach 用の別 sidecar ファイルを新設 → discovery（`listLocalSidecars`）が二経路になり resume の無改変性を崩す。却下。sidecar に pid フィールドを付けず省略 → `listLocalSidecars` / stale 判定が pid の有無に暗黙依存する箇所を壊しうる。null を明示。

### D6: typed error 分類

`src/errors.ts` の `ERROR_CODES` に追加:

- `CHECKPOINT_NOT_FOUND`: `origin/<branch>` tree に attach 可能な change folder（state.json を持つ非 archive/canceled dir）が 0 件 or 複数。
- `CHECKPOINT_NOT_ATTACHABLE`: 検証項目 (a)-(e) のいずれか不成立（reason を hint に載せる）。
- `ATTACH_FETCH_FAILED`: `git fetch origin <branch>` 失敗（branch 不在・認証・ネットワーク）。
- `ATTACH_RUNTIME_UNSUPPORTED`: config.runtime が local でない（managed は本 change のスコープ外）。

factory `checkpointNotAttachableError(reason, detail)` 等を追加。exit code は既定（GENERAL_ERROR=1）で足りる（CLI 引数の構文不正ではないため 2 は使わない）。

**Rationale**: 検証失敗を 1 種の error に潰さず、運用者が「branch 名違い」「running なので不可」「認証切れ」を区別できるようにする。既存 SpecRunnerError 機構に乗せる。

**Alternatives considered**: 汎用 Error を throw → CLI の error 分類（hint / exit code）に乗らず運用性が落ちる。却下。

### D7: attach は local-runtime 専用の standalone command（pipeline を走らせない）

`src/cli/attach.ts` ＋ `src/core/attach/orchestrator.ts`:

1. worktree guard（`detectSpecrunnerWorktree`）: worktree 内からの attach を拒否（resume と同型）。
2. repoRoot 解決 → config load → github host / token 解決 → transport-auth-wrapped spawn を作る（`createTransportAuth({ token, cwd }).wrapSpawn(spawnCommand)`。fetch に認証を注入）。config.runtime !== "local" → `ATTACH_RUNTIME_UNSUPPORTED`。
3. `getOriginInfo(cwd, host)` で expectedRepo。
4. **orchestrator**: `git fetch origin <branch>`（失敗 → `ATTACH_FETCH_FAILED`）→ `readCheckpointFromRef(spawn, cwd, "origin/<branch>")` → `verifyCheckpoint({...})`。ここまでで **副作用は fetch のみ**（job state / worktree / sidecar なし）。検証失敗は typed error で終了。
5. 検証成功後にのみ: `LocalRuntime` を構築（`bootstrap` / `createRuntime` 経由）し `setupWorkspace(slug, jobId, { attachCheckpoint: { branch, checkpointRef: "origin/<branch>" }, baseBranch })` を呼ぶ → materializer が worktree を作り sidecar を pid=null で書く。
6. `pipeline.run` は呼ばない（attach は FSM を進めない別動詞）。成功メッセージで `specrunner job resume <slug>` を案内。

command-registry に `job attach`（flag `--branch <branch>` 必須、`guardedSubcommands` に追加、USAGE 追記）を登録。

**Rationale**: attach は「発見・検証・再束縛」で完結し FSM を進めない。CommandRunner（pipeline 実行テンプレート）に載せず standalone にすることで「検証 → materialize → 終了」の順序と「auto-resume しない」を素直に表現する。archive command（`src/cli/archive.ts`）と同じ「pipeline を走らせない deterministic CLI command」の型。

**Alternatives considered**: attach を CommandRunner のサブクラスにして pipeline.run まで通す → auto-resume してしまい request の動詞分離に反する。却下。

## フロー全体（順序が invariant）

```
attach --branch <b>
  ├─ guard: worktree 内なら reject
  ├─ config/token/repo 解決, runtime==local 検査
  ├─ git fetch origin <b>                    ← 副作用は remote-tracking ref のみ
  ├─ readCheckpointFromRef(origin/<b>)        ← git object 読み（副作用なし）
  ├─ verifyCheckpoint(...)                    ← 判定のみ（副作用なし）
  │     └─ 不成立 → typed error → 終了（worktree/sidecar/state を一切作らない）
  └─ 検証成功 → setupWorkspace(attachCheckpoint)  ← ここで初めて worktree + sidecar 生成
        └─ materialize: worktree add -b <b> origin/<b>; sidecar pid=null
resume <slug>（無改変）
  └─ resolveJobStateBySlug → worktree の state.json 発見 → resume-existing → FSM 再開
```

「検証を通過して初めてローカル状態を作る」は、`verifyCheckpoint` が `setupWorkspace` より前段で throw する**制御フローの順序**で構造的に保証される。

## Risks / Trade-offs

- [Risk] ローカルに feature branch `<branch>` が既存 → `worktree add -b <branch>` が衝突する。Mitigation: attach は別環境（branch を持たないマシン）が主眼。衝突時は manager が失敗を返し worktree は作られない（materialize 内 cleanup）。本 change では衝突を許容せずエラーで留め、既 attach 済みなら `job resume` を案内する。
- [Risk] `composeSplitLayout` の委譲リファクタが既存挙動を壊す → Mitigation: ファイル読み→内容渡しの純粋抽出であり slugInject・corruption・validate の順序を保存する。既存 `composeSplitLayout` / `loadSplitLayout` / `JobCatalog` テストを無改変で通すことで回帰を固定する。
- [Risk] tree に active change folder が複数 → Mitigation: 通常 feature branch は 1 slug。複数検出は `CHECKPOINT_NOT_FOUND`（曖昧）で明示拒否し、誤 attach を防ぐ。
- [Trade-off] 公開ラグ（ADR-20260715） → push 前は locally resumable だが remotely 未成立。attach は remote tree のみを検証するため未 push の checkpoint は attach 対象外 ―― これは能力差であり失敗ではない（ADR に開示済み）。
- [Risk] MaterializerHost 型変更（writeLivenessSidecar に optional pid） → Mitigation: optional 引数のため既存実装（LocalRuntime）・stub host・呼び出しは後方互換。

## Open Questions

なし。CLI 形状（`--branch` 必須の明示指定）、検証項目 (a)-(e)、materialize 起点（feature branch HEAD）、sidecar 形状（pid=null）、attach / resume の動詞分離は request と ADR-20260715 で確定済み。
