# Design: designLayer 有効時に未 push の設計コミットを run 前に警告する

## Context

job の worktree は `origin/<baseBranch>` を base に分岐する（`LocalRuntime.setupWorkspace` の run path で `git fetch origin` 後、`remoteBaseRef = \`origin/${baseBranch}\`` を base に `manager.create` する）。一方、designLayer の入口ゲート（`<designLayer.command> check --request`）は preflight の cwd = **local checkout** に対して走る（`src/core/preflight.ts` → `src/core/design-layer/check-gate.ts`）。base ref に対しては検証しない。

このため、設計/bootstrap コミットが local にのみ存在し `origin/<baseBranch>` へ未 push のとき、preflight は local checkout 上でそれらを見て pass する。しかし worktree は `origin/<baseBranch>` から作られるためそれらのコミットを欠き、worktree 内で走る request-review が request の引用する設計要素（`[[id]]` / ADR 等）を解決できず、pipeline 途中で escalation する。利用者から見ると preflight を通ったのに後段で「設計要素が見つからない」と落ち、原因（base が origin であること・設計コミットが未 push であること）を追いにくい。

### 現状コード（grep 再検証済み）

- `src/core/runtime/local.ts` `setupWorkspace()` run path:
  - `const remoteBaseRef = \`origin/${baseBranch}\`;` — worktree はこの ref を base に分岐する。
  - `git fetch origin` を実行（失敗時 throw）。この直後、`git rev-list HEAD..${remoteBaseRef} --count` で local が remote より **behind** のとき informational warning を `stderrWrite` で出す。`exitCode === 0` かつ `behind > 0` のときのみ出力。**ahead**（未 push）は検出していない。
  - `stderrWrite` は `../../logger/stdout.js` から import され `process.stderr.write` に出力する。
- `setupWorkspace()` の behind 判定ブロックは、resume 系の early-return（`existingWorktreePath` が指定 or `null`）の**後**にあり、**run path でのみ**到達する。resume path は `git fetch` を走らせない。
- `src/core/port/runtime-strategy.ts` `WorkspaceOptions`: `baseBranch?`, `branchName?`, `requestType?`, `bootstrapState?`, `noWorktree?` を持つ。designLayer 有効性を運ぶフィールドは無い。
- `src/core/command/pipeline-run.ts` `prepare()`: `this.preflightResult` から `config` を保持済み。返り値の `workspaceOpts` に `baseBranch: request.baseBranch` 等を詰める（run path の唯一の `WorkspaceOptions` 生成点）。
- `src/core/command/resume.ts` `prepare()`: resume path の `workspaceOpts` を生成する（`existingWorktreePath` を含む）。
- `src/config/schema.ts` `resolveDesignLayerConfig(config): ResolvedDesignLayer` — `{ enabled, command, requireCitationTypes }` を欠損既定込みで返す（`enabled = config.designLayer?.enabled === true`）。
- `docs/request-authoring.md` — 「設計要素引用 — 設計レイヤとの紐付け（任意）」節に designLayer の `[[id]]` 引用と preflight の `aozu check` を記述済み。worktree の base が `origin/<baseBranch>` である旨や push 順序の記述は無い。
- `tests/unit/core/runtime/local.test.ts` — `buildMockSpawnFn({ behindCount, behindExitCode })` を注入し、`setupWorkspace` の run path で behind-warning が出る/出ないことを固定するテスト群（TC-LR-008）を持つ。mock の `rev-list` 分岐は現状 range を区別せず単一 `behindCount` を返す。

## Goals / Non-Goals

**Goals**:

- designLayer が enabled かつ local `<baseBranch>` が `origin/<baseBranch>` より **ahead**（未 push コミットあり）のとき、run 前（`setupWorkspace` の run path、preflight 相当のタイミング）に非ブロッキングの warning を出す。warning は「worktree が `origin/<baseBranch>` から作られるため引用設計要素を欠く可能性」と「push してから run する対処（push コマンド）」を含む。
- 既存の behind-warning（`git rev-list HEAD..${remoteBaseRef} --count`）の**対称**として、`git rev-list ${remoteBaseRef}..${baseBranch} --count` による ahead 検出を追加する。behind-warning の挙動・出力は不変に保つ。
- docs に「worktree の base = `origin/<baseBranch>`」と「designLayer 連携時は設計コミットを `origin/<baseBranch>` に push してから run する」を明文化する。
- designLayer disabled のプロジェクト、および ahead が 0 のケースでは新 warning を一切出さない（既存挙動の完全保存）。

**Non-Goals**（request のスコープ外に一致）:

- designLayer コマンド（aozu 等）側の resolution ロジック変更。designLayer は opaque command のまま扱う。
- base ref を local HEAD に変える案（再現性・clean base を壊す）。
- hard-fail 化（未 push コミットが設計と無関係な場合に正当な run を誤ブロックする。本 change は非ブロッキング warning に留める。より厳格な gate は将来の別 request）。
- designLayer disabled 時の挙動変更。
- resume path での ahead 検出（resume は `git fetch` を走らせず origin ref が stale になり得るため対象外。behind-warning と同じく run path 限定）。

## Decisions

### D1: ahead 検出は既存 behind-warning の直後・同一ブロックに置く（`setupWorkspace` run path）

`LocalRuntime.setupWorkspace()` の run path、behind-warning ブロックの**直後**に ahead 検出を追加する。

- designLayer が enabled のときのみ `git rev-list ${remoteBaseRef}..${baseBranch} --count` を `this.spawnFn` で実行する。
- `exitCode === 0` かつ parse した `ahead > 0` のときのみ `stderrWrite` で warning を出す。それ以外（exit 非 0、NaN、ahead 0）は無出力。
- designLayer が enabled でないときは rev-list を**一切 spawn しない**（disabled プロジェクトへの影響ゼロ、余計な git 呼び出しもしない）。

**Rationale**: 原因（base = origin、設計コミット未 push）が顕在化するのは「worktree を origin base から作る」まさにこの地点であり、既に `git fetch origin` 済みで `origin/<baseBranch>` が fresh。preflight（`preflight.ts`）は `git fetch` を伴わないため origin ref が stale になり得て、ここより劣る。behind-warning と同居させることで「local base と origin base の位置関係を run 前に告知する」という単一の関心を一箇所に閉じ込められる。**却下した代替**: (a) preflight にゲートを足す — fetch 前で origin ref が stale、かつ preflight は managed runtime でも走るが未 push 問題は local checkout 固有。(b) hard-fail — 未 push が設計無関係なケースで正当な run を誤ブロックする（request スコープ外）。

### D2: ahead 判定は `baseBranch` を対象にする（behind は HEAD、ahead は baseBranch の非対称を意図として持つ）

ahead 数は `git rev-list ${remoteBaseRef}..${baseBranch} --count` で求める（request 指定式）。behind 側が `HEAD..${remoteBaseRef}` で **HEAD** を使うのに対し、ahead 側は **`baseBranch`** を使う。

**Rationale**: worktree が分岐する起点は `origin/<baseBranch>` であり、そこへ未反映なのは「local `<baseBranch>` に積まれた未 push コミット」である。現在の checkout（HEAD）が何であれ、問題になるのは local base branch の origin に対する先行分。よって対象は `baseBranch` が正しい。**却下した代替**: `HEAD..` 起点で ahead を測る — 現在 feature ブランチに居る等で local base branch の先行を取りこぼす。request が採用式を明示しているため、それに従う。

### D3: designLayer 有効性は `WorkspaceOptions.designLayerEnabled?: boolean` で run path のみに注入する

`setupWorkspace` は config を保持しない。designLayer の有効性は `WorkspaceOptions` に `designLayerEnabled?: boolean` を新設して運ぶ。`pipeline-run.ts` `prepare()`（run path の唯一の `WorkspaceOptions` 生成点）が `resolveDesignLayerConfig(config).enabled` を解決して詰める。resume path（`resume.ts`）は設定しない（未設定 = `undefined` は disabled と同義で、ahead 検出は走らない）。

**Rationale**: `baseBranch` が既に `WorkspaceOptions` 経由で run path から注入されており、同じ carrier に隣接させるのが最小差分かつ一貫。port（`runtime-strategy.ts`）に config 型（`ResolvedDesignLayer`）を持ち込まず boolean 1 枚に落とすことで、port → domain 依存を増やさない。resume 未設定は「resume は ahead 検出対象外」という Non-Goal を型レベルで自然に満たす。**却下した代替**: (a) `LocalRuntime` コンストラクタに config を注入 — 構築点が増え、run/resume で有効性が分岐する意図が表現しづらい。(b) `WorkspaceOptions` に `ResolvedDesignLayer` 全体を載せる — 判定に必要なのは `enabled` のみで、port の依存面を不必要に広げる。

### D4: warning 文言は安定 substring を含む自己完結メッセージにする

warning は「designLayer が有効で local `<baseBranch>` が `origin/<baseBranch>` より N commit(s) ahead（未 push）」「worktree は `origin/<baseBranch>` から作られるため引用設計要素（`[[id]]` / ADR）を欠く可能性」「`git push origin <baseBranch>` してから run する」を 1 メッセージに含める。テストが照合する安定 substring として `ahead of origin/<baseBranch>` を含める（behind-warning が `behind origin/<baseBranch>` を含むのと対称）。

**Rationale**: メッセージ単体で原因と対処が読めること（成果物は文脈非依存で読める）と、テストが文言全体でなく安定トークンで固定できることの両立。**却下した代替**: エラーコード化して構造化出力にする — 非ブロッキング informational であり behind-warning と同格の平文で足りる。

## Risks / Trade-offs

- **[Risk] local に `<baseBranch>` ブランチが存在しない（detached / remote-tracking のみ）と `rev-list ${remoteBaseRef}..${baseBranch}` が非 0 で終わる** → Mitigation: behind-warning と同じく `exitCode === 0` を gate にし、非 0/NaN は無出力（best-effort）。local base branch が無ければ未 push の base コミットも無い扱いで許容する。
- **[Risk] diverged（ahead かつ behind 両方 > 0）のとき両 warning が出る** → Mitigation: 意図的に独立判定とし、両方 informational として出す。矛盾はなく情報量が増えるだけ。
- **[Risk] 既存 behind テストが mock 変更で壊れる** → Mitigation: mock の `rev-list` 分岐を range で振り分ける（`HEAD..` は behind、`origin/..` は ahead）。既存 behind テストは `designLayerEnabled` を渡さないため ahead 側 rev-list は spawn されず、behind 側の戻り値・呼び出し回数は不変。
- **[Risk] 余計な git 呼び出しが増える** → Mitigation: rev-list は designLayer enabled かつ run path のときのみ 1 回。disabled では追加 spawn ゼロ。

## Open Questions

- 無し（採用式・配置・非ブロッキング方針は request の architect 評価で確定済み）。
