# config.runtime 分岐を createRuntime / RuntimeStrategy に集約する（B-8）

## Meta

- **type**: refactoring
- **slug**: runtime-branch-consolidation
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

B-8（runtime〔local / managed〕の分岐は `createRuntime` factory に集約。domain / CLI に `config.runtime` の分岐を散らさない）の現状違反を full ratchet の allowlist が凍結中:

- **B8-executor**: `src/core/step/executor.ts` が `deps.config.runtime === "local"` 分岐を4箇所持つ（HEAD 取得 / template write / template cleanup / commit-and-push）。
- **B8-preflight** / **B8-preflight-checkRuntimePrereqs**: `src/core/preflight.ts` が `config.runtime === "managed"` / `cfg.runtime ...` 分岐を持つ（3箇所）。

= runtime 分岐が domain（executor）・preflight に散在し、runtime 追加・差し替えの影響が1点に閉じていない。

## 要件

1. `executor.ts` の `config.runtime` 分岐（4箇所）を **`RuntimeStrategy` seam に抽出**し、executor を runtime-agnostic にする（local-only 操作を strategy のメソッドへ）。
2. `preflight.ts` の runtime 条件分岐も **strategy / factory seam へ寄せる**（runtime 依存の prereq ロジックを集約）。
3. `arch-allowlist.ts` の **B-8 エントリ（B8-executor / B8-preflight / B8-preflight-checkRuntimePrereqs、計4件）を全件削除**する。
4. **【R3 の教訓・確認済み no-op】** T-04 には **B-8 suppression-demo test は存在しない**（B-6 suppression demo のみ）。よって B-8 を空にしてもテスト崩壊は無く、本要件の repoint は不要。念のため、B-8 を空にした後に enforcement suite が green であることを確認すること。

## スコープ外

- B-6（env seam）・他 invariant。
- runtime の**振る舞い変更**（分岐の置き場を seam に移すのみ。local / managed の実挙動は不変）。
- 第3の runtime 追加。

## 受け入れ基準

- [ ] `src/core/`（runtime/factory 除く）に `config.runtime` / `cfg.runtime` 分岐が無い（B-8 arch test が green）
- [ ] `arch-allowlist.ts` の B-8 エントリが削除され、enforcement suite が **green**
- [ ] T-04 の B-8 suppression-demo（あれば）が生存 entry へ repoint
- [ ] local / managed runtime の pipeline 挙動が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **「runtime 分岐を1点に閉じる」(B-8) を完成**: ruling D2 の依拠根拠でもある「createRuntime 集約」を、executor / preflight から seam へ寄せて実現する。
- **executor → RuntimeStrategy 委譲（adr:true）**: local-only 操作（HEAD 取得・template・commit-push）を strategy のメソッドとして切り出す設計。境界の置き方は ADR に残す。
- **ratchet が fix の完全性を機械強制**: B-8 allowlist を消すと core に分岐が残れば B-8 test が red。
