# Design: release は tag を打つ前に gate する（事後 rollback をやめる）

## Context

現在の release 経路は release-please → tag → publish.yml の 3 段構成。
publish.yml は tag push をトリガーに build/typecheck/test/publish を実行するが、test 失敗時にタグだけ残り publish されない中途半端な状態が発生しうる。

タグが打たれる SHA = release PR の merge commit であるため、merge 前に CI green を必須にすれば赤い SHA がタグ化されること自体を防げる。publish.yml 側の test は regression-gate として冗長になり、責務を publish に寄せられる。

タグ打ち後の publish 失敗（npm 一時障害等）はタグ削除ではなく publish の再実行で吸収する方針。

## Goals / Non-Goals

**Goals**:

- branch protection の required status check 設定手順を明文化し、赤い SHA の merge を防止する
- publish.yml の責務を「build + publish」に絞り、冗長な typecheck/test を除去する
- publish.yml に workflow_dispatch を追加し、失敗時に tag を指定して手動再実行可能にする
- publish 失敗を job summary で可視化する

**Non-Goals**:

- branch protection 設定の自動化（GitHub UI での手動設定。手順の明文化のみ）
- release-please-config.json / .release-please-manifest.json の改修
- npm publish の retry 機構
- ci.yml の job 分割

## Decisions

### D1: publish.yml から typecheck/test を除去し build のみ残す

branch protection で `ci` が required check になっていれば、タグが打たれる SHA は既に typecheck/test 済み。
publish.yml での再実行は regression-gate としての価値が薄い。
ただし `build` は npm publish の前提（dist/ 生成）として必要なので残す。

**Rationale**: 同一 SHA に対して同じ検証を二重に走らせる冗長性を排除する。build は publish の実行前提なので残す必要がある。

**Alternatives considered**:
- 全 step 残す — 冗長だが安全寄り。ただし本 change の趣旨（pre-gate で止める）に反する
- build も含め全除去 — dist/ なしで npm publish できないため不可

### D2: workflow_dispatch で tag を input に取る

publish 失敗時の再実行手段として `workflow_dispatch` を追加する。input は `tag`（例: `v0.2.0`）。
tag push トリガーの場合は `github.ref_name` から tag を取得、workflow_dispatch の場合は input から取得する。
checkout 時に `ref: <tag>` を指定することで、正しい SHA をチェックアウトする。

**Rationale**: タグを残したまま publish だけやり直せる冪等な手段が必要。re-tag は release-please state と desync するリスクがある。

**Alternatives considered**:
- Re-run workflow ボタン — tag push の場合のみ有効だが、失敗原因が環境依存の場合は同じ結果になりやすい。workflow_dispatch なら任意のタイミングで再実行できる
- 別 workflow で publish のみ — 管理対象が増える。同一 workflow の別トリガーの方がシンプル

### D3: publish 結果を job summary に出力する

publish step の成功/失敗を `$GITHUB_STEP_SUMMARY` に出力する。
成功時: パッケージ名・バージョン・tag を表示。
失敗時: 失敗した旨と `workflow_dispatch` での再実行手順を案内。

**Rationale**: Actions の job summary は追加設定なしで参照でき、Slack 通知等の外部依存を増やさない。

**Alternatives considered**:
- Slack / Discord 通知 — 外部 webhook 設定が必要でスコープが広がる
- GitHub Issue 自動作成 — publish 失敗の頻度に対してオーバーキル

### D4: branch protection 設定は手順の明文化のみ

branch protection は GitHub リポジトリ設定であり、コードで自動化するものではない。
セットアップ手順（Settings → Branches → `ci` を required check に追加）を文書化する。

**Rationale**: request のスコープ外として明示されている。terraform 等による自動化は別 change。

## Risks / Trade-offs

- [Risk] branch protection 未設定の場合、赤い SHA が merge されタグ化される可能性が残る → [Mitigation] セットアップ手順の明文化 + `specrunner doctor` や CI での検出は将来 change で対応可能
- [Risk] publish.yml から typecheck/test を除去した後、lockfile 不整合等で build が通るが runtime エラーになるケース → [Mitigation] build step が dist/ 生成時のエラーを検出する。runtime エラーは publish 後の smoke test で別途対応（スコープ外）
- [Risk] workflow_dispatch で誤った tag を入力する可能性 → [Mitigation] checkout 時に ref 解決で失敗するため、存在しない tag は早期エラーになる

## Open Questions

なし（architect 評価済みの設計判断で方向は確定）

## Delta Spec

本 change は `release-automation` baseline spec の以下の requirement を変更する:

- **capability**: `release-automation`
- **変更対象 requirement**: 「publish.yml trigger is unchanged」— publish.yml を変更しない前提が崩れるため、新しい publish.yml の仕様を反映した requirement に書き換える
- **追加 requirement**: workflow_dispatch による手動再実行、publish 結果の job summary 出力、branch protection 前提の明文化
