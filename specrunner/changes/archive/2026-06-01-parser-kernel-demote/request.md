# parser を kernel に純化し core↔parser 循環（B-3 / R1）を切る

## Meta

- **type**: refactoring
- **slug**: parser-kernel-demote
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

ADR `2026-05-31-structure-rulings`（D4）と `architecture/model.md` §5（R1・★最高 ROI）が「`ParsedRequest`/`ParsedRequestSections` を `core/request`→shared-kernel へ降格」を決定済み。現状の divergence:

- `src/parser/request-md.ts:5-6` が `core/request/types.ts` の `ParsedRequest`/`ParsedRequestSections` を re-export / import。
- `src/parser/rules/*`（title-required 等）が `core/validation/types`（`ValidationRule`）・`core/validation/registry`（`RuleRegistry`）を import。

= parser（shared-kernel）が core（domain）を import する**上向き edge＝B-3 違反**かつ **core↔parser 循環**。full ratchet（PR #483）が `tests/unit/architecture/arch-allowlist.ts` の **R1 群**（`parser/request-md.ts` ＋ `parser/rules/*` 全件）で凍結中。本 change はこれを解消し、当該 allowlist エントリを削除する。

## 要件

1. `ParsedRequest`/`ParsedRequestSections` の**定義を `core/request/types.ts` から kernel（parser が所有する場所。例: `parser/request-md.ts` 自体か parser 配下の types module）へ移す**。`core/request` 側はそこから import（domain→kernel の下向き＝allowed）に反転する。
2. `parser/rules/*` の `core/validation` への上向き依存を解消する。`ValidationRule`/`RuleRegistry`（validation rule interface）を kernel（parser 配下 or 共有 kernel）へ移すか、`parser/rules` が `core/validation` を import しない構成に再配置する。
3. 全 importer を更新する（対象: `src/parser/` 配下 ＋ `core/request/types.ts`〔re-export 側〕。`core/spec/rules` の `DeltaSpecRuleRegistry` は `core/validation` の `RuleRegistry` とは別物で**対象外**）。
4. `tests/unit/architecture/arch-allowlist.ts` の **R1（invariant B-3）エントリを全件削除**する。

## スコープ外

- 他の burn-down（R2 / R3 / R4）と ratchet が surface した別 edge（`B3-state-port` / `B3-state-helpers` / `B3-logger`）。
- shared-kernel 層の広域 reorg。
- **振る舞い変更**（本 change は型・定義の移動と import 経路の反転のみ。公開挙動は不変）。

## 受け入れ基準

- [ ] `src/parser/`（request-md・rules）が `src/core/` への上向き import を一切持たない（B-3 arch test が parser に対し green）
- [ ] `arch-allowlist.ts` の R1 エントリが削除され、enforcement suite が **green**（= fix が完全。半端なら ratchet が red にする）
- [ ] `core/request` と validation 経路の公開挙動が不変（型移動のみ）
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **structure-rulings D4 を実行する mechanical な型降格**: 新規の設計選択でなく、記録済み ruling（ParsedRequest/ParsedRequestSections の kernel 降格）の実装。配置の最終確定は design に委ねる。
- **ratchet が fix の完全性を機械強制する**: allowlist の R1 を消すと、parser→core edge が1つでも残れば B-3 test が red になる。よって「半端な fix が green を通る」ことが構造的に起きない（#482 型の取りこぼし防止）。
- **validation rule interface の置き場**: `parser/rules` が `core/validation` に依存するのは「解析（kernel）が judgment（domain）に依存する」逆転。rule interface を kernel 側に置くのが筋（design で確定）。
