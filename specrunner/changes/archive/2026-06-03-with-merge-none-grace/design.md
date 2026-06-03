# Design: `job archive --with-merge` の `none`（check 未出現）早期 merge を grace 待ちで塞ぐ

## Context

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）の wait ループは、check rollup を毎周取得して terminal まで待つ。現状の判定は次の 1 行で `success` と `none` を畳んでいる:

```
if (rollup.state === "success" || rollup.state === "none") { break; /* → merge */ }
```

`rollup.state === "none"` は「head commit に check run も combined status も一つも無い」状態であり、2 つの状況を区別できない:

- **CI が無い repo**（恒久的に `none`）→ そのまま merge へ進むのが正しい。
- **push / force-push 直後で CI の check がまだ作成されていない**（一時的に `none`）→ CI 開始前に early-merge してしまう。

rebase-finish は `git push --force-with-lease` 直後に `--with-merge` を呼ぶため、後者の窓を踏む。CI ありの repo でも、この一瞬だけ「green まで待つ」が機能せず CI 開始前に merge されうる。本 repo は private + 非 Team account のため branch protection を強制できず、GitHub 側で塞げない。tool 側（`merge-then-archive.ts`）で塞ぐ必要がある。

このレースは先行 change（`--with-merge` wait ループ化）の Open Question で「初回 none に短い grace を入れるべきか。本 design では入れない。必要なら追加 request で扱う」と明記された残課題そのものである。本 change はその追加 request にあたる。

構造制約: archive 本体（`src/core/archive/orchestrator.ts`）は **client-closed**（GitHubClient(port) 非依存）を維持する。check 読み・wait・merge は opt-in merge 経路（`merge-then-archive.ts`）に閉じたままにする。

## Goals / Non-Goals

**Goals**:

- 初回 `none` で即 merge せず、grace 期間内は poll interval ごとに再取得して check の出現を待つ。
- grace 内に check が出現（state が `pending` / `failure` / `success` になる）したら、既存の wait ループ判定に合流する（pending→待つ / failure→escalation / success→merge）。
- grace を超えても `none` のままなら、CI が無い repo と判断して merge へ進む。
- grace を **有限・bounded** にし、**main の wait timeout（`mergeWaitTimeoutMs`、`null` = 無制限を含む）とは独立**にする。これにより CI が無い repo で無制限 timeout を設定していても永久 hang しない。
- grace の長さは **60 秒の固定ハードコードデフォルト**。**不変のハードコード定数とし、config 化はしない**。

**Non-Goals**:

- 待つ check の subset / allowlist 選択（全 check 待ちのまま）。
- `pending` / `failure` / `success` / `DIRTY` / `BLOCKED` の既存挙動の変更。
- archive 本体（`orchestrator.ts`）の変更。client-closed を維持する。
- grace の config 化・flag 化（過剰なため導入しない）。
- 新しい port メソッドの追加（既存 `getCheckStatus` / `getPullRequest` で足りる）。

## Decisions

### D1: `none` を `success` から切り離し、専用の grace 分岐にする

現状 `success || none` で一括 break している箇所を分割する:

- `success` → 従来どおり即 break して merge へ。
- `none` → 即 break しない。grace 分岐へ入り、grace 期間内は poll interval ごとに再取得して check の出現を待つ。

`failure` / `pending` の分岐は変更しない。`none` の時のみ grace を経由する。これにより「初回 none の即 merge」だけをピンポイントで塞ぎ、他の状態遷移には触れない。

grace 内に再取得した rollup が `none` 以外（`pending` / `failure` / `success`）になった場合は、その周回でそのまま既存の各分岐に落ちる（pending → 待機 / failure → escalation / success → merge）。grace 分岐は「`none` の時だけ」発動するため、check が出現すれば自然に既存判定へ合流する。

**rationale**: 要件は「初回 none の早期 merge を塞ぐ」ことだけで、green/pending/failure/conflict の確定挙動は据え置き。`none` 分岐の分離は最小の blast radius で要件1（grace 待し）と「合流」を同時に満たす。

**alternatives**:
- ループ全体を書き換えて状態機械を再設計する → 不採用。既存の pending/failure/conflict 挙動を据え置く Non-Goal に反し、blast radius が無駄に広がる。
- `getCheckStatus` の戻りで `none` を adapter 側で `pending` に化けさせる → 不採用。adapter の anti-corruption（実態を正規化する）責務を歪め、CI 無し repo を恒久 pending にして merge 不能にする。grace は core の policy であり core に置く。

### D2: grace は「初回 `none` 観測」を起点とする独立クロックで bounded にする

grace の計測は、main の wait timeout（`effectiveTimeoutMs`、`null` 含む）とは**別のクロック**で行う。

- 初めて `none` を観測した時刻を起点（grace start）として記録する（set-once。以降リセットしない）。
- 各 `none` 周回で「`nowFn()` − grace start ≥ grace 長」なら grace 超過とみなし break → merge へ進む（CI 無し repo 確定）。
- 未超過なら `sleepFn(pollIntervalMs)` して次周へ。
- 起点記録直後（初回 none）は経過 0 < grace 長のため必ず一度は待機し、即 merge しない。

grace 分岐は `effectiveTimeoutMs` を一切参照しない。よって `mergeWaitTimeoutMs: null`（無制限）でも grace は有限上限を持ち、CI 無し repo が永久 hang しない（要件2）。逆に `pending` 分岐は従来どおり `effectiveTimeoutMs` のみを見て grace を参照しない。2 つのタイマーは独立する。

時刻は既存の注入可能な `nowFn?: () => number`（default `Date.now`）で取得し、待機は既存 `sleepFn` を使う。これによりテストで grace の経過を決定的に制御できる。

**rationale**: 「初回 check 出現を待つ」grace と「CI 完了を待つ」main timeout は目的が異なる。前者は数十秒オーダーで必ず打ち切れねばならず（CI 無し repo の永久 hang 回避）、後者は無制限を許す。両者を同一クロックに乗せると、無制限 timeout 時に grace まで無制限になり要件2 を満たせない。独立クロックが必須。

**alternatives**:
- grace を main timeout に相乗りさせる → 不採用。`mergeWaitTimeoutMs: null` 時に grace も無制限になり、CI 無し repo が永久 hang する（要件2 違反）。
- grace 起点をループ start に固定する → 不採用。初回 poll で既に check が存在する（`pending` 等）ケースでも grace を起動してしまい無駄。初回 `none` 観測を起点にすれば、check が最初から在る場合は grace を起動しない。

### D3: grace 長は `merge-then-archive.ts` 内の不変ハードコード定数（60 秒）

grace 長は `merge-then-archive.ts` の module スコープ定数（例: `NONE_CHECK_GRACE_MS = 60_000`）として固定する。

- config schema（`src/config/schema.ts` / `ArchiveConfig`）には追加しない。
- CLI flag（`--merge-wait-ms` 等）にも露出しない。
- `MergeThenArchiveInput` にも grace の注入パラメータを追加しない（時間制御は既存の `sleepFn` / `nowFn` 注入で十分テストできる）。

60 秒は CI provider が push 後に check run / commit status を作成するのに十分な余裕で、かつ CI 無し repo の merge 遅延としても許容範囲（要件記載のデフォルト）。

**rationale**: 要件で「不変のハードコード定数とし、config 化はしない（過剰なため）」と明示されている。config / flag を足すと schema validation・解決チェーン・doc・テストが連鎖し、YAGNI に反する。

**alternatives**:
- `ArchiveConfig.checkAppearGraceMs` を追加 → 不採用。要件が明示的に config 化を禁止。schema / validation / CLI 解決の追加コストに見合わない。

### D4: 変更を `merge-then-archive.ts` に閉じ、client-closed を維持する

本 change の production コード変更は `src/core/archive/merge-then-archive.ts` のみ。`src/core/archive/orchestrator.ts` は touch せず、`GitHubClient`(port) 非依存（client-closed）を維持する。port / adapter / config schema / CLI には変更を加えない。

**rationale**: grace は merge 経路の policy であり、archive 本体の決定的なローカル片づけ（folder 移動・push・worktree 撤去）に CI 待ちの不確定性を波及させない。受け入れ基準「変更は merge-then-archive.ts に閉じ、orchestrator.ts は client-closed を維持」を直接満たす。

### D5: grace 挙動を `sleepFn` / `nowFn` 注入で決定的にテストする

時間経過を実時間に依存させず、既存テストと同じ `sleepFn`（待機を no-op 化）+ `nowFn`（仮想時刻を進める）注入で grace の境界を制御する。既存テストの `none → 即 merge` 前提（現 TC-MTA-002）は新挙動（grace 経過後 merge）に更新する。

**rationale**: 受け入れ基準「`sleepFn` / `nowFn` injectable で時間経過を制御」を満たし、CI 上で 60 秒待つことなく grace を検証できる。

## Risks / Trade-offs

- [Risk] CI 無し repo の merge が grace 分（最大 ~60 秒）遅延する。
  - Mitigation: 仕様上の意図的トレードオフ。早期 merge レースの排除と引き換えの上限であり、要件記載のデフォルト。永久 hang はしない（D2）。

- [Risk] `pollIntervalMs` が grace 長より大きい設定だと、grace 中の再取得が 1 回程度に減り、grace が実質「次 poll まで待つ」に縮む。
  - Mitigation: grace は「最低 1 回は待って即 merge しない」を保証すれば要件1（即 merge せず check 出現を待つ）を満たす。default poll 間隔は grace より十分短く（~15s vs 60s）、実用上 3〜4 回再取得される。許容範囲。

- [Risk] check が一旦出現（pending 等）した後に再び `none` に戻る flicker で grace が再評価される。
  - Mitigation: grace 起点は set-once（D2）で一度記録したらリセットしないため、flicker しても grace は bounded を維持し、永久ループにならない。flicker 自体は実運用でほぼ起きず Non-Goal。

- [Risk] 既存テスト `tests/unit/core/archive/merge-then-archive.test.ts` の `none → 即 merge`（TC-MTA-002）が新挙動で壊れる。
  - Mitigation: D5 のとおり当該テストを grace 経過後 merge に更新し、grace 関連の新規 TC を追加する。

## Open Questions

なし（先行 change の Open Question を本 change で解消する）。

## Migration Plan

- 後方互換。CI 無し repo は従来「即 merge」だったところが「最大 ~60 秒待ってから merge」に変わるのみ（永久 hang はしない）。
- config / job state / `.specrunner/config.json` の変更は不要（grace は config 化しないため）。
- port / adapter / CLI の契約変更なし。
