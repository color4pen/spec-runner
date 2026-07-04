# 同一 slug の live job があるとき2回目の run を拒否する

## Meta

- **type**: spec-change
- **slug**: reject-duplicate-slug-run
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

同一 slug で job を2回起動すると、先行 job（job A）が sidecar index から消え、`job cancel` / `job show` で解決できなくなる。

liveness sidecar は slug 単位で1ファイル（`.specrunner/local/<slug>/liveness.json`）であり、2回目の run（job B）が job A の内容を上書きする。sidecar 経由で jobId を照合する解決器は上書き後の job B しか見つけられず、job A は「Job not found」となる。job A の worktree とプロセスは残り続け、cancel する正規手段が無くなる。

同一 slug の並列 run は「1 request = 1 PR」という商品契約上、ほぼ常に誤操作であり、支えるべきユースケースではない。したがって2つ目を許容して sidecar を jobId 単位に分割するのではなく、live な先行 job があるときに2回目の run を明示的に拒否して不整合を未然に防ぐ。

## 現状コードの前提

- `src/store/local-job-index.ts:62`: `listLocalSidecars` は各 slug ディレクトリの `liveness.json` を1ファイルだけ読む。`src/store/local-job-index.ts:97-103` の `resolveJobIdToSlug` はその結果を jobId で照合するため、上書きされた slug では先行 job の jobId を解決できない。
- `src/core/runtime/local.ts:784-796`: `writeLivenessSidecar` は `.specrunner/local/<slug>/liveness.json` に `{ pid, session, worktreePath, jobId }` を**上書き**で書く（slug 単位・jobId 非依存）。setupWorkspace 経路（`src/core/runtime/local.ts:303,414,435,484`）から呼ばれる。
- `src/core/command/pipeline-run.ts:122`: `prepare()` は各種 preflight チェックの後 `bootstrapJob` を呼ぶが、同一 slug に live な先行 job があるかを検査するガードは無い。
- `src/core/resume/safety.ts:13`: `isProcessAlive(pid)` が `process.kill(pid, 0)` によるプロセス生存判定として既に存在する（cancel / resume が使用）。

## 要件

1. **run 起動前に同一 slug の live job を検査するガードを追加する。** local runtime で slug S の run を起動する際、`bootstrapJob` より前に `.specrunner/local/S/liveness.json` を読み、`pid` が記録されていて `isProcessAlive(pid)` が真なら、**job state を一切作らずに** actionable なエラーで拒否する。エラーは先行 jobId と対処（`specrunner job cancel <jobId>` するか完了を待つ）を示す。
2. **stale / 不在時は通常起動する。** liveness.json が不在、または `pid` が dead（`isProcessAlive` が偽）なら、現状通り run を起動する（stale sidecar の上書きは現行の挙動を維持）。
3. **pid 生存判定は既存 `isProcessAlive` を再利用する。** 新たな pid 判定ロジックを追加しない。

## スコープ外

- managed runtime（`marker.json`）に対する同型ガード。本 request は local runtime の liveness sidecar が対象。
- liveness sidecar を jobId 単位に分割して同一 slug の並列 run を許容する案。商品契約上サポートしない方針のため却下。
- stale sidecar の自動 recovery ロジックの変更（既存の stale-running / resume 経路に委ねる）。
- `job cancel` / `job show` の解決器自体の変更（本 request はガードで不整合の発生を防ぐことに限定する）。

## 受け入れ基準

- [ ] slug S に live な `liveness.json`（`pid` が生存プロセス）がある状態で同 slug の run を起動すると、job state を作らずに actionable なエラーで拒否されることをテストで固定する。
- [ ] `liveness.json` が stale（`pid` が dead）または不在のとき、run が通常通り起動することをテストで固定する。
- [ ] エラーメッセージに先行 jobId と対処手段（cancel / 待機）が含まれることをテストで固定する。
- [ ] 既存の cancel / resume / inbox の挙動が不変であることを、既存テスト無変更 green で確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- 「slug S に live な先行 job があれば2回目の run を拒否する」ガードを、`bootstrapJob` の直前（`src/core/command/pipeline-run.ts:122` の preflight スロット）に置く。state 生成前に弾くことで、不整合な sidecar 上書き自体を発生させない。
- 生存判定は既存 `isProcessAlive`（`src/core/resume/safety.ts:13`）を再利用し、liveness sidecar の `pid` を probe する。stale（dead pid）は「live な先行 job なし」として扱い、現状の上書き起動を維持する。

**却下**

- 案「liveness / marker を jobId 単位（`liveness-<short-jobId>.json`）に分割し、同一 slug の並列 run を許容する」: sidecar 読み取り・cancel・show・cleanup の広範な改修を伴い、かつ「同一 slug 並列 run」という商品契約外のユースケースを支える方向に向かうため却下。ガードで発生を防ぐ方が改修面が小さく契約とも整合する。
