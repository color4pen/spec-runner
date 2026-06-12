# Design: code 変更後の機械検証を pr-create 前に構造的に保証する

## Context

pipeline は `request.md → PR` を 13 step の state-machine（遷移表駆動）で生成する。機械検証（`typecheck && test`）を実行するのは **verification step だけ**であり、verification は `implementer` / `build-fixer` の直後にのみ走る（`src/core/pipeline/types.ts:158-164`）。

- `implementer success → verification`（`types.ts:158`）
- `build-fixer success → verification`（`types.ts:163`）
- `verification passed → code-review` / `verification failed → build-fixer`（`types.ts:160-161`）

verification を通過した後の impl phase の gate は **すべて LLM レビュー**（code-review / custom reviewers / regression-gate / conformance）であり、テストを再実行しない。fixer のうち **code-fixer** だけは、コードを変更した後に verification を経由せず reviewer chain → conformance → adr-gen → pr-create へ到達できる。

### 実証された欠陥（PR #648 / job e9602244, 2026-06-12）

code-fixer が commit したコードがアーキテクチャテスト TC-018 に違反（pipeline.ts への STEP_NAMES import）していたが、verification は implementer 直後の snapshot しか保証しておらず、code-fixer の変更を含む状態では一度も `typecheck && test` が走らなかった。テスト fail を含む branch が pr-create まで到達し、CI red の PR が作られた。pipeline 内部の機械検証は「最後のコード変更」より前の時点しか保証していなかった。

### 現状の遷移経路分析（pr-create への到達口）

pr-create への唯一の入口は `adr-gen success → pr-create`（`types.ts:180-183`）。adr-gen への入口は `conformance approved → adr-gen`（`types.ts:173`）のみ。よって **全 impl-phase 修正経路は `conformance approved` という単一 chokepoint に合流**してから pr-create へ向かう。

各 fixer から pr-create までの間に verification があるか:

| 最後のコード変更 step | 後続経路 | 機械検証 |
|---|---|---|
| implementer | → verification | あり ✓ |
| build-fixer | → verification | あり ✓ |
| spec-fixer | → spec-review → … → implementer → verification | あり ✓ |
| conformance `needs-fix:implementer` | → implementer → verification | あり ✓ |
| conformance `needs-fix:spec-fixer` | → spec-fixer → … → implementer → verification | あり ✓ |
| **code-fixer**（reviewer 起点 / conformance `needs-fix:code-fixer` 起点） | → reviewer chain → conformance approved → adr-gen → pr-create | **なし ✗** |

欠陥は **code-fixer が「最後のコード変更 step」になる経路に限定**される。code-fixer の reviewer 戻り routing（`reviewer-chain.ts:187-211`）も conformance 戻り routing（`conformance → code-fixer`）も verification を経由しない。

### 制約

- 機械検証は決定的（`typecheck && test`）であり、判断揺れのない単一の真実源。LLM gate に検証義務を委ねない（スコープ外）。
- verification ↔ build-fixer の収束則（`VERIFICATION_RETRIES_EXHAUSTED`、maxIterations）は変更しない（スコープ外）。
- コード変更が一度も起きていない run（fixer 未実行）では余分な再検証を増やさない（要件 3）。
- custom reviewer 構成（`composeReviewerDescriptor`）でも同じ保証が成立すること。

## Goals / Non-Goals

**Goals**:

- pipeline の不変条件として「最後にコードを変更した step の後、pr-create へ到達する前に、当該変更を含む状態で `typecheck && test` が少なくとも 1 回成功している」を**遷移表で構造的に保証**する。
- 既存の verification step を再利用し、`conformance approved` chokepoint からコード変更があった場合のみ verification を再実行する。再検証 failed は既存の `verification → build-fixer` 収束則に乗せる。
- コード変更が verification 以降に起きていない run では再検証を実行しない（zero-overhead）。
- 上記をテストで固定する（経路不在・failed→build-fixer・no-extra-verify）。

**Non-Goals**（request スコープ外）:

- CI 側の防御強化（CI は最終防衛線として現に機能した。本件は pipeline 内部の保証）。
- LLM reviewer へのテスト実行義務付け。
- verification ↔ build-fixer の maxIterations 等の収束パラメータ変更。
- code-fixer の reviewer 戻り routing そのものの再設計（reviewer chain の収束論理は不変）。
- 新しい verification step／runner の新設（既存 verification step を再利用する）。

## Decisions

### D1: 保証する不変条件の定義（再検証 chokepoint = `conformance approved`）

不変条件 INV を次のとおり定義する:

> pr-create を実行する直前の commit について、その時点の作業ツリーに含まれる**最後のコード変更**を内包した状態で、verification step（`typecheck && test`）が `passed` で完了した実行が履歴に存在する。

pr-create への唯一の入口 `adr-gen success → pr-create`、adr-gen への唯一の入口は `conformance approved`（D2 で `verification passed` も追加）。adr-gen は ADR markdown（`specrunner/adr/`）のみを書きソースを変更しない（`adr-gen.ts:156-167`、後述 D4 の code-mutator 集合から除外）。したがって **`conformance approved` を再検証 chokepoint** とし、ここで「verification 以降にコード変更があれば verification を再実行する」ことを保証すれば、pr-create へ至る全経路で INV が成立する。

**Rationale**: 全 impl-phase 修正経路（code-review / custom reviewers / regression-gate の code-fixer ループ、conformance 自身の needs-fix ループ）は `conformance approved` に合流してから adr-gen → pr-create へ向かう。chokepoint を 1 点に絞ることで、経路ごとの個別対処（fixer ごとに verification を挿入する）を避け、単一の遷移条件で全経路を覆える。conformance は read-only judge で副作用がなく、その approved 出力は「impl phase の受け入れ完了」を意味するため、最終機械検証の自然な発火点になる。

**Alternatives considered**:
- *code-fixer の直後に毎回 verification を挿入する*（`code-fixer → verification → reviewer`）: 各 fixer iteration で verification が走り、reviewer 戻り routing（`resolveActiveReviewer` ベースの forward/fallback 行）を verification の出力側へ移す大改修が必要。conformance → code-fixer の局所修正でも code-review 全再走を誘発し、既存の収束予算（conformance-fix-target D5）を壊す。却下。
- *adr-gen の後（pr-create の直前）に置く*: adr-gen はコードを変更しないため再検証の意味がなく、adr-gen は loop step でないため後述の episode-reset（D5）の恩恵を受けられない。chokepoint としては conformance approved が最良。却下。

### D2: 既存 verification step を再利用し、`conformance approved` から条件付きで再実行する

遷移表 `STANDARD_TRANSITIONS` の conformance 区画を次のとおり拡張する（`types.ts:173`）:

```
{ CONFORMANCE, on: "approved", to: VERIFICATION, when: codeChangedSinceLastVerification }  // 追加（再検証）
{ CONFORMANCE, on: "approved", to: ADR_GEN }                                                // 残置（既検証 → skip）
```

`when` 付き行を先に置き、`find`（`pipeline.ts:295-298`）が条件成立時に再検証行を、不成立時に既存の skip 行を選ぶ。再検証は**新しい step ではなく既存の `VERIFICATION` step そのもの**へ遷移する。

**Rationale**: 要件 2「再検証 failed は既存の `verification → build-fixer` 遷移と同じ収束則に乗せる」を**文字どおり**満たす最小手段。既存 verification step は `failed → build-fixer`（`types.ts:161`）を持つため、再検証 failed は自動的に build-fixer へ流れ、verification ↔ build-fixer ループの既存収束（`VERIFICATION_RETRIES_EXHAUSTED`）に乗る。runner / verification-result.md 伝播 / build-fixer の context 注入もすべて既存配線をそのまま使える。新 step を作ると同じ収束を再実装する必要があり DRY に反する。

**Alternatives considered**:
- *専用の `exit-verification` step を新設*: verification runner / build-fixer 配線 / 収束ループを二重化する。既存 verification step の再利用で十分。却下。

### D3: `verification passed` の出口を context-aware にする（再検証通過 → adr-gen）

verification は再利用ゆえ「初回（implementer 後）」と「再検証（conformance approved 後）」の 2 文脈で実行される。出口を分岐する（`types.ts:160`）:

```
{ VERIFICATION, on: "passed", to: ADR_GEN, when: conformanceApprovedLatest }  // 追加（再検証通過）
{ VERIFICATION, on: "passed", to: CODE_REVIEW }                               // 残置（初回 → 通常レビュー）
{ VERIFICATION, on: "failed", to: BUILD_FIXER }                               // 不変
{ VERIFICATION, on: "escalation", to: "escalate" }                           // 不変
```

`conformanceApprovedLatest(state)` = 「conformance の最新 run の verdict が `approved`」。`when` 付き行を先に置く。

**健全性**: conformance は code-review approved の後にしか走らない。よって `conformance 最新 verdict === approved` が真になるのは **再検証文脈（conformance approved → verification、およびその build-fixer 回復路 build-fixer → verification）に限る**。初回 verification（implementer 後）では conformance は未実行（verdict 無し）→ false → code-review。`conformance → needs-fix:implementer → implementer → verification` では conformance 最新 verdict は `needs-fix:implementer`（approved でない）→ false → code-review（再実装の再レビュー、正しい）。

**build-fixer 回復路の含意**: 再検証 failed → build-fixer → verification → passed のとき conformance 最新 verdict は依然 approved → adr-gen。build-fixer の変更は LLM 再レビューを経ずに pr-create へ向かうが、**機械検証は通過済み**であり、本 request のスコープ（機械検証の保証であって LLM レビュー網羅ではない）に合致する。Risks に明記する。

**Rationale**: 遷移表は既に `when` による context-aware routing を多用する（code-review approved の fixable 分岐、code-fixer の戻り routing、conformance の fixTarget 分岐）。verification の出口分岐も同型で、確立されたパターンに沿う。step を二重化せず単一 verification step の出口だけを文脈で切り替える。

**Alternatives considered**:
- *verification を 2 つの step 名に分ける*: D2 の理由により却下（収束・配線の二重化）。

### D4: `codeChangedSinceLastVerification` 述語（impl code-mutator 集合 × endedAt recency）

純関数を新規 module `src/core/pipeline/reverification.ts` に置く:

- `IMPL_CODE_MUTATOR_STEPS = [IMPLEMENTER, BUILD_FIXER, CODE_FIXER]` — impl phase で role が `creator | fixer` の step（= ソースを変更しうる step）。
- `codeChangedSinceLastVerification(state)`:
  1. `vTime = state.steps[VERIFICATION] の全 run の endedAt の最大`（無ければ `""`）。
  2. `mTime = IMPL_CODE_MUTATOR_STEPS の全 run の endedAt の最大`（無ければ `""`）。
  3. `mTime > vTime`（ISO 8601 文字列の辞書順比較）を返す。
- `conformanceApprovedLatest(state)`: conformance 最新 run の `outcome.verdict === "approved"`。

**判定の意味**: 「最後にコードを変更した step が、最後に verification が走った時点より後に走ったか」。code-fixer が verification 後に走った経路では `mTime(code-fixer) > vTime` → true → 再検証。clean run（implementer → verification、以後コード変更なし）では `mTime(implementer) < vTime(verification)` → false → skip（要件 3）。

**code-mutator 集合の Rationale**: 集合を「impl phase の creator/fixer」に限定する。custom reviewers / regression-gate は reviewer/gate でソースを変更せず、conformance / adr-gen / verification も gate。spec phase の creator/fixer（design / spec-fixer）はソースでなく change-folder artifact を変更し、その下流は必ず implementer → verification を経るため `vTime` が更新され誤検出しない。よって impl creator/fixer 3 step が必要十分。将来 impl phase に code-mutator が増えても、この集合に追加すれば述語が自動的に覆う（構造的拡張余地）。

**endedAt recency の Rationale**: pipeline は step を逐次実行するため production では `endedAt` が step 間で単調。先行 change（conformance-fix-target D4）が同じ endedAt-recency パターンを採用済みで決定性が実証されている。同一 timestamp は synthetic test のみで起こり得るため、述語の unit test は異なる timestamp を与えて固定する。

**Alternatives considered**:
- *state に `codeChangedSinceVerification` フラグを持ち各 fixer/verification で set/clear*: 書き込み点が分散し state schema を増やす。state を増やさず既存の StepRun timeline から導出する方が「LLM session に state を持たせない」核心原理に整合。却下。
- *git の HEAD sha を verification 実行時に記録し比較*: verification step に新たな副作用（sha 記録）を足す。timeline 導出で十分。却下。

### D5: 収束 — 再検証は既存 verification ↔ build-fixer ループに fresh 予算で乗る（パラメータ不変）

`conformance approved → verification` の遷移で、pipeline の既存「fresh convergence episode reset」（`pipeline.ts:365-380`）が自動発火する: nextStep=verification は paired fixer（build-fixer）を持つ loop step で、currentStep=conformance はその paired fixer ではないため、`loopIters[verification]=0` / `fixerIters[build-fixer]=0` にリセットされる。続く exhaustion 判定（`pipeline.ts:416-420`）は fresh カウンタを見るため即時打ち切りしない。

- 再検証 passed（codeChanged は verification 実行で `vTime` が最新化されるため、以後 conformance は再実行されない）→ adr-gen。
- 再検証 failed → build-fixer → verification → … の既存ループ。build-fixer が修正不能なら `VERIFICATION_RETRIES_EXHAUSTED` で awaiting-resume（既存挙動）。

**無限ループ非発生**: conformance は `approved → verification` で抜けた後、verification passed → adr-gen で確定し再入場しない。conformance への再入場は needs-fix 経路（必ず fixer が走り mTime を更新）のみ。verification ↔ build-fixer は既存予算で打ち切る。新しい counter / maxIterations を一切導入しない（スコープ外を遵守）。

**Rationale**: 既存の episode-reset 機構が「非 paired-fixer から loop step への入場」を fresh episode 化する設計のため、`conformance → verification` 入場は**追加コードなしで**再検証に fresh 予算を与える。これは D2（verification step 再利用）を選んだことの直接的な恩恵。

**Alternatives considered**:
- *再検証専用の収束予算を新設*: スコープ外（収束パラメータ変更）かつ既存機構で足りる。却下。

### D6: custom reviewer 構成での保証維持（compose-reviewers 変更不要）

`composeReviewerDescriptor`（`compose-reviewers.ts:62-83`）は code-review / code-fixer / regression-gate / custom reviewer の遷移行だけを filter して再生成し、**verification / conformance の行は base からそのまま保持**する。よって D2 / D3 で追加する verification・conformance 行は custom reviewer 構成でも維持される（変更不要、確認のみ）。

custom 構成の再検証通過路は `conformance approved →（codeChanged）verification → passed →（conformanceApproved）adr-gen` で custom reviewers / regression-gate を再走しない。failed 路は `→ build-fixer → verification → adr-gen`。標準構成と同型。

**Rationale**: chokepoint を conformance approved に置いたことで、reviewer chain の動的構成（行数可変）と独立に保証が成立する。compose 側に手を入れないことで custom reviewer 機能との結合を生まない。

## Risks / Trade-offs

- **[Risk] build-fixer の回復路で LLM 再レビューを飛ばす** → 再検証 failed → build-fixer → verification → adr-gen は build-fixer の変更を機械検証のみで通す（D3）。本 request のスコープは「機械検証の保証」であり「LLM レビュー網羅」ではない。build-fixer は build/test 修正に限定され出力は機械検証される。意図的トレードオフとして明記。LLM 再レビューまで保証したい場合は別 request。
- **[Risk] `verification passed` 出口述語の取り違え** → `conformanceApprovedLatest` が再検証文脈のみ真になることは「conformance は code-review approved 後にしか走らない」という pipeline 不変条件に依存する。この前提をテストで固定する（初回 verification → code-review、再検証 verification → adr-gen）。
- **[Risk] endedAt の単調性依存** → production では逐次実行ゆえ単調。synthetic test のみ同一 timestamp になり得るため、述語 unit test は異なる timestamp を与える（conformance-fix-target D4 と同じ前例）。
- **[Risk] 行数依存テストの破壊** → `tests/unit/pipeline/transition-when.test.ts` の TC-WHEN-02 が `STANDARD_TRANSITIONS.length` を固定値で検査している。本変更は 2 行追加するため当該テストの期待値を更新する（zero-regression のための既知の更新点）。

## Open Questions

- なし。chokepoint・述語・収束はすべて既存機構の組み合わせで閉じる。LLM 再レビューの網羅は明示的にスコープ外。
