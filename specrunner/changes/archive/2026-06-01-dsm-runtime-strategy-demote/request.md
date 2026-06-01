# domain→comp-root を解消する：RuntimeStrategy / prereqs を ports へ降格（DSM burn-down 1）

## Meta

- **type**: refactoring
- **slug**: dsm-runtime-strategy-demote
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`arch-closure-src-wide`（#495）で §3 DSM closure を歯にし、未検査だった 21 件の §3 違反を `arch-allowlist.ts`（invariant `DSM`）に凍結した。本 change はそのうち **domain→composition-root の 5 件**を burn-down する。

§3 で **domain → composition-root は ✗**。だが domain（`core/`）が comp-root（`core/runtime/`）の `RuntimeStrategy` / `prereqs` を直 import している。`RuntimeStrategy` は interface（runtime 実装の抽象）なので、hexagonal の原則どおり **port 側（`core/port/`）に置き、実装を comp-root（`core/runtime/{local,managed}`）に置く**のが正しい向き。

対象 5 件（**grep authoritative**: 実装者が scan で確定。下記は背景列挙）:

| tracking | from（domain） | import（comp-root） |
|---|---|---|
| DSM-domain-comp-root-preflight-prereqs | `src/core/preflight.ts` | `runtime/prereqs.js` |
| DSM-domain-comp-root-types-strategy | `src/core/types.ts` | `runtime/strategy.js`（`RuntimeStrategy`） |
| DSM-domain-comp-root-resume-strategy | `src/core/command/resume.ts` | `runtime/strategy.js` |
| DSM-domain-comp-root-runner-strategy | `src/core/command/runner.ts` | `runtime/strategy.js` |
| DSM-domain-comp-root-pipeline-strategy | `src/core/command/pipeline-run.ts` | `runtime/strategy.js` |

## 要件

1. `RuntimeStrategy` interface を `core/runtime/strategy.js`（comp-root）から **ports（`core/port/`）または shared-kernel** へ降格し、domain がそこから legal に import できるようにする。降格先は design で確定（§3 で domain→ports / domain→shared-kernel はいずれも ✓）。`core/runtime/{local,managed}` は降格後の `RuntimeStrategy` を implement する側に残す。
2. `prereqs`（`core/preflight.ts` が import）も同様に legal な層へ降格する。
3. 上記 import site（scan で確定した全件）を新しい legal path に張り替える。
4. `tests/unit/architecture/arch-allowlist.ts` の `DSM-domain-comp-root-*` エントリ（5 件）を削除する。
5. ratchet 規約継承: allowlist は**削除のみ**、DSM closure test が green（実違反が 5 件減る）。`forbiddenEdges.length >= dsmEntries.length` の liveness guard も維持される。

## スコープ外

- 他 DSM カテゴリ（**adapter→domain / ports→domain**）= 並行する `dsm-domain-type-demote` の領分。本 change は **domain→comp-root のみ**。
- `core/types.ts` の `StepContext` 定義領域（adapter が import する型。並行 change が編集）。本 change が `core/types.ts` で触るのは **`RuntimeStrategy` import（line 9 付近）と `PipelineDeps.runtimeStrategy` フィールド（line 105 付近）の領域のみ**。
- `architecture/model.md` の編集（authority doc は人間 gate）。
- 振る舞い変更。

## 受け入れ基準

- [ ] `RuntimeStrategy` / `prereqs` が legal な層に降格し、`arch-allowlist.ts` の `DSM-domain-comp-root-*` エントリが **0 件**
- [ ] DSM closure test が green（実違反が 5 件減少、liveness guard も維持）
- [ ] 対象 import site を実装者が scan で全件列挙し、`implementation-notes.md` に scan 結果（対象ファイル一覧）を記録している
- [ ] `core-invariants.test.ts` の既存 invariant test（B-1〜B-9 の describe ブロック。B-9 は #492 で実在）が無改変で green
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **§3 の向き是正**: domain→comp-root は禁止。`RuntimeStrategy` は interface（port）であり、comp-root に置かれていたのが逆。port を core 側（`core/port/`）に置き実装を comp-root（`core/runtime/`）に残すのが hexagonal の正しい向き。
- **並行非干渉**: `core/types.ts` は本 change が import(line 9)＋`PipelineDeps.runtimeStrategy`(line 105) 領域、並行 `dsm-domain-type-demote` が `StepContext` 定義領域を編集 ＝ distinct region なので 3-way merge で衝突最小。本 change は adapter/ port ファイルには一切触れない。allowlist も削除する DSM サブ領域が別（domain-comp-root vs adapter/ports-domain）。
- **grep authoritative**: import site の列挙は scan で全件確定（私の列挙に依存しない、#482 の教訓）。
