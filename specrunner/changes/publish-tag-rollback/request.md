# release は tag を打つ前に gate する（事後 rollback をやめる）

## Meta

- **type**: spec-change
- **slug**: publish-tag-rollback
- **base-branch**: main
- **adr**: false
- **close-issues**: 458

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現状の release 経路:
1. release-please が main への push を受けて release PR を作成
2. release PR が merge されると release-please がタグを打つ
3. `publish.yml` が `tags: v* / specrunner-v*` でトリガーされ、`bun run build` / `bun run typecheck` / `bun run test` → `npm publish`

問題: 手順 3 で test 失敗時、`npm publish` step はスキップされるが、**タグは既に存在する**ため「タグはあるのに publish されていない」中途半端な状態が残る。

### 当初案からの方向転換

当初は「test 失敗時にタグを自動削除する（事後 rollback）」案だったが、設計議論で **方向を転換**した:

- **取り返しのつかない操作（tag 作成）の前に test を通す**のが正しい。「打った後に消す」は事後の応急処置で、release-please の state（manifest / 既発行タグ）と desync するリスクがある。
- **タグが打たれる commit = release PR の merge commit**。main の branch protection で build/typecheck/test を required check にすれば、**赤い commit は merge されず、したがってタグも打たれない**。test は既に release PR 上で同じ SHA に対して走っているので、`publish.yml` で再実行する regression-gate としての意味は薄い（draft 旧 §3 でも指摘済み）。
- 残る「タグ打ち〜publish の間に環境が壊れる」微小リスクは、tag 削除ではなく **publish の idempotent / 再実行**で吸収する方が筋が良い（タグは正、publish は冪等に揃える）。

## 要件

### 1. tag より前に test gate を置く（主対策）

- main の branch protection で **`ci`**（ci.yml の job 名。`build` / `typecheck` / `test` はこの単一 job 内の step）を **required status check** にし、release PR を含む全 PR が green でなければ merge できないようにする（= タグが打たれる SHA は必ず green）。これはプロジェクト側 GitHub 設定の構成だが、本 change のセットアップ手順として明文化する。

> 注: GitHub branch protection の required status check は **job 名で照合**する。ci.yml は現在 `ci` 単一 job 構成（`.github/workflows/ci.yml:9`）なので、check 名は `ci`。`build`/`typecheck`/`test` を個別 check にしたい場合は ci.yml の job 分割が別途必要。

### 2. publish.yml の責務を「publish のみ」に寄せる

- `publish.yml` の post-tag な build/typecheck/test は regression-gate としては冗長。lockfile 不整合など「タグ後に壊れる」検出のため最小限（例: `build` のみ）に絞るか、§1 が入っていることを前提に整理する。
- tag の自動削除ロジックは**追加しない**（desync リスクのため）。

### 3. publish 失敗の可視化と再実行性

- publish が失敗した場合（npm 一時障害等）、タグは残したまま **再実行で publish を完了**できるようにする（idempotent）。タグを消す方向には倒さない。
- 再実行手段は **`publish.yml` に `workflow_dispatch`（tag を input に取る）を追加**する。maintainer が対象 tag を指定して publish ジョブだけを手動で再トリガーでき、再 tag は不要。
- 失敗を可視化する（job summary / 通知）ことで再実行が必要なことに気付けるようにする。

## スコープ外

- branch protection 設定そのもの（プロジェクト側 GitHub 設定の責任。本 change は前提として明文化するだけ）。
- release-please-config.json / .release-please-manifest.json の改修。
- npm publish の retry 機構の作り込み（必要なら別 change）。

## 受け入れ基準

- [ ] release PR を含む main 向け PR が `ci`（ci.yml の job 名）の required check 緑でなければ merge できない（branch protection 構成 + セットアップ手順の明文化）
- [ ] `publish.yml` から事後 tag 削除ロジックを追加しない方針が反映され、責務が publish 寄りに整理されている
- [ ] `publish.yml` に `workflow_dispatch`（tag input）が追加され、失敗時にタグを残したまま対象 tag を指定して publish を手動再実行できる（idempotent）
- [ ] publish 失敗が可視化される（job summary / 通知）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **「打った後に消す」→「打つ前に止める」**: 取り返しのつかない操作（tag）の前に gate を置く。事後 rollback は release-please state との desync を生むため採らない。
- **タグが打たれる SHA は release PR の merge commit**: branch protection で release PR を test 必須にすれば、赤い SHA はそもそもタグ化されない。これが主対策で、実装はむしろ小さい。
- **タグは正・publish は冪等**: タグ打ち後の障害は tag 削除でなく publish の再実行で吸収する。タグを動かさないことで release-please との整合を保つ。
