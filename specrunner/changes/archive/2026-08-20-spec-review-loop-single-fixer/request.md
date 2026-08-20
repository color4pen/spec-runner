# spec-review loop の単一 fixer 化: test-case-gen を review loop から外す

## Meta

- **type**: spec-change
- **slug**: spec-review-loop-single-fixer
- **base-branch**: main
- **adr**: true

## 背景

Fixes #1015。

spec-review loop は現在、test-cases.md 宛の finding の修正担当として test-case-gen を再利用している。しかし test-case-gen は design.md / tasks.md を入力に test-cases.md を**生成する producer** であり、現在の test-cases.md を修正対象として扱う契約を持たない。そのため loop 内で起動されると wholesale 再生成になり、operator が `--apply-canon` で正式採用した修正（例: TC の priority 裁定）のうち生成元 canon に根拠が載っていないものが、**finding と無関係でも警告なしに消える**（#1015 の実例: operator-apply commit の TC-007 must 昇格が、無関係のフォーマット指摘の修正で should に回帰）。

対処は「resume に operator 修正の保護機構を足す」のではなく、**採用後にそれを壊す特殊な再生成経路を消す**ことである。resume が「この差分だけ後段 agent から守れ」を覚え始めると resume が肥大化する。operator 修正 → `--apply-canon` → canon として確定 → 以降は通常 pipeline、という契約に戻す。

損益: spec-review の指摘をすべて spec-fixer が直す形にすると、loop は spec-review ⇄ spec-fixer の単純な形（code-review ⇄ code-fixer と同形）になり、test-case-gen を loop に差し込むためだけに存在した補助構造（TC-only routing 述語・episode 透過化）が丸ごと削除できる。

## 現状コードの前提

- `src/core/step/canon-write-scope.ts:37-48` — `writableByFixer` map。spec-fixer = {spec.md, design.md, tasks.md}、test-case-gen = {test-cases.md}。test-cases.md は spec-fixer の write scope 外。
- `src/core/step/canon-escalation.ts:56` `specReviewEffectiveFixer`（常に "spec-fixer"）、同 `:63` `testCaseGenEffectiveFixer`（常に "test-case-gen"、test-cases.md 宛 finding の routable 判定に使用）。
- `src/core/pipeline/spec-observation.ts:129` `specReviewNeedsFixIsTcOnly` — TC 宛 finding のみの needs-fix を判定する述語。同 `:103` `specFixerNeedsFixForward`。
- `src/core/pipeline/types.ts` の STANDARD_TRANSITIONS: `:252` design → test-case-gen（初回生成、exempt type は bypass）、`:261` TC-only needs-fix → test-case-gen 直行（guarded）、`:269` spec-fixer approved (needs-fix 後) → test-case-gen（TC 再生成）、`:267` observation auto-fix の spec-fixer → implementer（guarded）。
- `src/core/pipeline/registry.ts:85-86` — `loopIntermediateSteps: test-case-gen`（spec-fixer → test-case-gen → spec-review が convergence budget をリセットしないための episode 透過化）。`src/core/pipeline/pipeline.ts:99,113,126,523-527` が消費点。
- `src/core/step/spec-fixer.ts` — spec-fixer step。prompt は spec.md / design.md / tasks.md の修正を指示しており test-cases.md には触れない。
- chore type は test-case-gen を bypass する（`src/core/pipeline/test-gen-exemption.ts`、#987）。

## 要求

### 1. spec-fixer の write scope に test-cases.md を追加

`writableByFixer` の spec-fixer に `test-cases.md` を追加する。spec-review の finding は対象ファイルによらずすべて spec-fixer に route される（routable 判定の effective fixer は spec-fixer のみになる）。spec-fixer の step prompt に test-cases.md の修正責務（既存内容を尊重した targeted 修正であり、再生成ではない）を追記する。

### 2. test-case-gen を review loop から外す

test-case-gen は design 後に一度だけ走る producer に戻す。以下を削除する:

- `specReviewNeedsFixIsTcOnly`（述語と、それを guard に使う TC-only needs-fix → test-case-gen 直行 transition）
- `testCaseGenEffectiveFixer`（TC routable 判定の用途が消滅する）
- spec-fixer approved（needs-fix 後）→ test-case-gen の TC 再生成 transition。行き先は spec-review（re-review）になる
- `loopIntermediateSteps` の `test-case-gen` 指定（registry）。この指定のためだけに存在する `loopIntermediateSteps` パラメータ自体は、他 pipeline（fast / design-only 等）に利用が無いことを確認した上で削除してよい。利用が残る場合はパラメータは維持し registry の指定のみ削除する

design → test-case-gen → spec-review の初回経路と、exempt type の bypass（#987）は変更しない。

### 3. resume 側は無変更

resume / apply-canon には何も足さない。operator 修正は `--apply-canon` で canon として確定し、以降は通常 pipeline が扱う。本 request の歯（受け入れ基準参照）がこの契約の成立を検証する。

### 4. observation auto-fix 経路の整合

spec-review approved + low/medium routable findings → spec-fixer → implementer の observation auto-fix 経路は維持する。routable 判定が「spec-fixer writable（test-cases.md を含む）」に広がることに伴う guard 述語（`specReviewHasRoutableFixables` 等）の単純化を行う。

## 受け入れ基準

- [ ] **#1015 の歯**: operator 編集済み test-cases.md（finding と無関係の変更を含む）を持つ状態で spec-review → spec-fixer → spec-review の一巡を回し、finding と無関係の operator 編集が test-cases.md に保存されることがテストで pin される
- [ ] spec-review の test-cases.md 宛 fixable finding が spec-fixer に route され、escalation にならないことがテストで pin される（canon-finding escalation の対象から test-cases.md が外れる）
- [ ] 削除対象（`specReviewNeedsFixIsTcOnly` / `testCaseGenEffectiveFixer` / TC 再生成 transition / episode 透過化指定）が存在しないことが構造で確認できる（grep またはテスト）
- [ ] test-case-gen が review loop 中に起動されないこと（needs-fix 一巡の transition 検証）がテストで pin される
- [ ] design → test-case-gen の初回経路と exempt type bypass の既存テストが green（transition 表の変更対象外）
- [ ] spec-review ⇄ spec-fixer の convergence budget（episode 検出）が透過化なしで正しく数えられることがテストで pin される
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- resume / apply-canon の挙動変更（何も足さない、が本 request の主張）
- code-review loop・conformance の routing 変更
- test-case-gen の生成品質・prompt の変更（loop からの除去のみ）
- spec-review の finding 検出基準の変更
- #1015 で議論した operator 差分保護機構（不採用と裁定済み）
