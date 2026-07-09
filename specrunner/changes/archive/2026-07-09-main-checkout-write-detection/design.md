# Design: worktree job による main checkout への逃避書き込み検出

## Context

worktree mode の job では agent は job worktree（`deps.cwd`）内でのみ作業する前提だが、
claude-code adapter は tool のパス制限を持たない（`permissionMode: "bypassPermissions"`、`canUseTool` 未使用）。
そのため Edit / Write / Bash いずれでも絶対パスで main checkout 側へ書き込める。実際に、
fast pipeline の run 中に agent が main checkout 側の `.specrunner/config.json` を直接編集する事象が
発生した（worktree 側 branch には同変更が正当に commit 済み、main 側への書き込みは逃避）。この逃避書き込みは
既存のどの機構でも検出されず、後日 `git pull` 失敗で偶然発覚した。

現状の検査面はこの経路を観測できない:

- **conformance の scope 検査**（`src/core/step/scope-check.ts` → `deriveScopeBreach`）は worktree 内の
  branch diff（base…HEAD の changed files）だけを見る。main checkout への直接書き込みは branch diff に現れないため観測範囲外。
- **main checkout の clean 検査**（`src/core/runtime/local.ts:288-294`）は no-worktree mode の run 開始時にしか存在しない。

本 request は adapter 側のパス制限（別 request）とは独立に、「制限をすり抜けた書き込みを **検出** する」
backstop 層を、依存を追加せず（git コマンド + 既存 util のみ）step 境界の状態比較で追加する。

### 現状コードの接続点

- `src/core/step/executor.ts:202` `runAgentStep` — agent step の実行単位。`deps.cwd`（worktree path）で動作する。
  `headBeforeStep`（`src/core/step/executor.ts:357`）を agent 実行前に seam 経由で取得する既存の before/after パターンがある。
- `src/core/port/runtime-strategy.ts` — `captureHeadSha` / `digestArtifacts` / `listChangedFiles` など、
  git/fs I/O を runtime へ委譲する seam 群。managed は null / [] を返す。**LocalRuntime.cwd は main checkout root**。
- `src/core/worktree/detection.ts:100` `detectSpecrunnerWorktree(cwd)` — worktree path から main checkout root を導出する。
  no-worktree mode（cwd = repo root）や managed では `isSpecrunnerWorktree: false` を返す。
- `src/config/schema.ts:1276` `resolvePipelineForbiddenSurfaces(config, "fast")` — forbiddenSurfaces 参照の single source of truth。
- `src/core/reviewers/glob-match.ts` `matchGlob(pattern, path)` — 依存なしの glob マッチャ。
- `src/core/runtime/local.ts:839` `writeLivenessSidecar` — main checkout の `.specrunner/local/<slug>/` に書く。
  この path は `.gitignore`（`.specrunner/*` + `!.specrunner/config.json`）で ignore されるため `git status --porcelain` に現れない。
- timeout escalation（`src/core/step/executor.ts:395-431`）— `awaiting-resume` 遷移 + `resumePoint` 書き込みの既存テンプレート。
- `src/core/command/runner.ts:306-311` — `awaiting-resume` の CLI 出力（`resumePoint.reason` + resume 案内）。

## Goals / Non-Goals

**Goals**:

- worktree mode の agent step の前後で、main checkout 側の監視対象 path の状態を比較し、
  step 実行中に生じた変更（内容変更・新規作成・削除）を決定的に検出する。
- 監視対象を「forbiddenSurfaces に宣言された全 path」+「`.specrunner/` 配下」に限定し、pipeline 種別に依存せず監視する。
- 検出時は run を継続せず escalation（`awaiting-resume` + `resumePoint`）とし、検出 path と変更種別を state に記録する。
- 変更なしの run では観測可能な挙動を従来と完全に一致させる。
- 依存パッケージを追加しない（git コマンド + node 標準 crypto/fs + 既存 util のみ）。

**Non-Goals**:

- adapter 側の書き込みスコープ制限（`canUseTool` / sandbox）— 別 request。
- main checkout 全体（監視対象外 path）の変更検出 — 操作者の並行編集で誤検出が常態化するため。
- 検出時の自動 revert・自動修復。
- cli step（pr-create 等、agent を実行しない step）への検査追加。
- forbiddenSurfaces 宣言スキーマの変更。

## Decisions

### D1: 検出方式は「agent step 境界の before/after 状態比較」

agent step 実行の直前と直後（成功時）に main checkout 側監視対象 path のスナップショットを取り、差分を検出する。

- **Rationale**: 検査タイミングが決定的で、agent や運用者の判断場面を増やさない（判断は導出する）。
  before/after は既存の `headBeforeStep` capture と同型のパターンで、executor に自然に載る。
- **Alternatives considered**:
  - *fast.watch による常時監視* — プラットフォーム依存とリソースコストに対し、step 境界比較で検出時機として十分。却下。
  - *adapter 側でのパス制限* — 別 request の責務。本 request は「すり抜けた書き込みの検出」層に限定。

### D2: 実装は RuntimeStrategy seam + step 層の純関数に分離する

新しい seam `snapshotMainCheckoutGuard(cwd, config)` を `RuntimeStrategy` に追加し、
git/fs I/O（main checkout 検出・`git status`・content hash）を runtime に閉じ込める。
差分判定・監視 path 解決・型は step 層の純モジュール `src/core/step/main-checkout-guard.ts` に置き、executor が委譲する。

- **配置**:
  - `snapshotMainCheckoutGuard` は port（`runtime-strategy.ts`）に **optional** で宣言し、`RealRuntimeStrategy` では **required**。
    optional により RuntimeStrategy 型の test fake は無改修で通り、実 runtime は compile 時に実装が強制される
    （`canDeriveChangedFiles` と同じ扱い）。
  - **LocalRuntime**: `detectSpecrunnerWorktree(cwd)` が false なら `null`。true なら main checkout root で
    スナップショットを構築。never-throw（D6）。
  - **ManagedRuntime**: 常に `null`（local worktree を持たない）。
  - snapshot DTO（`{ entries: { path; hash }[] }`）は domain 依存を持たないため port 層に置く
    （`RequiredInput` / `FindingRef` と同様）。step 純モジュールと両 runtime が port から import でき、
    port→domain 逆エッジを生まない。
- **Rationale**: `captureHeadSha` / `digestArtifacts` / `listChangedFiles` と同じ「I/O は seam、判定は純関数」の分離。
  managed は明示的に null を返し「local worktree 前提の検査」であることが型で自己文書化される。
  `runtime→step`・`step→reviewers`・`step→config` は既存エッジのため新しい層間逆依存を導入しない。
- **Alternatives considered**:
  - *executor が spawnFn で直接 git を叩く（sibling module に I/O を持つ）* — managed / no-worktree の分岐を executor 側で
    抱えることになり、seam の一貫性を崩す。seam に寄せる方が managed=null で自然に無効化される。却下。

### D3: 監視対象 = forbiddenSurfaces（fast）globs + `.specrunner/**`、pipeline 非依存

監視 glob は `resolvePipelineForbiddenSurfaces(config, "fast")` の全 `paths` を flatten したものに `.specrunner/**` を加え、
dedupe した集合とする。実際に走る pipeline（fast / standard / design-only）に関わらずこの集合を監視する。

- **Rationale**: forbiddenSurfaces は「その repo が守るべき guard 面」の single source of truth であり、
  literal `"fast"` で解決するのは表現上の位置に過ぎない。ガード価値が最も高いのは自己解除経路（guard 構成データ）であり
  そこに絞る。attended 運用では操作者が main checkout で並行編集するのが通常のため、全域比較は誤検出が常態化する。
- **`.specrunner/` の実効範囲**: `.gitignore` により `.specrunner/` 配下で非 ignore なのは `.specrunner/config.json` のみ。
  `git status --porcelain`（`--ignored` なし）は ignore ファイルを列挙しないため、job 自身の liveness/logs 書き込み（`.specrunner/local/` 等）は
  自然に監視対象外になり、自己誘発の誤検出が起きない。`.specrunner/**` の宣言は将来 tracked ファイルが増えた場合の前方互換のため保持する。
- **Alternatives considered**:
  - *`resolvePipelineForbiddenSurfaces(config, activePipelineId)` を使う* — fast 以外では [] を返し監視が消える。要件2（pipeline 非依存）に反する。却下。

### D4: スナップショットは「status でフィルタした監視 path の content hash マップ」

各スナップショットは、main checkout で `git status --porcelain -z --no-renames`（whole-repo、ignore は既定で除外）を実行し、
出力 path を監視 glob（D3）で `matchGlob` フィルタし、残った各 path について作業ツリーの content を sha256 でハッシュ化した
マップ `{ path → hash | DELETED }` とする（`digestArtifacts` と同じ hash 規約）。before/after のマップ差分が変更集合。

- **Rationale（なぜ porcelain 文字列比較でなく hash か）**: porcelain の XY 文字だけの比較は、
  「操作者が既に dirty な監視ファイルを、step 中に agent がさらに書き換えた」ケースで letter が変わらず見逃す。
  content hash なら before/after で同一 path の中身差分（要件1「内容変更」）まで決定的に捕捉できる。
- **フィルタで status を使う理由**: `git status` は ignore を除外し、変更のある path のみを返すため、
  ハッシュ対象は監視 glob に一致した「実際に変わった少数の path」に限定される。ディレクトリ walk も glob 展開も不要で、
  clean な監視ファイルは status に現れず before/after ともマップに載らない → 差分ゼロ → 無検出（要件4）。
- **変更種別の導出（純関数）**: after のみに存在 = `created`、before のみ = `modified`（step 中に committed 状態へ戻された等も含む）、
  両方に存在し hash 相違 = `modified`、after が DELETED = `deleted`。
- **`--no-renames`**: rename 検出を無効化し、各変更を単一 path の add/delete/modify として扱い `-z` パースを単純化する。
- **Alternatives considered**:
  - *porcelain 文字列の集合比較のみ* — 実装は軽いが「既 dirty ファイルへの追記」を見逃す。要件1を満たさない。却下。
  - *pathspec で `git status` をスコープ* — glob→git pathspec magic の変換が煩雑。whole-repo status + `matchGlob` フィルタの方が
    既存 glob 意味論と一致し単純。任意最適化として pathspec スコープは可（挙動不変な範囲で）。

### D5: 検出時は escalation（awaiting-resume + resumePoint）、auto-revert しない

drift 検出時は timeout escalation（executor.ts:395-431）と同型で `awaiting-resume` へ遷移し、
`resumePoint`（step / reason）を書き、検出 path + 変更種別を state に記録して run を停止する。以降 `finalizeStepArtifacts`（commit）へは進まない。

- **state 記録**: JobState に optional フィールド `mainCheckoutDrift`（`{ changes: {path, kind}[]; detectedAtStep; ts }`）を追加。
  timeout と同様に `recordFailedStepResult` + `transitionJob(..., "awaiting-resume", { patch: { resumePoint, mainCheckoutDrift, error } })`
  + `appendInterruption` + `appendHistory` + `persist` + `attachStateAndRethrow` を行う。
- **CLI 出力**: `errorInfo`（code `MAIN_CHECKOUT_WRITE_DETECTED`）に検出差分・「操作者自身の main checkout 並行編集の可能性」・
  「確認のうえ `specrunner job resume <slug>` する」案内を含め、`runner.ts` の awaiting-resume 描画（`resumePoint.reason` +
  `mainCheckoutDrift` 由来の差分行）で表示する。
- **Rationale**: main checkout への書き込みは操作者自身の正当な編集の可能性があり、機械では帰属を判定できない。判断は人間に返す。
  停止を commit 前に置くのは timeout escalation と同じ流儀で、resume は `resumePoint.step` から当該 step を再実行する。
- **Alternatives considered**:
  - *自動 revert* — 操作者の正当な編集を破壊し得る。却下。
  - *警告のみで継続* — 逃避書き込みが未確認のまま PR まで進み、要件3（継続しない）に反する。却下。

### D6: snapshot seam は never-throw（fail-open backstop）

`snapshotMainCheckoutGuard` は git/fs エラー時に例外を投げず `null` を返す。before または after のいずれかが `null` の場合、
executor は当該境界の検出を skip する（`captureHeadSha` / `digestArtifacts` / `listChangedFiles` の never-throw 契約に倣う）。

- **Rationale**: git の一過性エラーは逃避書き込みの証拠ではない。fail-open にすることで要件4（変更なし run の挙動不変）が
  一過性エラーでも保たれ、spurious な escalation を防ぐ。本層は backstop（一次防御は別 request の adapter 制限）であり、
  エラー時の見逃しは許容される。

### D7: 検査対象は agent step のみ（cli step 非対象）

検出ロジックは `runAgentStep` にのみ配置し、`runCliStep`（pr-create 等）には追加しない。

- **Rationale**: 逃避書き込みは agent tool 実行に起因する。cli step は agent を起動しないため対象外（スコープ外宣言に一致）。

## Risks / Trade-offs

- [Risk] step 中に操作者が監視対象 path を並行編集すると escalation する（帰属を機械判定できない）
  → Mitigation: これは設計上の意図。CLI 出力に「操作者自身の並行編集の可能性」を明示し、確認後 `job resume` で継続できる案内を含める（D5）。
- [Risk] 2 回の `git status` + 少数ファイルの hash による step ごとの追加コスト
  → Mitigation: status は監視 glob 一致の少数 path のみハッシュ対象。実運用の main checkout 変更は少数で無視できる。managed / no-worktree では null で即 skip。
- [Risk] 既 dirty ファイルへの追記見逃しを完全に消すには content hash が必要で、pure porcelain より実装がやや重い
  → Mitigation: hash は `digestArtifacts` の既存規約を再利用し、対象は status 一致 path のみに限定して重さを抑える（D4）。
- [Risk] `mainCheckoutDrift` の JobState 追加は persisted-format（schema.ts）への変更
  → Mitigation: optional フィールド + 不在許容 validation で後方互換（`resumePoint` の validation 流儀に一致）。本 request は spec-change であり fast pipeline は走らないため conformance の forbiddenSurfaces 検査には抵触しない。

## Open Questions

- 監視 path 解決（`resolveMonitoredGuardGlobs`）と `matchGlob` フィルタを step 純モジュールに置く前提だが、
  実装時に DSM 閉包（`runtime→step`・`step→reviewers`・`step→config` が既存許可エッジであること）を再確認し、
  新たな層間逆依存を導入しないこと。導入が避けられない場合は spec-review へ escalation する。
