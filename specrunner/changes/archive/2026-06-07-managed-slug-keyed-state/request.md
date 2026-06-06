# managed runtime の machine-local state を slug キーに移す

## Meta

- **type**: spec-change
- **slug**: managed-slug-keyed-state
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

managed runtime は worktree / feature branch を**持たない**（no-op workspace）。request.md は main の `changes/<slug>/` に commit するが、進行中の JobState は branch-borne にできないため `.specrunner/jobs/<jobId>/`（machine-local, jobId キー）に置いている。`list()` は `.specrunner/local/<slug>/marker.json` から jobId を引き、そこから jobs-dir の state を load している。

managed の state は本質的に machine-local（cloud agent が実体を進め、local CLI は追跡するだけ）であり、branch-borne 化は不適切。一方 `.specrunner/jobs/` を完全廃止するには managed もこのディレクトリから外れる必要がある。

本変更は managed の machine-local state を、jobId キーの `.specrunner/jobs/<jobId>/` から **slug キーの `.specrunner/local/<slug>/`**（既に marker / liveness が置かれる場所）へ移す。machine-local な性質は保ったまま、キーを jobId から slug に変え、jobs-dir 依存を断つ。

## 要件

1. managed runtime の JobState 永続化先を `.specrunner/jobs/<jobId>/` から `.specrunner/local/<slug>/`（state.json + events.jsonl）に変更する。`managed.ts` の `updateJobState` / `bootstrapJob` / `persistJobState` / `storeFactory` / `registerCleanup`（SIGINT/SIGTERM ハンドラ内の persist）の全 persist 経路が対象。
2. managed の `list()` 経路（section 4: marker → jobs-dir load）が `.specrunner/local/<slug>/` から state を読む。
3. `loadStateByJobId` / `resolveStateStoreByJobId` の managed 分岐（`kind="managed"` → jobId-based store）を `.specrunner/local/<slug>/` に向ける。
4. marker.json と state の役割が整理される（marker は index、state.json が full state）。重複・不整合を残さない。

## スコープ外

- `.specrunner/jobs/` の helper / fallback / doctor の撤去、旧データ migration（別 request `retire-jobs-dir`）

## 受け入れ基準

- [ ] managed runtime の run / resume 後、state が `.specrunner/local/<slug>/` に書かれ `.specrunner/jobs/<jobId>/` には書かれない
- [ ] `job ls` / `job show` / `cancel` / `resume` が managed job を `.specrunner/local/<slug>/` 起点で正しく扱う
- [ ] managed の読み取り・解決経路で `.specrunner/jobs/` を参照しない
- [ ] `.specrunner/local/<slug>/marker.json` が index として残存し、同ディレクトリの `state.json` と `jobId` が一致する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **branch-borne でなく slug キーの machine-local へ**：managed は worktree / branch を持たないため state を branch-borne にできない。machine-local の性質を保ちつつキーを jobId → slug に変える（`.specrunner/local/<slug>/`）のが最小変更。
- **既存 sidecar 位置の再利用**：marker.json / liveness.json と同じ `.specrunner/local/<slug>/` に state を置き、machine-local index の集約先を slug に統一する。
