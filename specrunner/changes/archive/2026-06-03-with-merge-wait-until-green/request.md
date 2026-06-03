# `job archive --with-merge` を「check が解決するまで待つ」本物の wait ループにする

## Meta

- **type**: spec-change
- **slug**: with-merge-wait-until-green
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）は「PR が green になるまで待って merge」する想定だが、実装は待っていない。

- merge 判定に finish の `pollMergeStateAfterPush`（`src/core/finish/pr-status.ts`、5 回 × 3 秒 = 最大 ~12 秒）を流用しており、CI 完了を待つには短すぎる。
- `mergeStateStatus` が `UNSTABLE` を返した時点で即 escalation する。ところが `UNSTABLE` は「**CI が実行中（pending）**」と「**check が確定で失敗した**」を区別せず両方を含む。CI 走行中は `UNSTABLE` なので、待つべき pending 状態で即 escalation してしまい、wait が成立しない。
- poll 打ち切り（pending のまま exhausted）時に **merge を試みる** fall-through があり、「待ちきれず merge」が残っている。
- branch protection を持たない repo（required check が無い）では `UNSTABLE` が CI 走行中の常態であり、現状の `--with-merge` は常に escalation して merge できない。

結果として「green になるまで待つ」が事実上未実装で、`--with-merge` は実用にならない。

## 要件

### 1. check が解決するまで待つ wait ループにする

`--with-merge` は、PR の check が **terminal state に達するまで poll し続ける**。pending / running の check がある間は **待ち続ける**（即 escalation しない）。固定回数の短い poll（現状の ~12 秒）をやめる。

### 2. pending と failed を check run で区別する

`mergeStateStatus` の `UNSTABLE` 一括判定をやめ、**PR head commit の check run / combined status を直接読む**（pending と failed が混ざらない粒度）。判定:

- **すべて success** → green → merge へ進む。
- **いずれかが failure（確定失敗）** → 待たずに escalation。
- **いずれかが pending / running** → 待ち続ける（要件1）。

`mergeStateStatus = CLEAN` 単独に依存しない（required check 構造を前提にしない）。green の定義は「**存在する check がすべて success**」とし、branch protection の有無に依らず機能する。check run / combined status を取得する `GitHubClient`(port) メソッドを追加する。

### 3. 待ち上限を config で設定可能にする（`null` = 無制限）

待ち上限は **`.specrunner/config.json`（step config）を主とする**。値は duration（ミリ秒等）、**`null` で無制限**（解決するまで待ち続ける）。本プロジェクトの既存慣習（未設定 / `null` = 無制限。例: `maxTurns: null`）に揃え、`unlimited` のような固有文字列キーワードは導入しない。

- **デフォルトは ~12 秒では短すぎる。** 典型的な CI が完了するのに足る長さにする（具体値は design で決定。数分オーダーを想定）。
- flag による override は任意。追加する場合も duration を取り、`--wait unlimited` のような literal keyword は避ける（無制限は `null` / 未設定で表現）。
- 上限を超えた場合の挙動は要件4。

### 4. timeout は escalation（merge 試行をしない）

設定した待ち上限を超えても check が解決しない場合は **escalation（hand-off）** する。現状の「poll 打ち切り → merge を試みる」fall-through は削除する。timeout・failure・conflict はいずれも merge せず escalation。

### 5. client-closed 不変の維持

check 読み・wait・merge は opt-in merge 経路（`merge-then-archive.ts`）に閉じる。archive 本体（`src/core/archive/orchestrator.ts`）は **GitHubClient(port) 非依存（client-closed）**を維持する（`architecture/components.md` の ArchiveOrchestrator）。

## スコープ外

- branch protection / required check の設定そのもの（プロジェクト側 GitHub 設定の責任）。
- plain `job archive`（`--with-merge` 無し）の挙動。

## 受け入れ基準

- [ ] `--with-merge` が pending / running の check がある間は待ち続け、即 escalation しない
- [ ] green 判定が check run / combined status ベース（`mergeStateStatus` の `UNSTABLE` 一括判定でない）で、pending と failure を区別する
- [ ] すべての check が success → merge、いずれか failure → escalation、pending → 待機
- [ ] 待ち上限が config（step config）で設定可能で、`null` = 無制限（既存の null=無制限 慣習に揃う）。`unlimited` 等の固有文字列キーワードを導入していない
- [ ] 待ち上限の default が ~12 秒より十分長い（典型的な CI 完了に足る）
- [ ] timeout 超過時は merge を試みず escalation する（現状の exhausted → merge 試行 fall-through が消えている）
- [ ] branch protection 無しの repo でも、全 check 通過後に merge できる
- [ ] archive 本体（`orchestrator.ts`）は GitHubClient(port) に依存しない（client-closed 維持）
- [ ] check run / combined status を取得する `GitHubClient` port メソッドが追加されている
- [ ] `bun run typecheck && bun run test` が green
