# ADR-20260602: spec を Layer-1 残差に再定義し、振る舞いの真実を test + 構造の歯に置く

## ステータス

accepted

## コンテキスト

spec-runner は `specrunner/specs/`（capability 別 baseline）を「振る舞いの actual state 写し」＝振る舞いの authority とし、各 change の delta を finish の spec-merge で baseline に取り込む構造を持つ。

実測では、baseline は下流（implementer / code-review / verification）にほぼ消費されず、振る舞いの正しさを enforce しているのは **test suite と構造の歯（B-1〜B-10 / DSM）**である。spec baseline は delta 検証の参照点と spec-review の文脈以外で読まれない。

一方、構造（型 / 状態機械 / 不変条件）は根の振る舞いを決め、歯が機械的に enforce する。構造が決めない残りの振る舞いだけが intent 由来の選択として残る。

## 決定

### D1: spec の authority を source-of-truth から降格する

振る舞いの正典は **test（実行可能・regression を独立に守る）+ 構造の歯**。spec は「正典」ではなく **Layer-1 の検証可能な受け入れ契約 + 監査記録**とする。

### D2: 振る舞いを Layer-0 / Layer-1 に分ける

- **Layer-0**: 構造（型 / FSM / invariant）が決める根の振る舞い。歯が enforce する。spec に書かない。
- **Layer-1**: 構造が決めない、intent 由来の振る舞いの選択。これが spec の対象。
- litmus: 「構造が強制するか」→ YES なら Layer-0（spec でない）/ NO なら Layer-1（spec）。

### D3: spec-merge を廃止し、pipeline→specs の閉ループを断つ

finish の spec-merge（delta を baseline へ書き込む点）を廃止する。これは `components.md` が「最も trust load-bearing」とする閉ループ点であり、撤廃により pipeline が自分の振る舞い authority を書き換える経路が消える。baseline は source-of-truth でなくなる。

### D4: baseline corpus を維持対象から外す

`specrunner/specs/` の capability baseline を「育てる正典」から Layer-1 の監査記録に縮小する。capability 別ディレクトリと delta の merge 用 format（baseline-header-match 等）は spec-merge と共に役目を終える。

## 構造的含意

- 振る舞いの authority: `specrunner/specs/`（baseline）→ **test suite + architecture の歯**。
- trust topology: pipeline→specs の閉ループ（最も trust load-bearing）が消え、out-of-loop 設計が警戒する自己書換え面が 1 つ減る。
- 同期が要る記述: `components.md`（FinishOrchestrator の spec-merge 責務・"最も trust load-bearing"）/ `model.md`（specs = actual state 写し）/ `README`（pipeline writes specs/）。これらは spec-merge 廃止の完了と同時に更新する。
- 層 / §3 closure / B-1〜B-10 は不変（spec の authority 位置の変更であって依存構造の変更ではない）。

## 検討した代替案

- **spec-as-source（spec を唯一の正典・code は生成物）** — 却下。code 生成モデルは別物で重く、`model.md` §1 の solo dogfood / 重い ceremony を入れない制約に合わない。
- **baseline を source-of-truth のまま維持（現状）** — 却下。下流が読まず test と歯が真実を担っており、spec-merge の閉ループと維持コストだけが残る二重持ち。
- **baseline を append-only 監査ログ化（変異のみ廃止）** — 部分採用。D4 の「監査記録に縮小」と整合するが、本質は source-of-truth の主張を降ろす D1。

## 結果

- spec が「下流が読まない documentation」から「Layer-1 の受け入れ契約（→ test）」に純化する。
- 重い spec 機構（spec-merge / capability baseline / merge 用 format）撤廃の根拠が確定する。
- spec の縮小レバー（Layer-1 → Layer-0 を構造へ押し込む）が方針として確定する。

## References

- 先行実装（main 反映済み）: `test-cases-from-spec-scenarios`(#504) / `test-cases-reference-scenarios`(#505)。
- 後続: `abolish-spec-merge`（spec-merge 廃止 + 上記 doc 同期）, `design-emits-layer1-only`（Layer-1 産出）。
- 構造の歯: `tests/unit/architecture/core-invariants.test.ts`（B-1〜B-10）。
