# 共有 port 型（ModelUsage / BaseReportResult）を kernel へ降格し残 B-3（state→port）を解消する

## Meta

- **type**: refactoring
- **slug**: port-types-kernel-demote
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

full ratchet（B-3 enforcement）が surface した残 B-3 upward edge のうち、**kernel（state）が port の*型*を import** している2件:

- **B3-state-port**: `src/state/schema.ts` が `core/port/model-usage`（`ModelUsage`）と `core/port/report-result`（`BaseReportResult`）を import / re-export。
- **B3-state-helpers**: `src/state/helpers.ts` が `core/port/report-result`（`BaseReportResult`）を import。

= shared-kernel（state）→ ports の上向き＝B-3 違反。R1（ParsedRequest）/ R3（step-names）と同型で、**共有型を kernel へ降格**すれば解消する。`arch-allowlist.ts` の B3-state-port（×2）・B3-state-helpers で凍結中。

## 要件

1. `ModelUsage`（`core/port/model-usage.ts`）と `BaseReportResult`（`core/port/report-result.ts`）の**型定義を kernel（共有型の置き場、例 `src/kernel/`）へ降格**する。`core/port` 側はそこから import（domain→kernel の下向き＝allowed）に反転する。
2. `state/schema.ts`・`state/helpers.ts` は kernel から import に統一。全 importer を更新する。
3. `arch-allowlist.ts` の **B3-state-port（×2）・B3-state-helpers エントリを削除**する。
4. **【R3 の教訓】** B-3 category には `B3-logger`（後述スコープ外）が残るため suppression-demo test は B3-logger を指せる。本 change で T-04 の B-3 suppression-demo が参照する entry を消す場合は、生存 entry へ repoint して regression guard を維持すること。

## スコープ外

- **B3-logger**（`logger`→`core/event` の `EventBus` 型）—— interface を kernel/port へ移すか accept かの判断が別途要るため本 change の対象外（allowlist に残す）。
- 他 invariant（B-6 / B-8）。
- **振る舞い変更**（型の移動と import 経路反転のみ）。

## 受け入れ基準

- [ ] `src/state/`（schema・helpers）が `src/core/port` を import しない（B-3 該当 edge が解消）
- [ ] `arch-allowlist.ts` の B3-state-port / B3-state-helpers が削除され、enforcement suite が **green**
- [ ] `ModelUsage` / `BaseReportResult` の**型構造が不変**（新しい kernel import path は許容。既存 consumer の import 更新は要件2 で保証。re-export 経路は維持/更新どちらでも型は同一）
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **共有型の kernel 降格（R1/R3 同型）**: `ModelUsage`・`BaseReportResult` は state（kernel）と port が共有する型。core を頂点に片方向化する原則どおり、共有型は kernel が住処。port は下向き re-export。
- **EventBus は別判断で除外**: interface（振る舞いを伴う）であり、kernel/port への移動 vs accept は別 triage。本 change はデータ型2件に限定して fork を作らない（#482 の教訓）。
- **ratchet が fix の完全性を機械強制**: 該当 allowlist を消すと state→port が残れば B-3 test が red。
