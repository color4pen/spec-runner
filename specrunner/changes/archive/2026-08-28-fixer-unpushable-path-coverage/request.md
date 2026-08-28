# push capability の unpushable-path contract / notice が implementer のみで、fixer step が backstop halt に直行する

## Meta

- **type**: bug-fix
- **slug**: fixer-unpushable-path-coverage
- **base-branch**: main
- **adr**: false

## 問題

#1078（push-capability-preflight）で導入した unpushable-path の 2 層防御のうち、Layer 1（output contract 違反検出 → agent への 1 回限りの follow-up prompt で修正させる修復経路）と prompt への capability notice の適用範囲が一部の step に限られている。

実測（2026-08-26 時点の main）:

- `unpushable-path` output contract を宣言する step: **`implementer.ts` のみ**（`implementer.ts:267`）
- `renderPushCapabilityNotice` を prompt に注入する step: **`implementer.ts` / `request-review.ts` のみ**
- `code-fixer.ts` / `spec-fixer` 等の fixer step: **contract も notice もゼロ**

その結果、fixer が unpushable path（Actions token の場合 `.github/workflows/**`）を編集すると、Layer 1 の修復機会なしに Layer 2 backstop（`UNPUSHABLE_PATH_BLOCKED`）へ直行して job が halt する。

実例: run 33017611147（#1083 job `single-phase-archive`）。code-review の high finding が workflow ファイルの修正を指示 → code-fixer は事前警告なしで素直に編集 → commit 時に `UNPUSHABLE_PATH_BLOCKED` で `awaiting-resume` halt。implementer は notice + contract を持っていたため同じ run 内で workflow を回避して完走しており、非対称が実証されている。

## 期待する動作

書き込みを行う全 agent step（少なくとも code-fixer / spec-fixer、および findings 起点で任意 path を触り得る step）で implementer と同等の 2 層が機能すること:

1. prompt に capability notice が注入され、agent が unpushable path を事前に回避できる
2. `unpushable-path` contract により、違反時は Layer 2 halt の前に 1 回の follow-up prompt で修復（該当 path の変更破棄 + 代替手段）の機会が与えられる

## 要件

1. `deps.pushCapability` が patterns を宣言している場合、code-fixer / spec-fixer（および該当する他の書き込み agent step）の `outputContracts` に implementer と同形の `unpushable-path` contract（`policy: "follow-up"`）を追加する。
2. 同 step 群の prompt 組み立てに `renderPushCapabilityNotice` を追加する。
3. contract 宣言と notice 注入は implementer の既存実装を単一の共有ヘルパに寄せてよいが、新しい abstraction 層は作らない（fixer-helpers 等の既存共有点に置く）。
4. finding の解消が unpushable path の変更を**不可避**とする場合の挙動を設計で明確化する: follow-up で回避不能なら「環境制約により fixer では解消不能」という理由付きで escalation（halt）に到達すること。無限の review⇄fixer ループにしない。
5. Layer 2 backstop（`UNPUSHABLE_PATH_BLOCKED` → `awaiting-resume` halt + escalation marker）は最終防衛線としてそのまま維持する。

## 受け入れ基準

- [ ] pushCapability 宣言時、code-fixer / spec-fixer の prompt に capability notice が含まれる（unit test で固定）
- [ ] code-fixer / spec-fixer が unpushable path を変更した場合、Layer 2 halt の前に 1 回の follow-up prompt が送られる（既存の implementer 相当のテストを fixer 系に追加）
- [ ] follow-up 後も違反が残る場合は従来どおり `UNPUSHABLE_PATH_BLOCKED` で halt し、escalation marker が issue に投稿される
- [ ] implementer / request-review の既存挙動に変更がない
- [ ] typecheck / test / architecture tests が green

## スコープ外

- Actions token の workflow push 制約そのものの解消（GitHub 側の仕様であり不可能）
- unpushable path の変更を要する finding を pipeline 内で完遂する仕組み（operator-apply が正規経路のまま）
- reviewer step への notice 注入（reviewer は書き込みを行わない）

## 関連

- #1078: push capability preflight（2 層防御の導入。適用範囲が implementer に留まった）
- #1083: 実例となった halt（run 33017611147、code-fixer step）
- `src/core/step/implementer.ts` L259-277（contract 宣言の参照実装）
- `src/core/step/step-context-builder.ts` L125-160（unpushable-path の 1 回限り follow-up の実装）
- `src/core/step/output-verify.ts` L235-253（violation → follow-up prompt 文面）