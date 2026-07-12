# job stats のコスト集計で usage.json を slug でなく行の jobId / change-dir から解決し、同一 base-slug の誤配を解消する

## Meta

- **type**: bug-fix
- **slug**: job-stats-cost-per-jobid
- **base-branch**: main
- **adr**: false

## 背景

`job stats`（read-only の run 統計レポート）は、同一 base-slug を持つ複数 run が存在すると **costUsd を誤配する**（issue #749）。`JobStateStore.list` は行を jobId で dedup するため、同一 slug・別 jobId の run（例: archive 済 `2026-05-01-foo` と後発の `foo`）は別々の行として現れる。一方 usage.json の解決は `resolveChangeDir(slug)` を通しており、これは 1 slug につき 1 つの change-dir（active → 最新日付の archive）しか返さない。結果、非最新 jobId の行は自分の usage.json に辿り着けない。

現状は latent（archive の base-slug 重複が 0 件）。ただし request slug から日付 prefix を外す方針のため、archive 済 base-slug と衝突する新規 request が出れば顕在化する。`durationSec` / `convergence` は各 state 固有の `state.steps` から導出されるため影響を受けず、**影響は cost のみ**。

## 現状コードの前提

- `src/core/command/job-stats.ts:379` — IO オーケストレータ `runJobStats` が `resolveChangeDir(slug, cwd)` で change-dir を 1 つ解決し、その `usage.json` を全行で読む。**これが誤配の原因**
- `src/core/command/job-stats.ts:151-173` — pure 導出 `deriveRunStat` は既に `state.jobId` で `usageFile.commandInvocations` をフィルタしている（`inv.jobId !== undefined && inv.jobId !== stateJobId` を除外）。したがって **正しい usage.json さえ渡せば per-jobId 集計は既に正確**。ただし `inv.jobId === undefined`（legacy 形式）の invocation は無条件に加算されるため、同一 usage.json を複数行が読むと legacy 分が重複計上されうる
- `src/core/job-access/resolve-change-dir.ts:16-56` — `resolveChangeDir(slug, repoRoot)` は active → 最新 archive の順で **1 slug → 単一 dir**。jobId は見ない
- `src/store/job-state-store.ts:206` — `list()` は jobId で dedup（newest updatedAt wins）。各 state は列挙時に自分の source（slug 規約パス / archive dir / `changeDir` seam / worktree）から load されており、**source dir は list 内部では既知**。ただし返り値 `NormalizedJobState` がそれを保持しているかは未確認（design で確認・必要なら露出する）
- `state.jobId`（`NormalizedJobState`）は行ごとに一意

## 要件

1. コスト集計で、各 state 行の `usage.json` を **その行の jobId に対応する change-dir**（＝その state が load された source）から解決する。`resolveChangeDir(slug)` の「slug → 単一 dir」解決を、コスト集計経路の usage 解決から外す
2. 同一 base-slug・別 jobId の複数行が、それぞれ自分の `usage.json` を読み、cost が他行へ誤配（重複計上・取りこぼし）されないことをテストで固定する
3. `deriveRunStat` の `state.jobId` フィルタ（既存）は維持する。要件 1 で正しい usage を供給することで、legacy（`jobId === undefined`）invocation が別行の usage.json へ混入して重複計上される経路も塞ぐ
4. `durationSec` / `convergence` の集計は不変。usage.json 欠落行（未計測 run）の従来挙動（cost を null セル `-` にする・行を drop しない）を維持する

## スコープ外

- stats の出力フォーマット・median / mean 算出ロジック・並び順
- usage.json の記録側（生成経路・スキーマ）
- `resolveChangeDir` の他呼び出し元（archive / view 等）の挙動 — 変えるなら本関数のシグネチャ変更でなく job-stats 経路の usage 解決を差し替える方向
- slug からの日付 prefix 撤廃そのもの（別方針。本 request は撤廃前提でも後でも正しく集計されるようにするだけ）
- pipeline 本体の正しさ（本 issue は read-only レポートに閉じる）

## 受け入れ基準

- [ ] 同一 base-slug・別 jobId の 2 run（別 change-dir に各々の usage.json）が、それぞれ自分の cost を計上し、互いに誤配しないことをテストで固定する（archive 済 base-slug ＋ 後発 slug の fixture）
- [ ] legacy（`jobId === undefined`）invocation を含む usage.json が、別 base-slug 行の集計へ混入しないことをテストで固定する
- [ ] `durationSec` / `convergence` の導出が無変更であることを既存テストで担保（無変更で green）
- [ ] usage.json 欠落行の cost が null（`-`）になり、行が drop されない従来挙動が維持される
- [ ] `typecheck && test` が green

## 設計の方向（request 作成者の推奨・design step で確定する）

- **推奨**: `JobStateStore.list` が各行の source change-dir（または usage.json パス）を返すよう露出し、`runJobStats` はそれを `deriveRunStat` へ渡す。list は既に各 state を固有の source から load しているため、その dir を捨てずに持ち回るのが最小で、jobId→dir の再走査を避けられる
- **代替（design 判断）**: source dir を露出しない場合、change-dir を列挙して各 dir の `state.json` の jobId と行の jobId を照合し usage.json を引く。ただし list の dedup 済み集合と再走査集合の不整合リスクがあるため、推奨案（source を持ち回る）を優先する
- `resolveChangeDir` 自体のシグネチャは変えない（他呼び出し元への波及を避ける）
