# closure の上向き edge（B-3/B-4）を ratchet で歯付けし R1/R3/R4 を凍結する

## Meta

- **type**: spec-change
- **slug**: arch-upward-edge-ratchet
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

先行 change `arch-test-core-wide-ratchet`（PR #482）が core 全体の構造 enforcement を ratchet 方式で立てたが、**B-3（上向き禁止／循環）と B-4（leaf 純度）を deferred とした**（test body が `expect(true).toBe(true)` の no-op）。理由は「B-3/B-4 の違反は `core/` の*外*（`parser/`・`config/`・`state/`・`util/`）に起点があり、core scoped の scan では届かない」ため。

結果、**最高 ROI の divergence が凍結されていない**:
- **R1 = `parser/request-md.ts` → `core/request`（ParsedRequest 循環、★最高）/ `parser/rules/*` → `core/validation`**
- **R3 = `config/migrate.ts` / `state/schema.ts` → `core/step/step-names`（back-edge）**
- **R4 = `util/slugify.ts` → `core/request/store`（re-export）/ `util/copy-artifacts.ts` → prompts/logger/state/templates/errors（leaf 違反）**

新たな上向き edge を足しても CI が red にならない。本 change は **closure の上向き edge（B-3/B-4）を実際に assert し、現状の R1/R3/R4 を allowlist で凍結する** —— #482 が deferred とした部分を完成させる。

> **#482 の失敗から学んだ前提（厳守）**: 本 change の scope は「core への*上向き* edge」であり、**それを検査するには `parser/`・`config/`・`state/`・`util/` 等の非-`core/` ディレクトリを scan する必要がある。これは本 change の scope の*内側*であって deferred ではない**。「freeze 対象（R1/R3/R4）が core の外にあるから scope 外」という #482 型の矛盾を作らないこと。

## 要件

1. #482 が新設した `tests/unit/architecture/core-invariants.test.ts` の **B-3 / B-4 の no-op stub を実 assert に置き換える**:
   - **B-3**: shared-kernel / leaf / persistence 層のディレクトリ（`src/parser/`・`src/config/`・`src/state/`・`src/git/`・`src/prompts/`・`src/logger/`・`src/templates/`）が `src/core/`（domain）を import していないことを assert する（`model.md` §3 の上向き禁止。Value Object 例外注¹は §3 に従う）。
   - **B-4**: `src/util/`（leaf）が他の `src/` モジュールを一切 import していないことを assert する。
   - これらは非-`core/` ディレクトリを grep/scan する。allowlist フィルタ込み。
2. B-3 / B-4 の scan を実行し、**検出された*全て*の上向き edge を `tests/unit/architecture/arch-allowlist.ts` に allowlist エントリとして列挙する**。各エントリに `file` + 違反 invariant（B-3 / B-4）+ tracking を併記。**以下は既知の seed であり*網羅ではない* —— AC『suite green』を満たすには grep が拾う全件を allowlist 化する必要があるので、実装者は scan を実行して全件を確定すること**:
   - R1: `src/parser/request-md.ts`（ParsedRequest, B-3）/ `src/parser/rules/*`（ValidationRule・RuleRegistry, B-3）
   - R3: `src/config/migrate.ts` / `src/state/schema.ts`（step-names, B-3）
   - R4: `src/util/slugify.ts`（core/request/store, B-4）/ `src/util/copy-artifacts.ts`（prompts/logger/state 等, B-4）
   - B3-logger: `src/logger/pipeline-logger.ts` → `core/event/event-bus`（B-3）
   - B3-state-port: `src/state/schema.ts` → `core/port/model-usage`・`core/port/report-result`（B-3。step-names とは別の追加 import。canonical re-export として allowlist 凍結するか、grep を domain subpath 限定にして port を除外するかは design で判断）
3. **closure（unknown edge = divergence）**: allowlist に無い新規の上向き edge を1件足すと CI が red になる（#482 の T-04 regression guard を B-3/B-4 へ拡張、または同等の test で実証）。allowlist は削除のみを正とする。
4. `module-boundary` capability の delta spec（`specrunner/changes/arch-upward-edge-ratchet/specs/module-boundary/spec.md`）に、上向き edge（B-3/B-4）が core ratchet の被覆に含まれることを反映する（#482 の「B-3/B-4 は src-wide deferred」記述を supersede）。

## スコープ外

- **R1/R3/R4 の修正そのもの**（`parser-kernel-demote` / `step-names-kernel-demote` / `util-leaf-purify` の各 burn-down request）。本 change は**凍結（allowlist 追加＋assert）まで**で、修正しない。
- B-1/B-2/B-5/B-6/B-7/B-8（#482 で既に enforce 済み）の再実装。
- `cli/` 等 core 外の call-site 違反（例: `progress.ts` の B-7）—— 本 change は **import-graph の上向き edge（B-3/B-4）に限定**。
- `architecture/` docs の編集（§3/§4 を consume して enforce するだけ）。

## 受け入れ基準

- [ ] B-3 / B-4 の test が **no-op でなく実際に非-`core/` ディレクトリを scan**し、上向き import を検出する
- [ ] R1（parser→core）/ R3（config・state→core/step）/ R4（util→core・util→他層）が allowlist に file + B-# + tracking 付きで列挙されている
- [ ] allowlist 込みで enforcement suite が green
- [ ] allowlist に無い**新規の上向き edge**（例: 仮の `src/parser/x.ts` → `src/core/y.ts`）を足すと suite が red になる（regression guard を実テストで実証）
- [ ] #482 の B-3/B-4 `expect(true).toBe(true)` stub が解消されている
- [ ] `module-boundary` delta spec が上向き edge 被覆を反映し、#482 の「deferred」を supersede している
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **#482 の deferral を完成させる additive な change**: #482 を作り直す（cancel/再 run）のでなく、#482 が立てた test/allowlist 機構を**拡張**して上向き edge を被覆する。partial → full ratchet。
- **scope と freeze 対象を一致させる（#482 RCA の核心）**: #482 は「freeze せよ（R1/R3/R4）」と「core scope（= core の外を見ない）」が矛盾し、agent 判断で defer に倒れた。本 change は scope を「**core への上向き edge＝非-`core/` を scan する**」と定義し、freeze 対象（R1/R3/R4 の起点）が scope の*内側*に来るようにして、defer 分岐自体を構造的に消す。
- **依存**: 本 change は #482 の `core-invariants.test.ts` ＋ `arch-allowlist.ts` を拡張するため、**#482 が main に merge された後に run する**（worktree が #482 込みの main から作られる必要がある）。
- **同じ ratchet 規約を継承**: allowlist は CODEOWNERS-gated（`tests/unit/architecture/`）、削除のみ、unknown edge は自動 red。#482 の ADR（vitest + allowlist 採用）を踏襲するため新規 ADR は不要。
- **既知 divergence の列挙を request 作者が完璧にやろうとしない（#482 RCA 再発防止）**: 列挙漏れ（現に review が `logger→event-bus`・`state→port` を追加検出）は `suite green` を壊す or 実装者が grep を狭めて defer する誘因になる。そこで「私の列挙」ではなく **「scan が検出する全件を allowlist 化する」＋「新 edge → red」を authoritative** とし、実装者の grep 実行を正典にする（LLM 不確定性原則: agent が完璧に列挙する場面そのものを消す）。
