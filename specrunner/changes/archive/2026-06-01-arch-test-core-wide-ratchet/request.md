# アーキ構造不変条件（B-1〜B-8 + closure）を core 全体に ratchet 方式で歯付けする

## Meta

- **type**: spec-change
- **slug**: arch-test-core-wide-ratchet
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`architecture/model.md` が構造 authority（層・§3 closure model・§4 B-1〜B-8 不変条件）を定義しているが、conformance 監査で **enforcement（歯）がほぼ空**であることが判明した:

- 現状の歯 `tests/unit/architecture/module-boundary.test.ts` は自認どおり **`core/request/ only` scoped**、`core/runtime/` を明示除外（docstring L9-10）。B-1〜B-8 を codebase 全体では一切強制していない。
- その結果、実コードに複数の divergence が現存（grep 実証済み）:
  - **B-2**: `core/runtime/local.ts:17` が生 SDK `query`（`@anthropic-ai/claude-agent-sdk`）を import。
  - **B-3**: `parser/request-md.ts:5-6` が `core/request`（`ParsedRequest`）を import（**循環**）／`parser/rules/*` が `core/validation` を import／`config/migrate.ts:13`・`state/schema.ts:15` が `core/step/step-names` を import（back-edge）。
  - **B-4**: `util/slugify.ts:6` が `core/request/store` を re-export／`util/copy-artifacts.ts` が prompts/logger/state/templates/errors を import（leaf でない）。
  - **B-6/B-7/B-8/単一mutator**: `doctor.ts` raw env・`progress.ts` raw stderr・`executor.ts` の `config.runtime` 分岐・`store.fail()`/`exit-guard` の raw status 書き（`model.md` §5 に台帳化済み）。

歯が無いため、これらは CI で捕まらず、新規 divergence も無検出で増える。本 change は **個別 divergence を直すより先に、歯を core 全体へ立て、現状を allowlist で凍結して regression を止める**（ratchet）。`model.md` §5 の散文 divergence 台帳を、縮むだけの機械強制 allowlist に変える。

## 要件

1. 構造 enforcement を **`core/request` scoped → core 全体（`core/runtime` の明示除外を解除）** へ拡張する。`model.md` §3 の closure model（allowed-edge whitelist。表に無い edge は divergence）と §4 の B-1〜B-8 を assert する。**src 全体への拡張は本 change のスコープ外（後続 change に委ねる）**とし、本 change は scope を core 全体に確定する（allowlist も core スコープで測定する）。実装機構は dependency-cruiser（TS-native・宣言的）か既存 vitest arch test の拡張のいずれか —— 選択と根拠は design / ADR に残す。
2. **ratchet（allowlist）**: 現状の既知 divergence を**明示的・documented な allowlist** として grandfather し、拡張後の歯が **today green** になるようにする。本 change の allowlist は core-scoped 違反（R2=runtime SDK、B-6/B-8）を対象とし、各エントリに `file` + 違反する不変条件（B-#）+ tracking（R#/B#）を併記する。R1/R3/R4（parser→core、step-names back-edge、util leaf 違反）の allowlist 化は B-3/B-4 の直接スキャンと合わせて src-wide 拡張 change で実施する。単一mutator は lifecycle 不変条件であり B-# grep 対象外のため本 change の allowlist・テスト対象から除外し、後続 change で enforcement 設計を別途検討する。
3. **closure（unknown edge = divergence）**: allowlist に無い forbidden edge が新規に出現したら CI が red になる。allowlist は追加でなく**削除のみ**を正とする（エントリ削除は対応するコード修正とセット）。
4. enforcement と allowlist は **CODEOWNERS-gated な場所**（`tests/unit/architecture/` or dependency-cruiser config）に置く。

## スコープ外

- **個別 divergence の修正**（R1 parser-kernel-demote / R2 runtime-sdk-to-adapter / R3 step-names-kernel-demote / R4 util-leaf-purify / B-6/7/8 seam hygiene）—— 本 change は**歯を立て現状を凍結する**ことに集中し、修正は後続の各 burn-down request が allowlist エントリを1件ずつ削る。
- branch protection / `finish-respect-branch-protection`（T1。別 change）。
- **src 全体への enforcement 拡張**（本 change は core 全体に確定。src 全体への拡張と allowlist の src-wide 再測定は後続 change）。
- `architecture/` docs の編集（out-of-loop authority。本 change は §3/§4/§5 を**消費して enforce する側**であり書き込まない）。

## 受け入れ基準

- [ ] 構造 enforcement が `core` 全体（`core/runtime` 除外を解除）を対象に B-1〜B-8 + closure を assert する（src 全体は本 change の対象外）
- [ ] 現状の既知 divergence が documented allowlist に列挙され、各エントリに file + B-# + tracking ID が併記されている
- [ ] allowlist 込みで enforcement suite が green（false red なし）
- [ ] allowlist に無い forbidden edge を1件足すと suite が red になる（regression guard をテストで実証）
- [ ] module-boundary capability の delta spec（`specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md`）に core 全体 scope と allowlist 規約が反映されている
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **ratchet > big-bang**: 「R1〜R4 を全部直してから歯を on」だと着手が遅れ、その間も新 divergence が増える。現状を allowlist で凍結して **先に regression を止め、高 ROI（R1 循環 → R4 util → R2 SDK → R3 step-names）から burn down** する方が、solo・minimal-ceremony に整合する。
- **allowlist = §5 divergence 台帳の機械形**: `model.md` §5 の散文台帳を「縮むだけの allowlist」に写す。台帳と歯の二重 authority drift を解消し、エントリ削除＝divergence 解消が機械的に追える。
- **dependency-cruiser か vitest 拡張か**: `model.md` §6 が両方を選択肢として挙げている。dependency-cruiser は宣言的で `forbidden`/`allowed`/`required` を §3 表に compile しやすい一方、依存追加になる。既存 vitest arch test の拡張は no-new-dep だが手書き grep が増える。trade-off を design で評価し ADR に残す（本 change の adr:true の主対象）。
- **closure を whitelist で**: `model.md` §3 の「✓ の edge だけ allowed・未知の逆流は自動 divergence」を enforcement の既定にする。これにより allowlist に無い新規違反が必ず red になり、ratchet が一方向（緩まない）に効く。
