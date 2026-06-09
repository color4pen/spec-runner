# architecture/ — 構造の out-of-loop authority

ここは spec-runner の **構造（振る舞い以前）の定義**を置く場所。人間が著者で、**pipeline はここに書き込まない**。

## なぜ out-of-loop なのか

spec-runner は自分自身を pipeline で開発する（dogfooding）。pipeline は `specrunner/changes/` に delta を書き、`specrunner/adr/` を生成し、`src/` を書き換える。つまり構造定義を pipeline が触れる空間に置くと、**pipeline が自分を縛る構造定義を自分で書き換えられる**（閉ループ）。

trust root は、ループが構造的に届かない場所に固定して初めて意味を持つ。ここを `CODEOWNERS` + branch protection で人間 review に固定する（trust の歯はディレクトリ名でなく `CODEOWNERS`）。

## ファイル構成

### 定義（構造の定規・粒度の階層）— すべて out-of-loop（CODEOWNERS）

| ファイル | 粒度（View）| 内容 |
|---|---|---|
| **`model.md`** | 層・依存（Development）| 様式 / 層 / 許可された依存（DSM）/ B-1〜B-10 |
| **`components.md`** | コンポーネント（Logical / C4 Component）| 各コンポーネントの責務 ＋ 公開インターフェース ＋ 協調相手 |
| **`domain-model.md`** | 型/データ（Logical / DDD）| Aggregate（JobState）/ Value Object（Verdict 等）/ 静的データの不変条件 |
| **`dynamic-model.md`** | 動的構造（Logical / Dynamic）| 状態機械（JobStatus / Pipeline）/ 実行時束縛（liveness）/ 遷移不変条件 |
| **`conformance.md`** | 接続仕様 | write 注入内容 / review 観点 / 歯（B-1〜B-10 + closure）の assert 仕様 |

> 正確な signature/型は **コードが正典**（`src/core/port/*.ts`, `src/state/schema.ts` 等）。上記は陳腐化しない粒度（責務・契約の形・不変条件）まで。C4 Code level は生成/参照。

### 役割（authority の 4 区分）

| 役割 | 置き場 | 著者 | trust |
|---|---|---|---|
| **定義（SoT）** | `architecture/{model,components,domain-model,dynamic-model,conformance}.md` | 人間 | out-of-loop（CODEOWNERS）|
| **歯（enforcement）** | `tests/unit/architecture/` ＋（将来）`.dependency-cruiser.cjs` | code（定義から derive）| in-loop だが CODEOWNERS-gated |
| **決定記録** | `architecture/adr/`（構造 ADR）| 人間 | out-of-loop（CODEOWNERS）・append-only |
| **計測（reconcile）** | enforcement の**生成出力**（手書きしない）| 生成物 | — |

> `architecture/divergence-status.md` は上記の authority ではなく **状況断面（snapshot・mutable）**。設計書をクリーンに保つため、現状の divergence・burn-down 履歴・配線状況をここに分離する。live な真実は歯（`arch-allowlist.ts` / `core-invariants.test.ts`）。

### ADR の書き方（`architecture/adr/`）

構造判断の ADR は `architecture/adr/` に置く。`architecture/` が out-of-loop なのと同じ理由で、**pipeline が自分を縛る構造の「根拠」まで自分で書き換えられない**ようにするため。`/architecture/` は CODEOWNERS で覆われているので本ディレクトリも自動的に人間 review 必須。

**何を書くか（構造のみ）**: 層の割り当て / 依存方向（DSM の edge）/ port・seam の境界 / 不変条件（B-x）/ 型の所在 / ADR governance。「常に保つ形」を書く。

**何を書かないか（振る舞いは別 authority）**: メソッド・step が「何をするか」＝ アルゴリズム / 解決順 / 手順 / routing / product 選択 / 実装の段階計画。これらは spec（`specrunner/changes/`）と request、または pipeline 振る舞いの ADR（`specrunner/adr/`）に置き、構造 ADR からは**参照に留める**。

**litmus test**: 「層・依存・境界・不変条件の話か？」→ YES なら構造 ADR。「関数/step が何をするかの話か？」→ YES なら spec/behavior 側。迷ったら architecture には書かない。

**置き場の使い分け**:
- `architecture/adr/` … 構造判断（out-of-loop）。
- `specrunner/adr/` … pipeline の振る舞い・実装判断（in-loop）。2026-05-31 の `structure-rulings` ADR も本ディレクトリ新設前のものとしてここに残る（移設しない）。

**フォーマット**（既存様式に合わせる）:
- ファイル名: `YYYY-MM-DD-<kebab-slug>.md`
- 見出し: `# ADR-YYYYMMDD: <一行タイトル>`
- 節: `## ステータス`（proposed / accepted）→ `## コンテキスト` → `## 決定`（D1, D2… の ruling 単位）→ `## 構造的含意`（層 / edge / 不変条件への影響）→ `## 検討した代替案` → `## 結果`（Positive / Negative）
- 不変条件（B-x）を新設・変更する ADR は、歯（`tests/unit/architecture/core-invariants.test.ts`）と**同時に** `model.md` §4 へ昇格する。歯を後追いにする場合は ADR 内で「提案・ratify 待ち」と明記する（歯の無い invariant を §4 に置かない）。

## 使い方

- **コード/振る舞いを書く** → `model.md`（どこに）＋ `components.md`（何を実装）＋ `domain-model.md`（どの型）を読む。注入仕様は `conformance.md` 消費点1
- **request 出力が構造に沿うか review** → 決定的＝歯（B-1〜B-10）/ 判断＝`conformance.md` 消費点2 の観点
- **構造を変えたい** → 該当 doc を人間が編集（CODEOWNERS review）＋ 理由を ADR に追記

## 出自

設計対話 2026-05-31。`specrunner/adr/2026-05-31-structure-rulings.md` に決定の経緯。
