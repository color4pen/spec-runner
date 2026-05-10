# Test Cases: persistence-unification

Derived from proposal.md, design.md, and tasks.md.

## Legend

| Field | Values |
|-------|--------|
| Priority | `must` / `should` / `could` |
| Category | `unit` / `integration` / `contract` |
| Source | tasks.md task reference |

---

## Task 1 — 正規化ロジックの統一

### TC-100 `JobStateStore.load()` が validateJobState 経由で pre-PR24 フォーマットを正規化する

**Priority**: must  
**Category**: unit  
**Source**: Task 1.2  

```
GIVEN  pre-PR24 形式（steps の値が plain object）の JSON ファイルがディスク上にある
WHEN   new JobStateStore(jobId).load() を呼ぶ
THEN   steps["propose"] が StepRun[] に正規化されている
AND    attempt=1, sessionId, outcome.verdict が正しく変換されている
AND    normalizeStepsToStepRuns を経由した旧実装と等価な出力が返る
```

### TC-101 `JobStateStore.load()` が validateJobState 経由で post-PR24 フォーマットを正規化する

**Priority**: must  
**Category**: unit  
**Source**: Task 1.2  

```
GIVEN  post-PR24 形式（StepResult[] / iteration+session shape）の JSON ファイルがある
WHEN   new JobStateStore(jobId).load() を呼ぶ
THEN   steps["spec-review"] が StepRun[] に変換され attempt が 1-origin で付与されている
AND    endedAt に completedAt の値が入っている
AND    sessionId に session.id の値が入っている
```

### TC-102 既存テスト TC-001〜TC-008 が refactoring 後も green を維持する

**Priority**: must  
**Category**: integration  
**Source**: Task 1.3  

```
GIVEN  job-state-store.test.ts の TC-001〜TC-008 が存在する
WHEN   normalizeStepsToStepRuns を削除し load() を validateJobState 経由に変更する
THEN   bun run test で TC-001〜TC-008 が全て PASS する
AND    normalizeSteps（schema.ts）と旧 normalizeStepsToStepRuns の出力が同等であることが間接的に保証される
```

### TC-103 `job-state-store.ts` から normalizeStepsToStepRuns とヘルパー群が削除されている

**Priority**: must  
**Category**: unit  
**Source**: Task 1.1  

```
GIVEN  変更後の src/store/job-state-store.ts
WHEN   ファイルを静的解析 / grep する
THEN   normalizeStepsToStepRuns, isLegacySingleResult, isStepResultShape,
       isStepRunShape, normalizeSingleResultToStepRun, normalizeStepResultToStepRun
       のいずれも定義されていない
```

### TC-104 `JobStateStore.load()` が version !== 1 のファイルで Error を throw する

**Priority**: should  
**Category**: unit  
**Source**: Task 1.2  

```
GIVEN  version: 2 の JSON ファイルがディスク上にある
WHEN   new JobStateStore(jobId).load() を呼ぶ
THEN   Error("State version must be 1.") が throw される（validateJobState が検出）
```

---

## Task 2 — static メソッドの追加

### TC-110 `JobStateStore.create()` が新しい jobId で初期 JobState を生成し永続化する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.1  

```
GIVEN  有効な request / repository パラメータ
WHEN   JobStateStore.create({ request, repository }) を呼ぶ
THEN   ディスク上に UUID 形式の jobId を名前とした JSON ファイルが作成される
AND    返り値は { version: 1, status: "running", step: "init", pid: process.pid } を含む
AND    history に "job created" の初期エントリが 1 件含まれる
AND    createdAt === updatedAt
```

### TC-111 `JobStateStore.create()` が slug を null にフォールバックする

**Priority**: should  
**Category**: unit  
**Source**: Task 2.1  

```
GIVEN  request に slug フィールドがない（undefined）パラメータ
WHEN   JobStateStore.create({ request, repository }) を呼ぶ
THEN   返り値の request.slug === null
```

### TC-112 `JobStateStore.delete()` が指定 jobId のファイルを削除する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.2  

```
GIVEN  ディスク上に存在する jobId の JSON ファイル
WHEN   JobStateStore.delete(jobId) を呼ぶ
THEN   ファイルが削除されている
AND   Promise が resolve する（エラーなし）
```

### TC-113 `JobStateStore.delete()` がファイル不在のときに ENOENT を無視する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.2  

```
GIVEN  jobId に対応するファイルが存在しない
WHEN   JobStateStore.delete(jobId) を呼ぶ
THEN   Promise が resolve する（throw しない）
```

### TC-114 `JobStateStore.list()` がディレクトリ内の全有効 JobState を返す

**Priority**: must  
**Category**: unit  
**Source**: Task 2.3  

```
GIVEN  jobs ディレクトリに 3 つの有効な JSON ファイルがある
WHEN   JobStateStore.list() を呼ぶ
THEN   3 つの JobState を含む配列が返る
AND    各エントリは validateJobState を通過した状態である
```

### TC-115 `JobStateStore.list()` が malformed ファイルをスキップして stderr に出力する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.3  

```
GIVEN  jobs ディレクトリに 2 つの有効ファイルと 1 つの malformed JSON がある
WHEN   JobStateStore.list() を呼ぶ
THEN   有効な 2 件のみが返る
AND    malformed ファイルのパスが stderr に出力されている
```

### TC-116 `JobStateStore.list()` が jobs ディレクトリ不在のとき空配列を返す

**Priority**: should  
**Category**: unit  
**Source**: Task 2.3  

```
GIVEN  jobs ディレクトリが存在しない（ENOENT）
WHEN   JobStateStore.list() を呼ぶ
THEN   空配列 [] が返る（throw しない）
```

### TC-117 `JobStateStore.resolveId()` が 36 文字の UUID をそのまま返す

**Priority**: must  
**Category**: unit  
**Source**: Task 2.4  

```
GIVEN  36 文字の有効な UUID 文字列（e.g. "12345678-1234-1234-1234-1234567890ab"）
WHEN   JobStateStore.resolveId(uuid) を呼ぶ
THEN   listJobStates を呼ばずに uuid をそのまま返す
```

### TC-118 `JobStateStore.resolveId()` がユニークなプレフィックスから全 UUID を返す

**Priority**: must  
**Category**: unit  
**Source**: Task 2.4  

```
GIVEN  "abc123" で始まる jobId が 1 件だけ存在する
WHEN   JobStateStore.resolveId("abc123") を呼ぶ
THEN   その jobId の完全 UUID が返る
```

### TC-119 `JobStateStore.resolveId()` がプレフィックス不一致で JOB_NOT_FOUND を throw する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.4  

```
GIVEN  "zzz" で始まる jobId が 1 件も存在しない
WHEN   JobStateStore.resolveId("zzz") を呼ぶ
THEN   ERROR_CODES.JOB_NOT_FOUND の SpecRunnerError が throw される
```

### TC-120 `JobStateStore.resolveId()` が複数マッチで AMBIGUOUS_JOB_ID を throw する

**Priority**: must  
**Category**: unit  
**Source**: Task 2.4  

```
GIVEN  "abc" で始まる jobId が 2 件存在する
WHEN   JobStateStore.resolveId("abc") を呼ぶ
THEN   ERROR_CODES.AMBIGUOUS_JOB_ID の SpecRunnerError が throw される
AND    エラーの hint に両方の候補 jobId が含まれている
```

---

## Task 3 — state/store.ts の委譲化

### TC-130 `createJobState()` が JobStateStore.create に委譲し同等の結果を返す

**Priority**: must  
**Category**: contract  
**Source**: Task 3.1  

```
GIVEN  state/store.ts から createJobState をインポートする既存コード
WHEN   createJobState({ request, repository }) を呼ぶ
THEN   内部で JobStateStore.create が呼ばれる
AND    戻り値が JobStateStore.create の返す JobState と同等
AND   @deprecated JSDoc が付いている
```

### TC-131 `loadJobState()` が JobStateStore 経由でロードし JobState を返す

**Priority**: must  
**Category**: contract  
**Source**: Task 3.2  

```
GIVEN  ディスク上に有効な jobId の JSON ファイルがある
WHEN   state/store.ts の loadJobState(jobId) を呼ぶ
THEN   内部で new JobStateStore(jobId).load() が呼ばれる
AND   戻り値の型は JobState（NormalizedJobState ではなくキャストされている）
AND   steps は正規化済み（validateJobState 経由）
```

### TC-132 `updateJobState()` が JobStateStore の load + persist に委譲する

**Priority**: must  
**Category**: contract  
**Source**: Task 3.3  

```
GIVEN  ディスク上に有効な jobId の JSON ファイルがある
WHEN   state/store.ts の updateJobState(jobId, mutator) を呼ぶ
THEN   内部で new JobStateStore(jobId) を生成し load() → mutator() → persist() の順で実行される
AND   ディスク上のファイルが mutator 適用後の状態になっている
```

### TC-133 `deleteJobState()` が JobStateStore.delete に委譲する

**Priority**: must  
**Category**: contract  
**Source**: Task 3.4  

```
GIVEN  ディスク上に存在する jobId のファイル
WHEN   state/store.ts の deleteJobState(jobId) を呼ぶ
THEN   JobStateStore.delete(jobId) が呼ばれ、ファイルが削除される
```

### TC-134 `listJobStates()` が JobStateStore.list に委譲する

**Priority**: must  
**Category**: contract  
**Source**: Task 3.5  

```
GIVEN  jobs ディレクトリに有効なファイルが存在する
WHEN   state/store.ts の listJobStates() を呼ぶ
THEN   JobStateStore.list() の返す配列と同一の結果が返る
```

### TC-135 `resolveJobId()` が JobStateStore.resolveId に委譲する

**Priority**: must  
**Category**: contract  
**Source**: Task 3.6  

```
GIVEN  短縮プレフィックスに一致する jobId が 1 件存在する
WHEN   state/store.ts の resolveJobId(prefix) を呼ぶ
THEN   JobStateStore.resolveId(prefix) と同じ UUID が返る
```

### TC-136 state/store.ts が不要な import を持たない（委譲ファイルとして整理済み）

**Priority**: should  
**Category**: unit  
**Source**: Task 3.7  

```
GIVEN  変更後の src/state/store.ts
WHEN   ファイルを静的解析する
THEN   fs, randomUUID, atomicWriteJson, validateJobState, Dirent,
       stderrWrite, ambiguousJobIdError の直接 import がない
AND    JobStateStore の import と型の re-export のみ残っている
```

### TC-137 state/store.ts からの既存 import が壊れない（インポート互換性）

**Priority**: must  
**Category**: integration  
**Source**: Task 3.1〜3.6  

```
GIVEN  state/store.ts を import する既存のテスト・ソースファイル群
WHEN   bun run typecheck を実行する
THEN   型エラーが発生しない（re-export が既存の import パスを維持）
```

---

## Task 4 — finish 層の移行

### TC-140 `markJobArchived` が JobStateStore を直接使い updateJobState free function を呼ばない

**Priority**: must  
**Category**: unit  
**Source**: Task 4.1  

```
GIVEN  変更後の src/core/finish/job-state-update.ts
WHEN   ファイルを静的解析する
THEN   updateJobState の import が存在しない
AND    JobStateStore の import が存在する
```

### TC-141 `markJobArchived` が awaiting-merge → archived に遷移し履歴を追記する

**Priority**: must  
**Category**: integration  
**Source**: Task 4.1  

```
GIVEN  status="awaiting-merge" の JobState がディスク上にある
WHEN   markJobArchived(jobId) を呼ぶ
THEN   ディスク上のファイルの status が "archived" になっている
AND    history に "archived" の遷移エントリが追加されている
AND    返り値の JobState が更新後の状態を反映している
```

### TC-142 `finish/orchestrator.ts` が loadJobState / updateJobState を直接呼ばない

**Priority**: must  
**Category**: unit  
**Source**: Task 4.2, 4.3  

```
GIVEN  変更後の src/core/finish/orchestrator.ts
WHEN   ファイルを静的解析する
THEN   loadJobState, updateJobState の import が存在しない
AND    JobStateStore の import が存在する
```

---

## Task 5 — resume 層の移行

### TC-150 `resume.ts` が updateJobState / loadJobState / resolveJobId を直接呼ばない

**Priority**: must  
**Category**: unit  
**Source**: Task 5.4  

```
GIVEN  変更後の src/core/command/resume.ts
WHEN   ファイルを静的解析する
THEN   updateJobState, loadJobState, resolveJobId の import が存在しない
AND    JobStateStore の import が存在する
```

### TC-151 `resume.ts` が JobStateStore.resolveId 経由でスラグ→ジョブID を解決する

**Priority**: must  
**Category**: unit  
**Source**: Task 5.1  

```
GIVEN  短縮プレフィックスを resume コマンドに渡す
WHEN   ResumeCommand の prepare() を実行する
THEN   JobStateStore.resolveId(prefix) が呼ばれ、対応する jobId を解決する
```

### TC-152 `resume.ts` が stale 検出時に JobStateStore 経由で状態を更新する

**Priority**: should  
**Category**: unit  
**Source**: Task 5.2  

```
GIVEN  status="running" かつ PID が実在しない（stale）JobState がある
WHEN   ResumeCommand の prepare() を実行する
THEN   JobStateStore インスタンスの load() + persist() を経由して status が更新される
AND    updateJobState free function が呼ばれていない
```

### TC-153 `resume.ts` が "running" 遷移時に JobStateStore 経由で状態を更新する

**Priority**: should  
**Category**: unit  
**Source**: Task 5.3  

```
GIVEN  status="awaiting-resume" の JobState がある
WHEN   ResumeCommand の prepare() を実行する
THEN   JobStateStore 経由で status が "running" に遷移する
AND    updateJobState free function が呼ばれていない
```

---

## Task 7 — 検証（全体）

### TC-160 `bun run typecheck` が全変更後 green になる

**Priority**: must  
**Category**: integration  
**Source**: Task 7.1  

```
GIVEN  Tasks 1〜5 の変更が全て適用済み
WHEN   bun run typecheck を実行する
THEN   型エラーが 0 件
```

### TC-161 `bun run test` が全変更後 green になる

**Priority**: must  
**Category**: integration  
**Source**: Task 7.2  

```
GIVEN  Tasks 1〜5 の変更が全て適用済み（TC-001〜TC-008 も含む）
WHEN   bun run test を実行する
THEN   全テストが PASS し FAIL が 0 件
```

---

## Cross-cutting

### TC-170 `JobStateStore.load()` と旧 `normalizeStepsToStepRuns` の出力等価性（regression guard）

**Priority**: must  
**Category**: unit  
**Source**: Task 1.2 / design.md Risks  

```
GIVEN  pre-PR24 / post-PR24 / current StepRun[] の 3 種類のフィクスチャを用意する
WHEN   新 load()（validateJobState 経由）で各フィクスチャをロードする
THEN   steps の各エントリが StepRun[] 形式であり、attempt / sessionId / outcome.verdict / endedAt が期待値と一致する
```

### TC-171 `.tmp.` ファイルを含む jobs ディレクトリで list() が tmp ファイルをスキップする

**Priority**: should  
**Category**: unit  
**Source**: Task 2.3  

```
GIVEN  jobs ディレクトリに "abc.json" と "abc.json.tmp.123" が存在する
WHEN   JobStateStore.list() を呼ぶ
THEN   ".tmp." を含むファイルは結果に含まれない
```

### TC-172 `JobStateStore.create()` の返り値を即 `JobStateStore(jobId).load()` で読み直せる

**Priority**: should  
**Category**: integration  
**Source**: Task 2.1  

```
GIVEN  JobStateStore.create() が正常完了した
WHEN   同じ jobId で new JobStateStore(jobId).load() を呼ぶ
THEN   同一の jobId / status / step を持つ NormalizedJobState が返る（round-trip 一致）
```
