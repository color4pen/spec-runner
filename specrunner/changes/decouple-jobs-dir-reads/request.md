# `.specrunner/jobs/` への読み取り依存を slug/sidecar 起点に移行する

## Meta

- **type**: spec-change
- **slug**: decouple-jobs-dir-reads
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

job state は2系統で保持される：

- **slug 正本**（`specrunner/changes/<slug>/`, branch-borne）— status / step / journal / pullRequest などポータブルな真実
- **sidecar**（`.specrunner/local/<slug>/liveness.json`, machine-local）— `jobId ↔ slug ↔ worktreePath` + pid / session の index

加えて legacy の jobId-keyed ストア `.specrunner/jobs/<jobId>/` が dual-write されており、多くのコマンドが読み取りでこれに依存している。jobId ストアは冗長で、main 直下コピーは job 作成時の stub のまま凍結するため、読むストアの取り違えによる不整合の温床になっている。

本変更は **local runtime job** について `.specrunner/jobs/` への**読み取り依存をゼロ**にする。jobId / cross-branch アクセスは「sidecar で `jobId → slug → worktreePath` を解決 → その slug dir（active は worktree 内、archived は `changes/archive/`）から state を読む」経路に置き換える。書き込み（dual-write）は本変更では温存し、既存挙動を壊さない中間状態とする。

managed runtime は full state を `.specrunner/jobs/<jobId>/` のみに保持し slug 正本を持たない（slug dir に dual-write しない）。slug 正本から読む本変更の前提が成立しないため managed runtime はスコープ外とし、managed の jobs-dir 読み取り経路（`list()` の managed marker → jobs-dir）は温存する。

## 要件

1. `JobStateStore.resolveId`（jobId / 短縮 prefix 解決）が `.specrunner/jobs/` をスキャンせず、sidecar（local の `liveness.json` + managed の `marker.json` はいずれも jobId を持つ）+ slug dir から解決する。
2. local runtime job の状態読み取り caller を slug 経由に移行する：`job show`、`job cancel`（load）、`resume`（load）、archive の `resolve-target`（load）。
3. `JobStateStore.list()` が local runtime job について `.specrunner/jobs/` をスキャンしない（active=worktree 内 slug dir、archived=`changes/archive/`、index=sidecar で代替）。managed marker → jobs-dir 経路（section 4）は温存する。
4. `archive` Phase 2 の worktreePath クリアが jobId ストアでなく sidecar を更新する（isolated な読み書きの repoint。dual-write 本体には触れない）。
5. `job ls` / `job show` の cross-branch 可視性が現状維持される（別ブランチ上の local active job も status / step が見える、managed job も現状どおり可視）。worktree が存在しない未 archive の local job は degrade した表示でよいが、jobId は失わない。

## スコープ外

- **managed runtime の jobs-dir 依存**（managed は slug 正本を持たないため、managed の slug 化を前提とする別 request で対応）
- jobId ストアへの書き込み（dual-write 本体）の撤去
- `JobStateStore.load()` の `.specrunner/jobs/` fallback 除去
- 旧 `.specrunner/jobs/<jobId>(.json|/)` データの migration、`xdg.ts` helper / doctor checks の撤去

## 受け入れ基準

- [ ] `list()` / `resolveId()` が local runtime job について `.specrunner/jobs/`（local split-layout）を readdir しない。integration test で `fs.readdir` を spy し、section 3（local jobs-dir スキャン）が呼ばれないことをアサートする。managed の section 4 は対象外
- [ ] `job show <jobId>` / `job cancel <jobId>` / `resume <jobId>` が sidecar（`liveness.json` / `marker.json`）経由で `jobId → slug` 解決できる
- [ ] `job ls` が別ブランチ上の local active job を現状どおり表示し、managed job も現状どおり可視である
- [ ] dual-write は温存され、既存の jobId-store 書き込み挙動は変わらない
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **managed runtime はスコープ外**：managed は full state を `.specrunner/jobs/<jobId>/` のみに保持し slug 正本を持たない（slug dir に dual-write しない）。slug 正本から読む本変更の前提が成立しないため、managed の jobs-dir 読み取り（`list()` section 4）は温存し、managed の slug 化は別 request で対応する。
- **jobId / cross-branch 解決の経路**：jobId → slug の解決は sidecar（local の `liveness.json` / managed の `marker.json`、いずれも jobId を保持）を index として行い、state 本体は slug dir（active=worktree 内、archived=`changes/archive/`）から読む。`.specrunner/jobs/` を読み取り経路から外す。
- **書き込みは温存**：dual-write 本体は本 request で変更せず、読み取り移行のみの安全な中間状態とする（書き込み撤去は後続 request）。
