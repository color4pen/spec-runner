# EventBus の上向き依存を解消し B-3 を完全ゼロにする

## Meta

- **type**: refactoring
- **slug**: event-bus-interface-demote
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

full ratchet が enforce する B-3（shared-kernel / leaf は domain〔core/〕を import しない）の**最後の1件の残 divergence**:

- `src/logger/pipeline-logger.ts:20` が `core/event/event-bus`（`EventBus` 型）を import。logger（shared-kernel）→ core/event（domain）の上向き＝B-3 違反。`arch-allowlist.ts` の `B3-logger` で凍結中。

これを解消すると **B-3 の実違反がゼロ**になり、構造軸の divergence が消える。

## 要件

1. logger の EventBus 依存（上向き）を解消する。素直案: **`EventBus` interface（および型）を kernel〔共有の場所、例 `src/kernel/`〕へ移し**、`core/event` はそれを実装、`logger` は kernel から型を import（kernel への下向き＝allowed）。代替案: logger が `EventBus` を import せず、注入された typed subscribe 関数を受ける。**どちらにするかは design で確定**（本 change の adr 対象）。
2. `arch-allowlist.ts` の **`B3-logger` エントリを削除**する。
3. **【重要・suppression-demo の付け替え】** `B3-logger` を消すと、allowlist に残る「実違反」エントリが無くなる（残るは B-1 の allowed-edge 記録のみ）。T-04 の suppression-demo test は現在 `B3-logger` を参照しているため、機構（`filterViolations`）が動くことを示せる形に **refactor** すること。`expect(true).toBe(true)` の no-op にしてはならない。
   - **推奨は合成エントリ方式**: suppression-demo 内でローカルに定義した hypothetical な `AllowlistEntry` を `filterViolations` に渡して機構を検証する形にすれば、**実 allowlist の中身が縮んでも壊れない**（実 entry への repoint は allowlist 状態に結合し脆い）。

## スコープ外

- 他 invariant（B-7 / single-mutator）。
- `EventBus` の**振る舞い変更**（subscribe/emit の挙動は不変。interface/型の置き場を変えるのみ）。

## 受け入れ基準

- [ ] `src/logger/` が `src/core/` を import しない（B-3 arch test が green、**allowlist の実違反エントリがゼロ**）
- [ ] `arch-allowlist.ts` の `B3-logger` が削除されている
- [ ] T-04 suppression-demo が生存 entry/合成で有効に保たれている（no-op 化していない）
- [ ] EventBus の publish/subscribe 挙動が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **「下層は上層を見ない」を最後まで貫く**: B-3 の残1件を閉じて divergence ゼロにする（R1/R3 と同じ趣旨。設計に忠実に conform する）。
- **interface の置き場（adr:true）**: EventBus は interface（振る舞いを伴う）なので、データ型の単純移動（R1/R3）と違い「interface を kernel へ・impl は domain」という hexagonal な置き方 vs 「依存反転（注入）」の選択がある。design で評価し ADR に残す。
- **ratchet が fix の完全性を機械強制**: B3-logger を消すと logger→core が残れば B-3 test が red。
