# 「status 変更は transitionJob 経由のみ」を歯にする（単一 mutator enforcement）

## Meta

- **type**: refactoring
- **slug**: single-mutator-enforcement
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

設計（`architecture/domain-model.md` の JobStatus 状態機械・`architecture/model.md` §4）は「**JobState の status 変更は `transitionJob` 経由のみ**」（不正な遷移を throw で防ぐ）を不変条件としている。だが**これを強制する歯が無く**、`model.md` §5 の divergence 台帳に「単一 mutator 未強制」として記録されている。

実際に `transitionJob` を経由せず `patch + persist` で status を直書きする raw 経路が複数現存:
- `src/store/job-state-store.ts` の `fail()`（`status: "failed"` を直書き）
- `src/core/lifecycle/exit-guard.ts`（`status: "awaiting-resume"` を直書き）
- `src/core/runtime/local.ts` の signal-handler（`status: "awaiting-resume"` を直書き）

本 change はこの不変条件を**歯にして凍結**する（enforce-then-burn-down の ratchet パターン）。

## 要件

1. 「**`transitionJob` を経由せず JobState の `status` を書いたら検出する**」歯を `core-invariants.test.ts`（または同等の arch test）に追加する。grep で status の直書き（`status:` への代入を含む patch / persist 経路）を検出し、`transitionJob` 経由でないものを違反とする。検出方法は design で確定（例: `status:` 直書きの call-site を grep し、`state/lifecycle.ts`〔transitionJob 定義〕を除外）。
   - ※ `create()` での status 初期設定は**遷移でなく初期化**なので**対象外**（transitionJob は status の*変更*のみを縛る。初期作成には prior state が無い）。検出はこの初期化 call-site を含めない。
2. 現状の bypass（`store.fail` / `exit-guard` / `local.ts` signal-handler 等）を `arch-allowlist.ts` に **grandfather（grep authoritative に全件凍結）**。各エントリに file + invariant 名 + tracking。**invariant 名は既存 B-1〜B-8 規約に揃えるか（例 `B-9`）独立名（`INV-MUTATOR`）にするかを design で確定**し、確定したら `model.md` §4 表との対応も design ノートに残す。
3. ratchet 規約を継承: allowlist は削除のみ、**新規の status 直書きを足すと red**（regression guard をテストで実証）。

## スコープ外

- **bypass の修正そのもの**（`store.fail` 等を `transitionJob` 経由に直すのは別 burn-down）。本 change は**歯を立てて現状を凍結**するまで。
- 他 invariant（B-3 / B-7）。
- 振る舞い変更。

## 受け入れ基準

- [ ] 「status 直書きは `transitionJob` 経由のみ」の歯が存在し、現状 bypass を allowlist で凍結して suite が green
- [ ] allowlist に無い**新規の status 直書き**を足すと suite が red（regression guard を実テストで実証）
- [ ] bypass エントリが grep authoritative に全件列挙されている（実装者が scan で確定）
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **`model.md` §5 が E1 へ委譲した「単一 mutator 未強制」を歯化**: 設計の不変条件（status は transitionJob 経由のみ）に enforcement を与え、新規の bypass を機械的に止める。
- **enforce-then-burn-down**: 本 change は歯＋現状凍結まで。既存 bypass の解消（store.fail 等を transitionJob 化）は後続。scope と凍結対象を一致させ #482 の矛盾を作らない。
- **grep authoritative**: bypass の列挙は scan で全件確定（私の列挙に依存しない）。
