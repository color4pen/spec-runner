# ADR-20260610: judge findings の検証 seam と verdict 導出の所在

## ステータス

accepted

## コンテキスト

judge 系 step の結果は report_result の typed outcome として agent が申告する。申告値そのものを信頼境界の内側に置くか、申告を入力（findings）に限定して判定を CLI 側に置くかは、判定ロジックの所在と I/O の所在という構造の問題である。判定と I/O の両方が必要になる（findings の参照先が実在するかの確認は runtime ごとに観測手段が異なる）ため、層と seam の割り当てを定める。

## 決定

- **D1**: finding の file / line 参照の実在検証は `RuntimeStrategy` の面（`verifyFindingRefs`）とする。runtime 差異（local＝worktree fs / managed＝GitHub raw fetch）はこの seam の実装側に閉じ、domain に runtime 分岐を置かない（B-8 と同方向）。
- **D2**: verdict の導出は domain の純関数 module（`src/core/step/judge-verdict.ts`）に置く。fs / child_process を import しない（B-5 適合）。導出（判定）と検証（I/O）を同居させない。
- **D3**: `Finding` は Value Object として shared-kernel（`src/kernel/report-result.ts`）に置く。port（`core/port/report-result.ts`）は re-export し、SDK 型を含まない（B-2 維持）。

## 構造的含意

- port 面の追加: `RuntimeStrategy` に検証の面が 1 つ増える（workspace / agent 実行 / state 永続 / cleanup に並ぶ）。
- domain module の追加: 判定系純関数 1 module（B-5 の検査対象に自動的に入る）。
- B-x 不変条件の新設はなし（既存 B-2 / B-5 / B-8 の適用で覆われる）。歯は unit tests（`judge-verdict` / `verify-finding-refs`）が担い、grep 歯の新設は行わない。
- verdict 導出の意味論（どの severity / resolution がどの verdict に写るか）は振る舞いであり、契約側（`report-result.ts` の型 ＋ `tests/unit/contract/`）と in-loop ADR を正典とする。本 ADR は所在のみを定める。

## 検討した代替案

- **executor 内に検証を直書き**: runtime 分岐が domain に漏れる（B-8 逆行）。却下。
- **adapter 側で検証**: 判定の一部が adapter に移り、port の契約が実装ごとに揺れる（B-1 の意図に逆行）。却下。
- **検証を行わない（申告値を信頼）**: 判定の入力が観測不能になり、判定系の純粋性（B-5）を保つ意味が薄れる。却下。

## 結果

- Positive: 検証の I/O が seam 一点に集約され、導出が純関数として単体で検査可能になる。
- Negative: managed runtime では finding 参照 1 件につき外部 fetch が 1 回発生する（検証対象の限定は振る舞い側の契約で扱う）。
