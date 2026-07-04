# Design: reject-duplicate-slug-run

## Context

同一 slug で `specrunner run` を 2 回起動すると、先行 job（job A）が sidecar index から
消え、`job cancel` / `job show` で解決できなくなる。

liveness sidecar は slug 単位で 1 ファイル（`.specrunner/local/<slug>/liveness.json`）であり、
2 回目の run（job B）が job A の内容を上書きする（`src/core/runtime/local.ts:784` の
`writeLivenessSidecar` は slug 単位・jobId 非依存の上書き書き込み）。sidecar 経由で jobId を
照合する解決器（`src/store/local-job-index.ts:62` の `listLocalSidecars` は各 slug ディレクトリの
`liveness.json` を 1 ファイルだけ読む）は上書き後の job B しか見つけられず、job A は
「Job not found」となる。job A の worktree とプロセスは残り続け、cancel する正規手段が無くなる。

同一 slug の並列 run は「1 request = 1 PR」という商品契約上、ほぼ常に誤操作であり、
支えるべきユースケースではない。したがって 2 つ目を許容して sidecar を jobId 単位に分割するのではなく、
live な先行 job があるときに 2 回目の run を明示的に拒否して不整合を未然に防ぐ。

関連コード:
- `src/core/command/pipeline-run.ts:122` — `prepare()` が preflight チェック群の後 `bootstrapJob` を呼ぶ。
  同一 slug の live 先行 job を検査するガードは無い。
- `src/core/runtime/local.ts:784` — `writeLivenessSidecar` が `{ pid, session, worktreePath, jobId }` を
  slug 単位で上書き書き込みする。
- `src/store/local-job-index.ts:62,97` — `listLocalSidecars` / `resolveJobIdToSlug` は上書き後の
  job B しか解決できない。
- `src/core/resume/safety.ts:13` — `isProcessAlive(pid)` が `process.kill(pid, 0)` によるプロセス生存判定として
  既に存在する（cancel / resume が使用）。

## Goals / Non-Goals

**Goals**:
- run 起動前（`bootstrapJob` の直前）に同一 slug の live job を検査するガードを追加し、
  live な先行 job があれば **job state を一切作らずに** actionable なエラーで拒否する。
- 生存判定は既存 `isProcessAlive`（`src/core/resume/safety.ts:13`）を再利用する（新規 pid 判定ロジックを追加しない）。
- stale（dead pid）/ sidecar 不在時は現状通り run を起動する（stale sidecar の上書き起動を維持）。
- 拒否エラーに先行 jobId と対処手段（`specrunner job cancel <jobId>` するか完了を待つ）を含める。

**Non-Goals**:
- managed runtime（`marker.json`）に対する同型ガード。本 change は local runtime の liveness sidecar が対象。
- liveness sidecar を jobId 単位に分割して同一 slug の並列 run を許容する案（商品契約外のため却下）。
- stale sidecar の自動 recovery ロジックの変更（既存の stale-running / resume 経路に委ねる）。
- `job cancel` / `job show` の解決器（`local-job-index.ts`）自体の変更。本 change はガードで不整合の発生を防ぐことに限定する。

## Decisions

### D1: ガードを `prepare()` の preflight スロット（`bootstrapJob` 直前）に置く

`PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）で、`bootstrapJob`（現 122 行目）を
呼ぶ**直前**にガードを差し込む。`bootstrapJob` より前で throw することで、job state（jobId 生成・
初期 JobState 構築・後続の永続化）を一切作らずに拒否できる。

**Rationale**: 「state 生成前に弾く」ことで、不整合な sidecar 上書き（`writeLivenessSidecar` は
`setupWorkspace` 内で呼ばれる）自体を発生させない。これは既存の preflight ガード群
（reviewer 定義検証 / capability gate / input-completeness 検証）と同じ設計思想
（"halt before any state is created"）で、置き場所として自然。

**代替案**:
- `LocalRuntime.bootstrapJob` の内部で検査する案 → `bootstrapJob` が受け取る `params.request.slug` は
  canonical-path 由来で **null になり得る**（`src/core/command/pipeline-run.ts:77` の `requestSlug`）一方、
  sidecar / workspace が使う slug は `request.slug`（同 66 行目）で別値のため、bootstrapJob 内部では
  正しい slug を確実に得られない。よって slug が確定している `prepare()` 側で検査する。
- 上書きを許して sidecar を jobId 単位に分割する案 → 商品契約外のユースケースを支える方向であり、
  sidecar 読み取り・cancel・show・cleanup の広範な改修を伴うため却下（architect 評価済み）。

### D2: 検査は RuntimeStrategy の新規 seam（port メソッド）に委譲する

`prepare()` は runtime 中立なコマンド層であり、`config.runtime` 分岐や local 固有の sidecar 読み取りを
直接持つと "config.runtime 分岐は createRuntime factory に閉じる" という既存規律を破る。したがって
検査は `RuntimeStrategy` の新規メソッド `assertNoDuplicateLiveJob(repoRoot, slug)` に委譲する。

- **local**: liveness sidecar を読んで実検査する（D3）。
- **managed**: no-op（scope 外 = D6）。

**port の可視性は既存 `canDeriveChangedFiles` パターンを踏襲する**:
- `RuntimeStrategy`（port）では **optional**（`assertNoDuplicateLiveJob?(...)`）。
- `RealRuntimeStrategy`（concrete 実装用の交差型）では **required**。

`prepare()` からは `await this.runtime.assertNoDuplicateLiveJob?.(cwd, slug)` と optional-call で呼ぶ。

**Rationale**:
- optional-on-port により、`RuntimeStrategy` として型付けされた**既存テスト fake は本メソッドを実装せずとも
  コンパイル可能**で、`?.` により呼び出しがスキップされる。よって既存テストは無変更で green を維持する
  （受け入れ基準「既存 cancel / resume / inbox の挙動が不変」「既存テスト無変更 green」を満たす）。
- required-on-`RealRuntimeStrategy` により、実 runtime（`LocalRuntime` / `ManagedRuntime`）は実装漏れが
  コンパイルエラーで検出される。この 2 クラスが `RealRuntimeStrategy` の唯一の implementer である
  （`src/core/runtime/local.ts:81`, `src/core/runtime/managed.ts:62`）。

**代替案**:
- port メソッドを required にする → `RuntimeStrategy` 型の既存テスト fake が全て壊れ、受け入れ基準
  「既存テスト無変更 green」に反するため却下。
- `prepare()` に sidecar 読み取りを直書き → runtime 中立層に local 固有 I/O が漏れ、managed でも誤発火する
  ため却下。

### D3: 検査本体を injectable なピュア helper に切り出す

検査ロジックを `src/core/runtime/duplicate-slug-guard.ts` に `checkDuplicateLiveJob(repoRoot, slug, deps?)`
として実装する。`deps` は `{ readFile?, isAlive? }` を受け取り、既定は実 fs 読み取りと
`isProcessAlive`（`src/core/resume/safety.ts`）。`LocalRuntime.assertNoDuplicateLiveJob` はこの helper に
委譲するだけの薄いラッパにする。

**Rationale**:
- pid 生存の live/dead 分岐を、実プロセスに依存せず `isAlive` 注入で決定的にテストできる。
- 既存 `isProcessAlive` を再利用し、新規 pid 判定ロジックを追加しない（要件 3）。
- sidecar の JSON 読み取りは `resolveJobIdToSlug`（`local-job-index.ts`）/ resume（`resume.ts:230`）と同じ
  スキーマ（`{ pid, session, worktreePath, jobId }`）を前提にする。

**代替案**: helper を作らず `LocalRuntime` に直書き → 実プロセス依存でしかテストできず、dead-pid 分岐を
決定的に固定できないため却下。

### D4: 拒否 / 許容の判定条件

`.specrunner/local/<slug>/liveness.json` を読み、以下で判定する:

| sidecar の状態 | 判定 |
|---|---|
| ファイル不在 / 読み取り不能 | **許容**（通常起動） |
| JSON 破損 | **許容** |
| `pid` フィールドが number でない / 欠如 | **許容** |
| `pid` が number かつ `isProcessAlive(pid)` が **偽**（stale） | **許容** |
| `pid` が number かつ `isProcessAlive(pid)` が **真**（live） | **拒否**（throw） |

拒否時は sidecar の `jobId`（string の場合）を先行 jobId としてエラーに含める。

**Rationale**: stale / 不在を全て「live な先行 job なし」として扱うことで、現行の stale sidecar 上書き
起動（要件 2）を維持する。判定は既存 `isProcessAlive` に一致させ、`pid <= 0` などの縁ケースも
`isProcessAlive` の既存挙動（偽）に委ねる。

### D5: 拒否エラーの形

新規エラーコード `DUPLICATE_LIVE_JOB` と factory `duplicateLiveJobError(slug, priorJobId)` を
`src/errors.ts` に追加する。

- `code`: `DUPLICATE_LIVE_JOB`
- `hint`（対処手段）: `specrunner job cancel <priorJobId>` で cancel するか、完了を待って再実行する旨。
  先行 jobId が sidecar から取れない縁ケースでは `specrunner job list` で確認するよう案内する。
- `message`: slug と先行 jobId を含む「duplicate run を拒否した」旨。
- `exitCode`: `EXIT_CODE_MAP` に `DUPLICATE_LIVE_JOB → ARG_ERROR(2)` を追加する。
  ユーザーが環境（先行 job）を解消してから再実行すべき前提エラーであり、既存の `WORKTREE_GUARD`
  （同じくガードによる起動拒否）と同じ扱いにする。

**Rationale**: 受け入れ基準「エラーメッセージに先行 jobId と対処手段（cancel / 待機）が含まれる」を
factory 側で固定する。`SpecRunnerError` は CLI の `outputPipelineThrowError` 経路で hint も含めて表示される。

### D6: managed runtime は no-op（scope 境界）

`ManagedRuntime.assertNoDuplicateLiveJob` は何もせず即 resolve する。本 change は local runtime の
liveness sidecar が対象で、managed の `marker.json` 同型ガードは scope 外。

**Rationale**: scope を local に限定する。required-on-`RealRuntimeStrategy` を満たすために実装は必要だが、
振る舞いは no-op で明示的に「scope 外」を文書化する。

## Risks / Trade-offs

- **[Risk] PID 再利用による誤検知**: 先行 job の pid が OS に再利用され別プロセスが同 pid を持つと、
  stale なのに live と誤判定して誤って拒否する可能性がある。
  → Mitigation: これは既存 `isProcessAlive` を使う cancel / resume / stale-running 判定と同じ既知の限界であり、
  本 change で新たに導入するリスクではない。sidecar の `jobId` をエラーに出すため、ユーザーは
  `specrunner job cancel <jobId>` で先行 job を明示的に解消でき、誤検知時も詰まない。新規 pid 判定を
  足さない方針（要件 3）とも整合する。

- **[Risk] optional port メソッドの呼び忘れ**: `prepare()` で `?.` 呼び出しを書き忘れるとガードが発火しない。
  → Mitigation: call-site 結合テスト（fake runtime の `assertNoDuplicateLiveJob` が throw する時に
  `bootstrapJob` が呼ばれないこと）で固定する。

- **[Trade-off] optional-on-port**: port を optional にすることで、将来別の実 runtime を追加した際に
  `RealRuntimeStrategy` を使わなければガード漏れが型で検出されない。
  → Mitigation: 既存の architecture 不変条件テスト（`tests/unit/architecture/core-invariants.test.ts` の
  「`src/core/runtime/` は bare `implements RuntimeStrategy` を禁止し `RealRuntimeStrategy` のみ許容」B-11）が
  この抜けを塞いでいる。`canDeriveChangedFiles` と同じ確立パターンに載せる。

## Open Questions

なし
