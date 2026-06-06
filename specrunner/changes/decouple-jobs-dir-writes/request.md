# local runtime の state 書き込みを slug/sidecar に一本化する

## Meta

- **type**: spec-change
- **slug**: decouple-jobs-dir-writes
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`decouple-jobs-dir-reads`（R1）で local runtime job の **読み取り**は slug 正本 + sidecar 起点に移行済み。一方 **書き込み**は依然 dual-write で `.specrunner/jobs/<jobId>/`（machine-local cache）にも書いている（`local.ts updateJobState` が slug store と jobId store の両方に persist）。読み取りが jobId store を見ない以上、この書き込みは不要であり、二重管理が `.specrunner/jobs/` を生かし続ける唯一の理由になっている。

本変更は local runtime の state 書き込みを **slug 正本（branch-borne）+ sidecar（machine-local index）のみ**に一本化し、jobId store への書き込みを止める。これにより local runtime は `.specrunner/jobs/` を読みも書きもしなくなる。

前提：R1（`decouple-jobs-dir-reads`）が merge 済みであること。

## 要件

1. `local.ts updateJobState` の dual-write から jobId store への persist を撤去し、slug 正本 + sidecar のみに書く。
2. local runtime の他の persist 経路（`command/runner.ts` 終端 persist、`command/resume.ts`、`lifecycle/exit-guard.ts`、`cancel/runner.ts` の persist）が jobId store でなく slug 正本 + sidecar に書く。
3. local runtime の新規 run / resume / cancel で `.specrunner/jobs/<jobId>/` が新規作成・更新されない。
4. machine-local フィールド（worktreePath / pid / session）は sidecar に、portable な state は slug 正本に書かれ、両者の役割分担が一貫する。
5. `JobStateStore.create()`（worktree 作成前に `pipeline-run.ts` から呼ばれる bootstrap）が `.specrunner/jobs/<jobId>/` に書かない。jobId 採番（＋ branch 名導出）と初期 state 永続化を分離し、永続化を worktree 確立後まで遅延させて slug 正本 + sidecar に書く（defer 方式）。

## スコープ外

- managed runtime の state 書き込み（別 request `managed-slug-keyed-state` で対応）
- `JobStateStore.load()` の `.specrunner/jobs/` fallback 除去、`xdg.ts` helper / doctor checks の撤去、旧データ migration（別 request `retire-jobs-dir` で対応）

## 受け入れ基準

- [ ] local runtime の run / resume / cancel 実行後、`.specrunner/jobs/<jobId>/` が作成・更新されない（`create()` の初期書き込みを含め、integration test で `.specrunner/jobs/` への書き込みが無いことをアサート）
- [ ] state 更新後、slug 正本（worktree 内 `changes/<slug>/`）と sidecar（`.specrunner/local/<slug>/`）が最新化される
- [ ] R1 で移行済みの読み取り経路が引き続き正しく state を取得できる（既存テスト green）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **slug 正本 + sidecar の二者で十分**：R1 で読み取りが jobId store を参照しなくなったため、書き込み先も slug 正本（portable）と sidecar（machine-local: worktreePath / pid / session）の二者に限定でき、jobId store は不要。
- **managed は別 request**：managed は worktree / branch を持たず state を branch-borne にできないため本 request の対象外。
- **create() の bootstrap（defer 方式）**：`create()` は worktree 前に走り slug 正本（worktree 内）にまだ書けない。jobId 採番（＋ branch 名導出）と初期 state 永続化を分離し、永続化は worktree 確立後に slug 正本 + sidecar へ行う。sidecar に bootstrap state を別途置く案は state の二重持ち＝split-brain 再導入のため不採用。trade-off：create() と worktree 確立の間にクラッシュすると当該 job の記録は残らないが、draft は残るため re-run で回復可能（許容）。
