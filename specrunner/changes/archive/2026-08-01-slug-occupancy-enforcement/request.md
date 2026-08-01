# slug 占有不変条件の実装 — start guard・状態基準解決・sidecar 所有・修復口

## Meta

- **type**: spec-change
- **slug**: slug-occupancy-enforcement
- **base-branch**: main
- **adr**: false

## 背景

ADR-20260801（`architecture/adr/2026-08-01-slug-occupancy-and-attempt-identity.md`）と `architecture/dynamic-model.md` は slug 占有不変条件を正典化した: 非 terminal（`status ∉ TERMINAL_STATUSES`）の job は slug につき高々一つ、変更系の slug→job 解決は状態基準、liveness sidecar の所有者は非 terminal job のみ・解除は自 jobId 限定・破れの裁定は人間。実装は未追随（`architecture/divergence-status.md` の既知 divergence 2026-08-01）。

0.4.8 利用プロジェクトで実害が発生した: halt 中（`awaiting-resume`）の slug へ誤って `job start` → 新 job が liveness sidecar を上書き → 新 job を `job cancel`（sidecar は残置）→ `job resume <slug>` が updatedAt 最新の cancel 済み job を選択して拒否、`job show <旧jobId>` は sidecar 索引から消えた旧 job を JOB_NOT_FOUND、`job ls` だけが旧 job を awaiting-resume と表示。復旧手段は `.specrunner/` 内部ファイルの手動手術のみで CLI の中に出口が無かった。

本 request は divergence を解消し、既存の破れた断面に CLI 内の修復口を与える。

## 現状コードの前提

- `src/core/runtime/duplicate-slug-guard.ts:40-84` — start の重複防御は liveness sidecar の `pid` 生存のみ検査。pid 死亡・sidecar 欠落・JSON 破損はすべて許可（fail-open）。非 terminal job の存在は見ない
- `src/core/resume/resolve-job.ts:18-35` — `resolveJobStateBySlug` は slug 一致の全 state（includeArchived: true）から `updatedAt` 最新を返す。status を見ない
- `src/core/cancel/runner.ts:437-446` — liveness sidecar の削除は `--purge` 時のみ（slug ディレクトリごと無条件 rm）。通常 cancel は sidecar を残置する。jobId 一致チェックは無い
- `src/core/cancel/runner.ts:423-431` — managed marker（`marker.json`）の unlink は jobId 一致に関わらず無条件
- `src/core/runtime/local.ts:1417-1425` — liveness sidecar の書き込みは既存チェック無しの上書き（worktree 経路は `src/core/runtime/workspace-materializer.ts` が担う）
- `src/store/local-job-index.ts:42-89` — jobId→slug 索引は `.specrunner/local/<slug>/` 走査で slug あたり sidecar 1 枚。`src/core/job-access/load-by-job-id.ts:79-84` はこの索引に無い jobId を fallback 無しで JOB_NOT_FOUND にする
- `src/cli/progress.ts:162-166` — `pipeline:complete` handler は payload の state を見ず無条件に `Next: specrunner job archive <slug>` を印字する。`pipeline:complete` は halt（awaiting-resume で戻る）でも発火する（`src/core/pipeline/pipeline.ts:145-148`）
- `src/core/inbox/run-inbox.ts:339-376` — inbox effects に `postRejectComment` seam が既存。`startJob` は `runRunCore` を呼ぶ
- `src/core/doctor/checks/` — doctor は checks カテゴリ構成（agents / auth / config / env / repo / runtime / storage）
- `src/state/lifecycle.ts` — `TERMINAL_STATUSES` / `ACTIVE_STATUSES` が正典
- `src/errors.ts:53-114` — `ERROR_CODES` 台帳。`DUPLICATE_LIVE_JOB` 既存

## 要件

1. **start guard を占有不変条件の検査にする**。`job start` / `run` の入口で slug の全 state を引き、非 terminal（`∉ TERMINAL_STATUSES`）の先住 job が存在すれば job を作らず拒否する（状態・worktree を作らない着手前 preflight）。拒否は新 error code（`DUPLICATE_LIVE_JOB` とは別。名称は実装裁量）で構造化し、メッセージは先住 job の jobId・status を名指しして出口を案内する: 先住の pid が生存（走行中）→「完了を待つか `job cancel`」、pid 死亡または halt 済み →「`job resume <slug>` するか、やり直すなら `job cancel`」。state が読めない（破損・IO 失敗）場合は通さず、理由を示して拒否する（fail-closed）
2. **sidecar の check-and-claim**。liveness sidecar の書き込みは無条件上書きをやめ、既存 sidecar が指す job の状態を確認してから行う: terminal・state 上に存在しない job の sidecar は stale として奪ってよい。非 terminal job の sidecar は奪えない（要件 1 の guard で通常は到達しないが、競合時の防衛線）。同時 claim の競合は後着が決定的に敗北する
3. **cancel の解除は自 jobId 限定**。cancel は liveness sidecar / managed marker を「自分の jobId と一致する場合のみ」削除する。通常 cancel でも削除する（残置をやめる）。他 job が establish した sidecar は巻き添えにしない。`--purge` のディレクトリ削除も jobId 一致を前提とする
4. **変更系 slug 解決を状態基準にする**。`resolveJobStateBySlug`（resume / reopen の解決）は: 非 terminal が 1 件 → それを返す ／ 0 件 → null（呼び出し側は「続行できる attempt が無い」を案内）／ 複数（不変条件の破れ）→ 暗黙選択せず、候補（jobId・status・updatedAt）を列挙するエラーで停止し doctor を案内する。updatedAt は列挙の表示順にのみ使い、選択根拠にしない
5. **doctor に占有・束縛の整合検査と修復口**。新 check（storage カテゴリ）: (a) slug ごとに非 terminal state を数え、複数あれば不変条件の破れとして報告する (b) sidecar が terminal・不存在の job を指し、かつ同 slug に非 terminal job が存在する場合は食い違いとして報告し、doctor の既存の修復・案内様式に整合する形で sidecar を唯一の非 terminal job へ掛け直せるようにする。**機械修復は一意に決まる場合のみ**。非 terminal 複数の断面は列挙のみ行い、人間の cancel 判断へ委ねる（自動選択しない）
6. **halt 時の Next 案内を最終状態基準にする**。`pipeline:complete` handler は payload の state.status で案内を分岐する: awaiting-archive → `job archive`、awaiting-resume（halt）→ `job resume <slug>`。無条件の archive 案内をやめる
7. **inbox の拒否伝搬**。inbox の startJob 経路で要件 1 の拒否が発生した場合、既存 `postRejectComment` seam で issue に状況（先住 jobId・status・出口）をコメントする。同一の先住 job による拒否は一度だけコメントし、周期実行で同文を連投しない（冪等）
8. **managed runtime の対称**。要件 1 の guard・要件 3 の jobId 一致解除は managed marker（`marker.json`）経路にも同様に適用する

## スコープ外

- 記録層（sidecar）の jobId キー化・`job ls` / `show` / `resume` の単一カタログ統一・`archive` の slug 解決変更（将来 work。ADR-20260801 構造的含意に記載）
- `resume <jobId>` の新設（ADR-20260801 で棄却）
- start が既存 job を自動 resume する挙動（ADR-20260801 で棄却）
- JobStatus 状態機械（遷移表・状態集合）の変更

## 受け入れ基準

- [ ] **シナリオ歯（占有不変条件の end-to-end）**: 「job が awaiting-resume で halt → 同 slug の start が新 error code で拒否され新 state / sidecar が作られない → 先住を cancel すると sidecar は自 jobId 一致で削除される → その後の start は成功する」を一連のテストで固定する
- [ ] guard の単体テスト: 非 terminal 先住（awaiting-resume ／ running + pid 生存 ／ running + pid 死亡）→ 拒否、terminal のみ → 許可、state 読取不能 → 拒否、をテストで固定する
- [ ] cancel のテスト: 自 jobId 一致の sidecar → 削除（通常 cancel でも）、他 jobId の sidecar → 残す、をテストで固定する
- [ ] 解決のテスト: 非 terminal 1 件 + terminal N 件 → 非 terminal を返す（terminal の updatedAt が新しくても）、非 terminal 複数 → 候補列挙エラー、をテストで固定する
- [ ] doctor のテスト: 「sidecar が cancel 済み job を指し、非 terminal job が置き去り」の断面を作り、検出・一意の場合の掛け直し・非 terminal 複数での修復拒否、をテストで固定する
- [ ] Next 案内のテスト: awaiting-resume で完了した pipeline → resume 案内、awaiting-archive → archive 案内、をテストで固定する
- [ ] 既存テストは無変更で green（duplicate-slug-guard の「pid 死亡 → 許可」「破損 → 許可」等、旧 fail-open 挙動を固定していたテストの期待値変更のみ許容し、変更理由を要件 1 / 2 に帰属させる）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 強制点は job 生成入口（検査して throw ＝状態を作らない）。capability gate と同じ着手前 preflight 位置（ADR-20260801 D1）
- **採用**: 変更対象の選択は状態基準。時刻（updatedAt）は表示専用（同 D2）
- **採用**: sidecar 所有は非 terminal job のみ・解除は自 jobId 限定・check-and-claim（同 D3）
- **採用**: 破れの裁定は人間。doctor の機械修復は一意に決まる場合のみ（同 D4）
- **却下**: auto-resume（start が既存 attempt の再開に化ける）— 系が利用者の意図を推測する判断点の新設。halt 後に request を編集した利用者と黙って乖離する（ADR-20260801）
- **却下**: resume の jobId 直指定 — 不変条件が破れた状態への正規入口を作る。jobId を握る操作は cancel / doctor に限る（同）
- **却下**: sidecar 防御を排他作成（O_EXCL）のみにする — 旧バージョン・通常 cancel が残した terminal job の遺留 sidecar で新規 start が全部弾かれる。指し先の状態を確認する check-and-claim が正しい形
