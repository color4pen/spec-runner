# adapters / ports が domain 型を直参照しない：共有型を shared-kernel へ降格（DSM burn-down 2）

## Meta

- **type**: refactoring
- **slug**: dsm-domain-type-demote
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`arch-closure-src-wide`（#495）で凍結した 21 件の §3 違反のうち、**adapter→domain（~12 件）と ports→domain（~4 件）の計 16 件**を burn-down する。

§3 で **adapters→domain は ✗ / ports→domain は ✗（ただし ports→Value Object は除外）**。adapter と port が同じ domain 型（`agent/definition` / `step/types` / `event/types` / `tools/types` など）を直 import している。**共有型を shared-kernel へ降格すれば、adapter edge と port edge が一度に legal になる**（cohesion 軸でグループ化する根拠）。

対象（**grep authoritative**: 実装者が scan で全件確定。下記は背景）:

- **adapter と port が共有する domain 型**（降格で両 edge を一括解消）:
  - `core/agent/definition` … adapter/managed-agent/anthropic-client + core/port/anthropic-client
  - `core/step/types` … adapter/managed-agent/agent-runner + core/port/agent-runner
  - `core/event/types` … adapter/claude-code/agent-runner + core/port/agent-runner
  - `core/tools/types` … adapter/managed-agent/{sse-stream,session-client} + core/port/session-client
- **adapter のみが import**:
  - `core/types.ts` の `StepContext` … adapter/{claude-code,codex,managed-agent}/agent-runner（3 件）
  - `core/step/executor-helpers`（`throwWrappedError` 等の関数）… adapter/managed-agent/{agent-runner,error-helpers}（2 件）
  - `core/step/step-names` … adapter/managed-agent/agent-runner（1 件）
  - `core/lifecycle/diagnostic` … adapter/claude-code/agent-runner（1 件）

## 要件

1. 上記の共有 domain 型（`agent/definition` / `step/types` / `event/types` / `tools/types`）と adapter 専用の `StepContext` / `step-names` / `diagnostic` を、**shared-kernel（物理的には `src/kernel/`。`step-names.ts` を R3 で同所へ降格した先例に倣う）または §3 で adapter/port から legal な層へ降格**する。各共有型の降格は adapter edge と port edge を**同時に**解消する。
2. `executor-helpers` の**関数**（`throwWrappedError` / `attachStateAndRethrow` 等）は、ports 経由公開 / shared-kernel 降格 / adapter 内複製のいずれかで解消する。方針は design で確定。
3. 上記 import site（scan で確定した全件）を新しい legal path に張り替える。
4. `tests/unit/architecture/arch-allowlist.ts` の `DSM-adapter-domain-*` と `DSM-ports-domain-*` エントリ（計 16 件）を削除する。
5. ratchet 規約継承: allowlist は**削除のみ**、DSM closure test が green（実違反が 16 件減る）。liveness guard も維持される。

## スコープ外

- **domain→comp-root**（`RuntimeStrategy` / `prereqs`）= 並行する `dsm-runtime-strategy-demote` の領分。
- `core/types.ts` の `RuntimeStrategy` import（line 9 付近）/ `PipelineDeps.runtimeStrategy` フィールド（line 105 付近）の領域。本 change が `core/types.ts` で触るのは **`StepContext` 定義領域のみ**。
- `core/runtime/` 配下（並行 change の領分。本 change は touch しない）。
- `architecture/model.md` の編集（authority doc は人間 gate）。
- 振る舞い変更。

## 受け入れ基準

- [ ] 共有型 / helper が legal な層に降格し、`arch-allowlist.ts` の `DSM-adapter-domain-*` と `DSM-ports-domain-*` エントリが **0 件**
- [ ] DSM closure test が green（実違反が 16 件減少、liveness guard も維持）
- [ ] 対象 import site を実装者が scan で全件列挙し、`implementation-notes.md` に scan 結果（対象ファイル一覧）を記録している
- [ ] `core-invariants.test.ts` の既存 invariant test（B-1〜B-9 の describe ブロック。B-9 は #492 で実在）が無改変で green
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **共有型降格で adapter+port 両 edge を一括解消**: adapter と port が同じ domain 型を参照しているため、型を shared-kernel に降ろせば双方の §3 違反が同時に消える。だから「from 層（adapter / port）」でなく「降格する型」を cohesion 軸にグループ化する。
- **ports→VO は §3 除外**: 降格後に ports が参照するのは shared-kernel 上の Value Object となり、§3 の「ports→VO は許容」に乗って legal になる。
- **並行非干渉**: `core/types.ts` は本 change が `StepContext` 定義領域のみ、並行 `dsm-runtime-strategy-demote` が `RuntimeStrategy`/`PipelineDeps` 領域を編集 ＝ distinct region なので 3-way merge で衝突最小。`core/runtime/` には触れない。allowlist も削除する DSM サブ領域が別。
- **grep authoritative**: import site の列挙は scan で全件確定（#482 の教訓）。
