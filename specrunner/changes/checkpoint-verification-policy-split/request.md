# checkpoint 検証の分離: generic integrity と use-case policy の二層化

## Meta

- **type**: refactoring
- **slug**: checkpoint-verification-policy-split
- **base-branch**: main
- **adr**: true

## 背景

remote checkpoint の検証・実体化（rebind）は現在 `job attach --branch` 専用に実装されており、awaiting-resume の checkpoint だけを対象とする公開契約と一体になっている。今後、issue 起点の resume（さらに将来は awaiting-archive の issue 起点取り込み）が同じ rebind 機構を使う。しかし現在の検証関数は「checkpoint が壊れていないこと」の汎用検証と「resume できること」の use-case 固有検証が単一関数に同居しており、許可 status の差し替えだけでは他 use-case の checkpoint は resume 固有検査で落ちる。

これを「汎用整合性検証 → use-case verification policy → 実体化」の二層に分離し、rebind primitive が policy を受け取る構造にする。**観測可能な挙動は一切変えない**: `job attach --branch` の公開契約（awaiting-resume のみ・検証順序・エラー文言）は不変であり、attach は「generic + attach-resume policy」の合成として再表現されるだけである。

## 現状コードの前提

- `src/core/attach/verify-checkpoint.ts:54-58` — 検証は (b) journal / projection integrity、(b-new) counter reversal、(a) `status === "awaiting-resume"`、(d-new) resume step の reads() 必須入力の存在検査、が単一関数に同居している。(b)(b-new) は use-case 非依存の整合性検証、(a)(d-new) は resume 固有の policy 検査である。
- `src/cli/attach.ts:1-13` — `job attach --branch <branch>` は fetch → checkpoint OID 固定 → `runAttachVerification` → 検証済み OID で workspace 実体化。検証と実体化のオーケストレーションは `src/core/attach/orchestrator.ts`。
- `src/core/pipeline/pipeline.ts:612-620` — awaiting-resume の checkpoint は単一 seam（`commitFinalState`）で feature branch へ publish される。rebind の対象はこの checkpoint。

## 要求

### 1. 検証の二層分離

- **generic integrity verification**: journal / projection 整合、counter reversal、identity、必須 canon の存在等 — checkpoint が「壊れていない」ことの検証。use-case に依存しない
- **use-case verification policy**: attach-resume policy = `status === "awaiting-resume"` + resumePoint 解決 + resume step reads() 入力検査。policy は交換可能な単位として定義する（将来の awaiting-archive policy が新しい primitive を要求しない形）。ただし awaiting-archive 用 policy の実装そのものはスコープ外

### 2. rebind primitive の policy 注入

検証・実体化の primitive は許可 status の列挙（allowedStatuses 等のデータ引数）ではなく **verification policy を受け取る**。policy の差し替えだけで別 use-case の checkpoint 検証が成立する構造にする。

### 3. attach の再表現（挙動保存）

`job attach --branch` を「generic + attach-resume policy + 実体化」の合成として再実装する。公開契約は変えない: 対象は awaiting-resume の quiescent checkpoint のみ、検証順序、エラー文言、exit code、成功時の出力・案内、すべて現状どおり。

## 受け入れ基準

- [ ] **既存の attach のテストが無改変で green**（分離が挙動保存であることの証拠）
- [ ] rebind primitive が verification policy を引数として受け取り、attach-resume policy を差し替えても generic 検証が独立に機能する構造であることがテストで pin される（resume 固有検査が generic 側に残っていないこと）
- [ ] attach-resume policy 単体のテスト: status 不一致 / resumePoint 解決失敗 / reads() 入力欠落 の各拒否が policy 層で発火する
- [ ] `tests/unit/architecture/` が green（新 allowlist エントリを追加しない）
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- awaiting-archive 用 verification policy の実装
- issue-target 層・`job resume --from-issue`（後続 request: issue-target-start-face / issue-target-resume-from-issue）
- `job attach` の公開契約・CLI surface の変更
- checkpoint publish 側（`commitFinalState`）の変更
