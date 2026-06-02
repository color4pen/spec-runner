# scenario→test の「中身の歯」：must TC の test に実質的な assertion を要求する

## Meta

- **type**: spec-change
- **slug**: scenario-test-faithfulness-gate
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

#504 / #505 で scenario → test の橋が架かり、verification の test-coverage phase が「must TC-ID が test ファイルに**存在するか**」を機械検査するようになった。だがこの検査は **TC-ID 文字列の出現しか見ない**ため、`it("TC-001", () => {})` のような**空 / トリビアルな stub でも pass**する。つまり「test が存在する」は保証されるが「test が scenario を**実際に検証している**か」は保証されない（中身の歯が無い）。

ADR `architecture/adr/2026-06-02-spec-model.md` は「振る舞いの真実は test」と定めている。その真実が空 stub で通っては意味がない。本 change は test-coverage を強化し、**must TC を参照する test が実質的な assertion を持つこと**を最小の faithfulness 検査として要求する。

## 要件

1. verification の test-coverage phase を強化する：must TC-ID を参照する test が、**少なくとも 1 つの実質的な assertion**（例: `expect(` / `assert`）を含むことを検査する。スコープは **TC-ID を参照するファイル内に assertion が存在すること**（既存 test-coverage の file 全体検索を踏襲）。TC-ID の出現だけでは pass させない。
2. assertion を持たない（空 / トリビアル stub の）must TC を検出した場合、test-coverage を **failed** にし、どの TC が assertion 欠如かを result に報告する。
3. 検査は CLI 内部処理（`node:fs`/`node:path` のみ、既存 test-coverage phase と同様）で行う。

## スコープ外

- mutation testing 等のより厳密な faithfulness 検証（将来の「厳」側。本 change は assertion 存在の「緩」側に留める）。
- scenario ↔ 構造の整合（表裏一体）= 別 request。
- spec-merge 廃止 / baseline 撤廃。
- should / could TC への適用（must のみが対象）。

## 受け入れ基準

- [ ] assertion を持たない must TC の test（空 stub）に対して test-coverage が `failed` になり、欠如 TC が報告される。
- [ ] assertion を 1 つ以上持つ must TC の test では test-coverage が `passed` になる（既存挙動を壊さない）。
- [ ] must TC が 0 件 / test-cases.md 不在のケースは従来通り（skipped / passed）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

ADR `architecture/adr/2026-06-02-spec-model.md`（真実 = test）の faithfulness を最小コストで底上げする。「存在の歯」（TC-ID 出現）に「中身の歯」（assertion 存在）を 1 段足すもので、完全な faithfulness（test が scenario を意味的に検証しているか）は mutation testing 等の別 request に委ねる。assertion 存在という機械検査可能で安価な基準を採る。
