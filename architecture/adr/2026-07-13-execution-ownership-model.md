# ADR-20260713: 実行所有権モデル — state commit / git 副作用 / 失敗遷移 / 実行入力の単一所有者化

## ステータス

accepted。

本 ADR の構造判断（D1〜D4 の所有権配置）は**採用済み** ― 「実行 seam を跨いだ副作用を誰が確定させるか」を構造判断として確定する（実装の有無とは独立）。後続 PR で「この所有権モデル自体を採用するか」を再審議しない。

**Invariant B-13〜B-16 は proposed のまま**とし、各 invariant は対応する実装・architecture test（歯）・contract test が landing した時点で個別に ratify する。ratify までは `model.md` §4 ＋ `conformance.md` (A) へ昇格しない（歯を一括採択しない）。依存順の目安: B-16 → B-15 → B-13（B-14 は B-13 の失敗経路スライスとして同時 ratify 可）。

実装手順・staging 機構・resume 配布・出力排他契約の振る舞いは behavior（spec `specrunner/changes/` ＋ request、または `specrunner/adr/`）が担う。

## コンテキスト

`JobState` の変更を単一 mutator（`JobStateStore`、B-9 ＋ ADR-20260605）へ通す構造は既にある。しかし **commit/persist を「いつ・どの snapshot から」駆動するかの所有権**が複数の orchestrator に分散し、「1 つの原子的な状態変更の境界」がコードから読み取れない。

- step 実行（`StepExecutor`）が実行中に state を persist し（開始 history / 失敗遷移 / artifact 確定）、さらに `Pipeline` が step 完了後に同じ state を persist する。書き込み関数は単一（`JobStateStore`）だが、commit を駆動する主体が二重化している。
- 失敗遷移が step 実行経路の各 guard に個別展開され、`ErrorInfo` 組立 → 失敗結果記録 → 遷移 → interruption → history → persist → rethrow の所作が複数 call-site へ複製されている。所有者は分散し、遷移の一貫性は型でなく規律に依存する。
- 並列 review round では、同一の base `state` と可変 `deps` が複数の member 実行へ共有される。各 member が stale base から中間 persist するため、crash 時の on-disk state は member 単位の部分 projection になりうる。`deps` の resume 入力は最初に到達した member が消費し、どの member が最初かは非決定。
- worktree への git 副作用は共有 worktree に対する `git add -A` ＋ `commit -m "<step>: <slug>"` で行われ、commit 直列化はされるが **どの member の成果物をどの commit が所有するかは実行順依存**。先に finalize した member の commit が他 member の出力まで取り込みうる。

共通する構造的欠陥は「所有権が型・境界でなく実行順によって偶然決まる」こと。ファイルサイズや書き込み関数の単一性の問題ではない。

## 決定

- **D1 — state commit の単一所有者**: execution unit は sequential 経路では単一 step execution、parallel review では round とする。commit は execution unit 自身ではなく、その unit の完了を調停する**単一 orchestrator** が所有する。`StepExecutor` は state を persist せず、実行結果を差分（＋ events）の値として返す。commit orchestrator は sequential 経路の recorder と round 所有の coordinator。単一 mutator を「書き込み関数」から「commit orchestrator」へ拡張する（B-9 ／ ADR-20260605 と同系）。
- **D2 — 失敗遷移の単一適用（`StepHalt`）**: 各 guard は停止判断を `StepHalt` 値（`failed` / `awaiting-resume` の discriminated union）として**記述**する。`StepHalt` は停止理由と要求される disposition を表す値であり、状態遷移そのものではない。state への適用・history・persist・外側への伝播は、execution unit の commit orchestrator（D1）が単一経路で行う。適用器と commit orchestrator は同一所有者。
- **D3 — git 副作用の round 所有 ＋ scoped staging**: parallel review round の worktree 副作用（stage / commit）は coordinator が round 単位で所有する。member 実行は Git stage / commit port を呼ばない。coordinator が stage する対象は round member の宣言出力集合に限定し、worktree 全体を無差別に stage しない。member 帰属は git commit でなく出力ファイル名・`StepRun`・history・reviewer status が保持する（stage 機構 ＝ `git add` の形は behavior）。
- **D4 — 実行 seam を跨ぐ入力の不変性**: 実行が参照する入力（resume context / `deps`）は実行 seam を跨いで immutable。member 実行は共有 orchestration 状態（`deps`）を in-place で書き換えない。round ごとに readonly な入力を構築する。

## 構造的含意

- **提案 invariant（ratify 待ち・歯後追い。実装 landing 時に `model.md` §4 ＋ `conformance.md` (A) ＋ `core-invariants.test.ts` の describe ブロックへ同時昇格）**:
  - **B-13（提案）**: `StepExecutor` は state mutation / persist API（`store.persist` / `store.fail` / `store.update` 等）を呼ばない。実行結果は値で返し、commit は orchestrator が行う。
  - **B-14（提案）**: step 失敗遷移は単一適用点（`StepHalt` を適用する commit orchestrator の一経路）のみ。step 実行経路の各 call-site で persist ＋ 遷移を手組みしない。
  - **B-15（提案）**: parallel round の stage / commit は coordinator 所有点だけが行う。member 実行経路から Git stage / commit port を呼ばない。coordinator が stage する対象は round member の宣言出力集合に限定する。
  - **B-16（提案）**: `deps`（共有 orchestration 入力）は実行 seam を跨いで in-place 書き換えしない（`deps.<field> =` 代入を禁止。round ごとに readonly な入力を構築）。
- **歯と contract の分担**: 上記のうち歯（architecture test）が守るのは静的 call-edge ― `StepExecutor` からの mutation API 呼び出し禁止 / member 実行経路からの stage・commit port 呼び出し禁止 / `deps` 代入禁止 / `StepHalt` が DU であること。**「commit orchestrator が真に単一か」「scoped staging が宣言出力だけか」「auto resume context が対象 member だけへ展開されるか」「fan-out 途中で部分 projection を持たないか」は architecture invariant でなく contract/behavior test が守る**。B-13/B-15 を「全所有権の証明」でなく「禁止 call-edge」に絞るのはこのため。
- **単一 mutator 系列の延長**: B-9（status 遷移の単一 mutator）／ ADR-20260605（Aggregate 変更を `JobStateStore` 経由へ限定）は「書き込み関数」の単一性を定める。本 ADR はそれを **commit orchestration の所有権**へ延長する ― 書き込み関数は単一でも、それを呼ぶ所有が分散する残余を閉じる。
- **Value Object の追加**: ratify 時に `StepHalt`（`failed` / `awaiting-resume` の DU）を `domain-model.md` の Value Object へ追加する。失敗遷移の「記述」を型で表し、無効状態（`failed` に resumePoint、`awaiting-resume` に resumePoint 不在、等）を表現不能にする。
- **層・依存（DSM）は不変**: 本 ADR は所有権（どの orchestrator が commit するか）の再配置であり、§2 層・§3 closure の edge を変えない。`StepExecutor` / `Pipeline` / coordinator / `JobStateStore` は現行層に留まる。
- **behavior 側に属し本 ADR に含めないもの**（litmus: 関数/step が何をするか）: scoped staging の git 機構（`git add` の形）、round commit と state persist の二相順序、出力排他契約（changed ⊆ declared、範囲外変更での round halt）＝ step 実行契約（`tests/unit/contract/` ＋ 型）、resume 配布（human note を全 pending member へ / auto context を対象 member へ）と member→coordinator resume での context 保持。これらは spec（`specrunner/changes/`）＋ request が定め、本 ADR からは参照に留める。

## 検討した代替案

- **現状維持（実行順で所有権が決まる）**: 並列 round の crash 時に member 部分 projection が残り、commit 帰属が不定。監査可能性を強みとする方針に反する。却下。
- **full event sourcing ＋ total patch ＋ optimistic revision を一度に導入**: 全 state 書き込みを patch/event channel へ移す total 化が前提で、blast radius が背骨全体に及ぶ。所有権の再配置（本 ADR）を先に固定し、revision reconciliation は round commit ／ state persist の二相が実運用で問題化した時点で判断すればよい（本 ADR では規定しない）。
- **`StepHalt` を例外クラスにする**: 失敗を throw で運ぶ現行に合わせて例外階層を作ると、commit 所有を recorder へ移す時（D1）に applier ごと作り替えになる。`StepHalt` を「値」に留めれば適用の場所（executor / recorder）を後から差し替えられる。値として定義する。

## 結果

- **Positive**: 実行順に依存した所有権が型・宣言 path・round 境界で明示される。on-disk `JobState`（projection）の crash 整合性が上がり、member 単位の部分 projection を持たなくなる（ただし Git round commit との二相境界は残る ― 下記 Negative）。失敗遷移が一点に集約し一貫性が型で守られる。局所修正と将来の single-writer 化が同一原則の下で一本化する。
- **Negative**: round commit と state persist の二相境界は残る（本 ADR では消さない。実運用で問題化すれば revision reconciliation を別途判断）。git 副作用の member 帰属は放棄し、round 帰属 ＋ artifact / `StepRun` 側で保持する（監査の粒度が commit → round ＋ 成果物へ移る）。

---

> staging 機構・二相順序・出力排他契約・resume 配布・実装 PR 手順は behavior（spec ／ `specrunner/adr/`）が持つ。本 ADR は構造（所有権の配置と提案 invariant）のみで、振る舞いは参照に留める。
