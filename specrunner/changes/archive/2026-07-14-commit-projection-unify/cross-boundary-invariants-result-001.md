# cross-boundary-invariants review — commit-projection-unify — iter 1

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **scope**: 変更が**変更していない**コードの暗黙の前提（不変条件）を黙って破っていないか

---

## 検査対象

変更ファイル: `src/core/step/commit-orchestrator.ts`、`tests/unit/architecture/core-invariants.test.ts`、テストファイル 2 件

---

## 不変条件チェックリスト

### B-13: CommitOrchestrator が store 永続化 API の唯一の呼び出し元である

- **結果: ✓ 維持**
- 新設した `projectSuccess` / `projectSkip` は `store` 参照を持たない純粋関数（`await` なし、`this` なし、I/O なし）。`applySuccessPostPersistEffects` は private class method で `store.persist` 後にのみ呼ばれる。
- executor および `parallel-review-round.ts` への変更なし。B-13 liveness テスト（`commit-orchestrator.ts` に store 呼び出しが存在する）が green のまま維持されることを確認。

### B-14: transitionJob / attachStateAndRethrow は commitHalt のみが呼ぶ

- **結果: ✓ 維持**
- `commitHalt` は一切変更されておらず、`transitionJob` / `attachStateAndRethrow` の所有権は変わらない。
- `commitRound` の halt 分岐は `recordFailedStepResult` + in-memory `appendHistoryEntry` のみ。`store.fail` / `transitionJob` は呼ばない。この「round halt では lifecycle 遷移を行わない」契約が維持されている。

### Persist 回数不変（B-13 補足）

- **結果: ✓ 維持**
- sequential success: 2 回（`store.persist` #1 after `projectSuccess`, #2 after branch/PR patch）
- sequential skip: 1 回（`projectSkip` 後）
- round: 1 回（coordinator patch 後の単一 `store.persist`）
- `store.appendHistory` → `appendHistoryEntry`（pure）+ `store.persist` への置換は意味的に等価。`job-journal.ts:appendHistory` の実装（`appendHistoryEntry` + `this.persist`）と同一シーケンスであることを確認。

### Persist 内容の等価性

- **結果: ✓ 維持**
- 旧 persist #1: `pushStepResult` 適用済み state に `store.appendHistory(verdict entry)` → `pushStepResult + verdict history` が persist される。
- 新 persist #1: `projectSuccess`（`pushStepResult` + `appendHistoryEntry(verdict entry)` を in-memory で連鎖）→ 同一内容が persist される。
- state の内容差なし。

### 歴史エントリの順序（round 専用: {step}-started before {step}-verdict）

- **結果: ✓ 維持**
- `commitRound` 内で `appendHistoryEntry({step}-started, ts=startedAt)` → `projectSuccess`（`{step}-verdict, ts=now` を追記）の順で呼ばれる。`appendHistoryEntry` は history 末尾に追記するため、`{step}-started` が `{step}-verdict` より前に現れる。

### verdict:parsed emit 順序

- **結果: ✓ 維持**
- sequential skip: emit は `store.persist` より前（`commitSkipped` 内、`store.persist` 呼び出しの前行）。
- sequential success: emit は最終 `store.persist` より後（`applySuccessPostPersistEffects` 内、`store.persist` #2 の後）。
- round success/skip: emit は単一 `store.persist` より後。
- いずれも元の挙動と一致。

### DSM 層境界

- **結果: ✓ 合法**
- 新規 import `appendHistoryEntry from "../../state/schema.js"`: ソース層は domain（`src/core/`）、インポート先は shared-kernel（`src/state/`）。DSM whitelist で domain → shared-kernel は許容済み。
- B-1/B-2/B-4 に対する新規違反なし。

### round halt 後の lifecycle 不変

- **結果: ✓ 維持**
- `commitRound` halt 分岐（行 488-498）は `recordFailedStepResult` のみ実行し、`store.fail` / `transitionJob` を呼ばない。job の lifecycle 遷移（failed transition）はパイプラインが coordinator verdict を観察した後に実行する設計が維持されている。

---

## 文書化済みの意図的な差異（ブロッカーなし）

### usage appendInvocation の順序変更（design.md D4 に明示）

- **severity: info**
- sequential success パスで、`appendInvocation`（usage 記録）の呼び出し位置が「persist #2 の前」から「persist #2 の後」（`applySuccessPostPersistEffects` 内）へ移動した。
- `appendInvocation` は best-effort（`try { ... } catch {}`）で、戻り値・副作用とも pipeline の state に影響しない。`verdict:parsed` emit よりは依然として前。
- design.md が明示的に「no observable effect」と判断しており、この変更は設計上の合意の範囲内。

---

## 構造 gate テスト評価

4 つの新規 gate テスト（`core-invariants.test.ts`）を確認:

| Gate | 内容 | 評価 |
|------|------|------|
| Gate 1 | "mirrors commit" が 0 件 | ✓ コメント行 filter 付きで正確 |
| Gate 2 | "matches commit" が 0 件 | ✓ 同上 |
| Gate 3 | `projectSuccess(` が ≥ 2 call sites | ✓ `commitSuccess` + `commitRound` の両方でカウントされる |
| Gate 4 | `projectSkip(` が ≥ 2 call sites | ✓ `commitSkipped` + `commitRound` の両方でカウントされる |

liveness テスト（Gates 3/4）は「呼び出しを一方のパスから削除するだけで緑を維持できる」失敗類型をブロックする。grep パターン `"projectSuccess\\\\("` は shell 展開後に `projectSuccess\(` となり、拡張正規表現で `projectSuccess(` にマッチする（関数定義行 `function projectSuccess(` も含む点は非問題：定義行も count ≥ 2 を満たすうえに、定義 + call site で count が増えるだけ）。

**Verification**: 6714 テスト全件 green、typecheck 0 errors。

---

## 総評

変更は「挙動不変」のリファクタリングとして正確に実装されている。B-13/B-14 の ownership contract、persist 回数・内容、emit 順序、history 順序、round halt の lifecycle 不変—いずれも破綻なし。usage 順序変更は design.md が先行して合意を得ており cross-boundary violation には該当しない。構造 gate テストは duplication 再導入を機械的に検出する歯として機能する。
