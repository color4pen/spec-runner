# ADR-20260531: architecture/ を構造 authority として新設し、5 つの構造 ruling を採用

## ステータス

accepted

## コンテキスト

spec-runner は ADR `2026-04-29-module-architecture-style`（D1〜D6）で **Layered Capability Modules**（Modular Monolith + Functional Core + Hexagonal-lite + Pipes & Filters）を様式として決定済み。だが「あるべき構造」を **positive・self-standing に宣言する単一の定義（定規）** が存在せず、構造の認識は ADR の散文・arch test・`rules/`・人間の頭の中に分散していた。

2026-05-31 の設計対話で、`specrunner/specs/`（振る舞いの actual state の写し）の **対** になる **構造の定義（intended architecture model）** が欠けていることを特定した。これは「request の上のレイヤ」に当たり、reflexion model（intended vs actual の convergence/divergence/absence）の "high-level model" に相当する。

実依存グラフを機械抽出して ADR D5 の intended と突き合わせた結果、複数の divergence が判明:

- `core/runtime` が adapter を直 import（3件）＋ 生 SDK を import（local.ts:17）= 第二 composition root 化
- `core ↔ parser` の module レベル循環（`ParsedRequest` 型が core/request に置かれ parser が re-export）
- `state`/`config`/`logger` → `core` の back-edge（共有定数 `step-names` が core/step にある）
- `util` が core/state/prompts を import（leaf でない）
- `store` が `core/port` を implements していない（対応 port も無い）
- core が広範に直接 IO（node:fs* 24件）= 「Functional Core」が実態でなく願望
- 依存方向の arch test が `core/request` のみ scoped、`core/runtime` を意図的除外（歯が drift に縮小）

これらの解消には「あるべき層割り当て」を確定する必要があり、module-architect に機械的軸（cohesion / coupling / SRP / testability）で分析させた（`module-analysis` 相当、本 ADR に統合）。

## 決定

### D1: architecture/ を構造の out-of-loop authority として新設

`architecture/model.md` を構造の定規（SoT）とし、`CODEOWNERS` でループ外に固定する。`contract/`（pipeline の振る舞い契約）の兄弟として並置する:

- `contract/` = pipeline がどう振る舞うか（step-outcome 規約・INV-1/2/3）
- `architecture/` = コードがどう構造化されているか（層・依存）

`contract/` は退役させない（振る舞い側 authority として生きており、arch test と archive change が参照する）。両者は behavior/structure の対。

### D2〜D6: 構造 ruling（module-architect 推奨を採用）

#### D2: runtime = composition-root（折衷）

`core/runtime/` を composition-root 層と認め、adapters を組み立ててよいとする。ただし **生 SDK 型は持たない**（`architecture/model.md` B-2）。`local.ts:17` の生 `query` import は adapters へ追い出す。

- 却下: 「合成を全部 cli に戻す」純粋案 — factory.ts の「runtime 分岐 1 箇所」の良い性質を壊し solo で payback 薄。「runtime は adapter 何でも可」案 — SDK 漏れを恒久放置し B-2 を空文化。

#### D3: Functional Core を判定系に縮小、imperative core を受容

ADR D2 の「Functional Core」を **「判定系（verdict / transition / spec-rules）だけは I/O を持たない」**（B-5）に縮小定義する。core 全体の純粋化は追わない（26 ファイル横断の seam 化は ceremony 過多、solo dogfood の制約と矛盾）。

- 影響: ADR `module-architecture-style` D2 と関連 specs の「Functional Core」記述は本 ADR で縮小される。

#### D4: shared-kernel 層を新設し core を頂点に片方向化

`config`/`state`/`git`/`parser`/`prompts`/`logger`/`errors`/`templates` を **shared-kernel 層**（core より下）と定義する。これにより core↔parser・util→core 等の循環が「上向き = divergence」として明確に禁止される（B-3/B-4）。

- 具体是正: `ParsedRequest`/`ParsedRequestSections` を core/request→kernel へ、`step-names` を core/step→kernel へ降格。
- parser は domain でなく kernel（pure な解析。core/validation に依存させるのは逆）。state の schema=kernel・不変条件=domain。

#### D5: store = standalone Repository

`JobStateStore` を persistence 層の standalone Repository とし、ADR `module-architecture-style` S-4「store は core/port を implements」を**取り下げる**。`ConfigStore` は既存 port を維持。

- 根拠: A-1（store が core/port を import せず、対応 port も無い）が長期未実現＝需要不在。使われない interface は ceremony 最小制約に反する。将来 fake store が要れば port を足せばよい。

#### D6: adapters → shared-kernel 直 import を許容

adapters が `config`/`state`/`prompts`（shared-kernel）を直接 import するのを allowed edge として正規化する（下方向依存）。**ただし B-2（SDK 型を core に漏らさない）は維持**。

## 検討した代替案

- **architecture/ を新設せず contract/ に merge** — 却下。step-outcome は振る舞い契約であり構造定義と category が異なる。merge すると behavior/structure を混同し、archive 参照を壊す。
- **構造定義を `specrunner/` 内に置く** — 却下。pipeline が書き込む空間であり閉ループになる。out-of-loop（root 直下 + CODEOWNERS）が必要。
- **Functional Core 全体を貫く（D3 の逆）** — 却下。26 ファイル横断の seam 化は solo dogfood に ceremony 過多。

## 結果

### Positive

- 構造の定規が単一・positive・self-standing に存在し、divergence/absence を機械照合できる土台ができた
- 旧来の「core/runtime→adapter」「adapter→config/state」が定義上 allowed になり、本当の課題（循環・SDK 漏れ・歯の drift）に集中できる
- behavior（contract/）と structure（architecture/）の authority が対称に整理された

### Negative / Risks

- ADR `module-architecture-style` の D2（Functional Core）と S-4（store implements port）を本 ADR が縮小/取り下げするため、関連 specs の記述更新が必要
- `architecture/model.md` の歯はまだ部分的（`core/request` scoped）。B-1〜B-5 の機械強制（E1）と是正（R1〜R3）は後続の gated 作業
- ruling は owner 委任のもと採用（2026-05-31 セッション）。実装で齟齬が出たら本 ADR を改訂

### Tracking

- E1: arch test を core 全体へ拡張（dependency-cruiser 導入は任意）
- R1（最高 ROI）: core↔parser 循環の解消（型を kernel へ降格）
- R2: runtime の SDK 直 import 追い出し
- R3: step-names 降格 / util を leaf に
- T1: branch protection ＋ `finish-respect-branch-protection`

## 参照

- `architecture/model.md` — 本 ADR が確定する構造定義（定規）
- `architecture/README.md` — out-of-loop authority の位置づけ、contract/ との対
- ADR `2026-04-29-module-architecture-style` — 本 ADR が D3/D5 で縮小/取り下げする様式 ADR
- `contract/` — 振る舞い側 authority（step-outcome / INV-1/2/3）
- 設計対話セッション: 2026-05-31
