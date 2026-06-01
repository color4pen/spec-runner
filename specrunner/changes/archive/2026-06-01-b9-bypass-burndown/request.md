# B-9 の status 直書き 3 箇所を transitionJob 経由に解消する（B-9 burn-down）

## Meta

- **type**: refactoring
- **slug**: b9-bypass-burndown
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`single-mutator-enforcement`（#492）で「**JobState.status は `transitionJob`（src/state/lifecycle.ts）経由のみ**」を `B-9` として歯にし、既存の直書き 3 箇所を `arch-allowlist.ts` に grandfather した（enforce-then-burn-down の enforce 相）。

本 change はその **burn-down 相**：3 箇所を `transitionJob` 経由に書き換え、`B-9` allowlist エントリ 3 件を削除して **B-9 実違反ゼロ**を達成する。

対象 3 箇所（**grep authoritative**: 実装者が scan で再確定すること。下記は背景としての列挙であり確定列挙ではない）:

- `src/store/job-state-store.ts` の `fail()` … `status: "failed" as JobStatus` 直書き（tracking: B9-store-fail）
- `src/core/lifecycle/exit-guard.ts` … `status: "awaiting-resume"` 直書き（tracking: B9-exit-guard）
- `src/core/runtime/local.ts` の signal-handler … `status: "awaiting-resume" as const` 直書き（tracking: B9-signal-handler）

## 要件

1. 上記 status 直書き箇所（scan で確定した全件）を `transitionJob(state, to, { trigger, reason, patch? })` 経由に書き換える。
2. `tests/unit/architecture/arch-allowlist.ts` の `invariant: "B-9"` エントリを**全件削除**する（allowlist は削除のみ＝ratchet 規約）。
3. `core-invariants.test.ts` の B-9 suppression test（`B9-store-fail` を参照）が allowlist 空化で壊れないよう、`event-bus-interface-demote` と同じく **synthetic entry に decouple**（または当該 suppression test を削除）。どちらにするかは design で確定。B-9 regression guard（新規 status 直書きを足すと red）は維持する。
4. **遷移合法性の確認（本 change の核心リスク）**: 各 call-site の prior state を実コードで追い、`transitionJob` が throw しない（`VALID_TRANSITIONS` が当該遷移を許す）ことを保証する。
   - 現状の直書きは **FSM 検証を skip している**ため、安易に `transitionJob` 化すると「今まで暗黙に通っていた非合法遷移」が露見して throw する＝**挙動変更**になる。
   - 特に `fail()`（→`failed`）が `running` 以外（`awaiting-merge` / terminal 等）からも呼ばれうるかを調査する。`VALID_TRANSITIONS` では `failed` への遷移元が `running` のみ。
   - 非合法遷移が存在する場合は design で扱いを決める: (a) `VALID_TRANSITIONS` に当該遷移を追加 / (b) call 側で guard / (c) 当該経路は B-9 対象外と明記。いずれも**設計判断として明示記録**する。

## スコープ外

- 他 invariant（B-1〜B-8）。
- B-9 検出ロジック自体の変更（#492 で確定済）。
- `architecture/model.md` の編集（authority doc は人間 gate。§4 への B-9 行追加・§5 台帳の刈り込みは本 change の対象外）。
- 振る舞いの意図的変更（遷移が今より厳格化する場合は要件4で明示的に扱い、暗黙には変えない）。

## 受け入れ基準

- [ ] status 直書き箇所が `transitionJob` 経由になり、`arch-allowlist.ts` の `B-9` エントリが **0 件**
- [ ] B-9 arch test が green（実違反ゼロ、かつ regression guard が機能維持）。suppression test を**削除する選択**を採った場合も、B-9 regression guard（新規 status 直書きを足すと red）と live B-9 scan test の**両方が機能する**ことを確認する
- [ ] 各遷移が `VALID_TRANSITIONS` で合法（または非合法ケースの扱いを design に記録した上で green）
- [ ] bypass の解消対象が **grep authoritative に全件確定**されている（実装者が scan で確定）
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **enforce-then-burn-down の burn-down 相**: #492 が立てた歯の allowlist を削除のみで縮め、B-9 を実違反ゼロにする。歯はそのまま残す。
- **遷移合法性が核心リスク**: 直書きは FSM 検証を bypass していたので、`transitionJob` 化で「今まで暗黙に許されていた非合法遷移」が露見し throw しうる。grep authoritative に call-site を確定し、prior state を実コードで追って合法性を確認する（#482 の教訓: 私の列挙でなく scan で確定）。
- **並行 change との非干渉**: 並行する `arch-closure-src-wide` は B-9 test を書き換えない（追加のみ）scope なので、本 change の B-9 領域編集と別領域 → 3-way merge 衝突は最小。
