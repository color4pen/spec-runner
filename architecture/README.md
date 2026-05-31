# architecture/ — 構造の out-of-loop authority

ここは spec-runner の **構造（振る舞い以前）の定義**を置く場所。人間が著者で、**pipeline はここに書き込まない**。

## なぜ out-of-loop なのか

spec-runner は自分自身を pipeline で開発する（dogfooding）。pipeline は `specrunner/specs/` を書き、`specrunner/adr/` を生成し、`src/` を書き換える。つまり構造定義を pipeline が触れる空間に置くと、**pipeline が自分を縛る構造定義を自分で書き換えられる**（閉ループ）。

trust root は、ループが構造的に届かない場所に固定して初めて意味を持つ。ここを `CODEOWNERS` + branch protection で人間 review に固定する（trust の歯はディレクトリ名でなく `CODEOWNERS`）。

## ファイル構成

### 定義（構造の定規・粒度の階層）— すべて out-of-loop（CODEOWNERS）

| ファイル | 粒度（View）| 内容 |
|---|---|---|
| **`model.md`** | 層・依存（Development）| 様式 / 層 / 許可された依存（DSM）/ B-1〜B-5 / divergence |
| **`components.md`** | コンポーネント（Logical / C4 Component）| 各コンポーネントの責務 ＋ 公開インターフェース ＋ 協調相手 |
| **`domain-model.md`** | 型/データ（Logical / DDD）| Aggregate（JobState）/ Value Object（Verdict 等）/ 不変条件 |
| **`conformance.md`** | 接続仕様 | write 注入内容 / review 観点 / 歯（B-1〜B-5）の assert 仕様＝**実装ハンドオフ** |

> 正確な signature/型は **コードが正典**（`src/core/port/*.ts`, `src/state/schema.ts` 等）。上記は陳腐化しない粒度（責務・契約の形・不変条件）まで。C4 Code level は生成/参照。

### 役割（authority の 4 区分）

| 役割 | 置き場 | 著者 | trust |
|---|---|---|---|
| **定義（SoT）** | `architecture/{model,components,domain-model,conformance}.md` | 人間 | out-of-loop（CODEOWNERS）|
| **歯（enforcement）** | `tests/unit/architecture/` ＋（将来）`.dependency-cruiser.cjs` | code（定義から derive）| in-loop だが CODEOWNERS-gated |
| **決定記録** | `specrunner/adr/2026-05-31-structure-rulings.md` | 人間 | append-only |
| **計測（reconcile）** | enforcement の**生成出力**（手書きしない）| 生成物 | — |

## 使い方

- **コード/振る舞いを書く** → `model.md`（どこに）＋ `components.md`（何を実装）＋ `domain-model.md`（どの型）を読む。注入仕様は `conformance.md` 消費点1
- **request 出力が構造に沿うか review** → 決定的＝歯（B-1〜B-5）/ 判断＝`conformance.md` 消費点2 の観点
- **構造を変えたい** → 該当 doc を人間が編集（CODEOWNERS review）＋ 理由を ADR に追記

## 残りの作業（gated な次ステップ。本ディレクトリの外で行う）

`model.md` §5/§6 の課題。**いずれも CODEOWNERS-gated**（無人 merge させない）:

1. **E1 歯の core 全体拡張** — `tests/unit/architecture/` を `core/request` scoped から core 全体へ。dependency-cruiser 導入は任意（TS native）。B-1〜B-8（credential/出力 seam・runtime 分岐集約を含む）・単一 mutator（status 書きは `transitionJob` 経由のみ）・循環検出を機械化。併せて `tests/` 二重構造の整理
2. **R1 core↔parser 循環の解消** — `ParsedRequest`/`ParsedRequestSections` を core/request→shared-kernel へ降格（★最初の一歩・最高 ROI）
3. **R2 runtime の SDK 直 import 追い出し** — `src/core/runtime/local.ts:17` の生 SDK `query` を adapters へ
4. **R3** — `step-names` を kernel へ降格 / `util` を真の leaf に
5. **T1 trust 完成** — branch protection（GitHub 側設定）＋ `finish-respect-branch-protection`（別 draft）で無人 merge を gate に委ねる

これらは `model.md` を消費する側であり、本ディレクトリの「形成」とは分離している。

## 出自

設計対話 2026-05-31。`specrunner/adr/2026-05-31-structure-rulings.md` に決定の経緯。
