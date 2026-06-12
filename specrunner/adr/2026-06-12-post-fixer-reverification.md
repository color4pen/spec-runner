# ADR-20260612: code-fixer 後の機械検証保証 — conformance approved を再検証 chokepoint とする

## ステータス

accepted

## コンテキスト

pipeline は `request.md → PR` を state-machine（遷移表駆動）で処理する。機械検証（`typecheck && test`）を実行するのは **verification step のみ**であり、verification は `implementer` / `build-fixer` の直後にのみ走る設計だった（`types.ts:158-164`）。

PR #648 / job e9602244（2026-06-12）でこの設計上の欠陥が実証された。code-fixer が commit したコードがアーキテクチャテスト TC-018 に違反していたが、verification は implementer 直後の snapshot しか保証しておらず、code-fixer の変更を含む状態では `typecheck && test` が一度も走らなかった。テスト fail を含む branch が pr-create まで到達し、CI red の PR が作られた。防御として機能したのは repo 側 CI（最終防衛線）のみだった。

各 fixer から pr-create までの間の機械検証有無を分析すると、欠陥は **code-fixer が「最後のコード変更 step」になる経路に限定**される：

| 最後のコード変更 step | 後続経路 | 機械検証 |
|---|---|---|
| implementer | → verification | あり ✓ |
| build-fixer | → verification | あり ✓ |
| spec-fixer | → spec-review → … → implementer → verification | あり ✓ |
| conformance `needs-fix:implementer` | → implementer → verification | あり ✓ |
| conformance `needs-fix:spec-fixer` | → spec-fixer → … → implementer → verification | あり ✓ |
| **code-fixer** | → reviewer chain → conformance → adr-gen → pr-create | **なし ✗** |

pr-create への唯一の入口 `adr-gen success → pr-create`、adr-gen への唯一の入口は `conformance approved` であり、**全 impl-phase 修正経路は `conformance approved` という単一 chokepoint に合流してから pr-create へ向かう**。

## 決定

### D1: 不変条件 INV の定義と保証手段（conformance approved を再検証 chokepoint とする）

不変条件 INV を次のとおり定義する：

> pr-create を実行する直前の commit について、その時点の作業ツリーに含まれる最後のコード変更を内包した状態で、verification step（`typecheck && test`）が `passed` で完了した実行が履歴に存在する。

この不変条件を保証するために、`conformance approved` を **再検証 chokepoint** とし、「verification 以降に impl-phase のコード変更があれば、adr-gen へ進む前に verification を再実行する」条件付き遷移を追加する。

**Rationale**: 全 impl-phase 修正経路（code-review / custom reviewers / regression-gate の code-fixer ループ、conformance 自身の needs-fix ループ）は `conformance approved` に合流してから adr-gen → pr-create へ向かう。chokepoint を 1 点に絞ることで、経路ごとの個別対処（fixer ごとに verification を挿入する）を避け、単一の遷移条件で全経路を覆える。conformance は read-only judge で副作用がなく、`approved` 出力は「impl phase の受け入れ完了」を意味するため、最終機械検証の自然な発火点となる。

**却下案**:
- *code-fixer の直後に毎回 verification を挿入する*（`code-fixer → verification → reviewer`）: 各 fixer iteration で verification が走り、reviewer 戻り routing（`resolveActiveReviewer` ベースの forward/fallback 行）を verification の出力側へ移す大改修が必要。conformance → code-fixer の局所修正でも code-review 全再走を誘発し、既存の収束予算（conformance-fix-target D5）を壊す。却下。
- *adr-gen の後（pr-create の直前）に置く*: adr-gen はコードを変更しないため再検証の意味がなく、loop step でないため episode-reset（D5）の恩恵を受けられない。却下。

### D2: 既存 verification step を再利用し、conformance approved から条件付きで再実行する

遷移表 `STANDARD_TRANSITIONS` の conformance 区画を拡張する：

```
{ CONFORMANCE, on: "approved", to: VERIFICATION, when: codeChangedSinceLastVerification }  // 追加（再検証）
{ CONFORMANCE, on: "approved", to: ADR_GEN }                                                // 残置（既検証 → skip）
```

`when` 付き行を先に置き、`find` が条件成立時に再検証行を、不成立時に skip 行を選ぶ。再検証は**新しい step ではなく既存の `VERIFICATION` step そのもの**へ遷移する。

**Rationale**: 要件「再検証 failed は既存の `verification → build-fixer` 遷移と同じ収束則に乗せる」を文字どおり満たす最小手段。既存 verification step は `failed → build-fixer` を持つため、再検証 failed は自動的に build-fixer へ流れ、verification ↔ build-fixer ループの既存収束（`VERIFICATION_RETRIES_EXHAUSTED`）に乗る。runner / verification-result.md 伝播 / build-fixer の context 注入もすべて既存配線を再利用できる。

**却下案**:
- *専用の `exit-verification` step を新設*: verification runner / build-fixer 配線 / 収束ループを二重化する。既存 verification step の再利用で十分。却下。

### D3: verification passed の出口を context-aware にする（再検証通過 → adr-gen）

verification は「初回（implementer 後）」と「再検証（conformance approved 後）」の 2 文脈で実行される。出口を述語で分岐する：

```
{ VERIFICATION, on: "passed", to: ADR_GEN,     when: conformanceApprovedLatest }  // 追加（再検証通過）
{ VERIFICATION, on: "passed", to: CODE_REVIEW }                                    // 残置（初回 → 通常レビュー）
{ VERIFICATION, on: "failed", to: BUILD_FIXER }                                    // 不変
{ VERIFICATION, on: "escalation", to: "escalate" }                                // 不変
```

`conformanceApprovedLatest(state)` = 「conformance の最新 run の verdict が `approved`」。

**健全性**: conformance は code-review approved の後にしか走らない。`conformance 最新 verdict === approved` が真になるのは、再検証文脈（`conformance approved → verification`、およびその build-fixer 回復路 `build-fixer → verification`）に限る。初回 verification（implementer 後）では conformance は未実行（verdict 無し）→ false → code-review。`conformance → needs-fix:implementer → implementer → verification` では conformance 最新 verdict は `needs-fix:implementer`（approved でない）→ false → code-review（再実装の再レビュー、正しい）。

**build-fixer 回復路の含意**: 再検証 failed → build-fixer → verification → passed のとき conformance 最新 verdict は依然 approved → adr-gen。build-fixer の変更は LLM 再レビューを経ずに pr-create へ向かうが、機械検証は通過済みであり、本変更のスコープ（機械検証の保証であって LLM レビュー網羅ではない）に合致する。

### D4: `codeChangedSinceLastVerification` 述語（timeline からの導出、state flag 不使用）

純関数を新規 module `src/core/pipeline/reverification.ts` に配置する：

- `IMPL_CODE_MUTATOR_STEPS = [IMPLEMENTER, BUILD_FIXER, CODE_FIXER]` — impl phase で role が `creator | fixer` の step。
- `codeChangedSinceLastVerification(state)`:
  1. `vTime = state.steps[VERIFICATION] の全 run の endedAt の最大`（無ければ `""`）
  2. `mTime = IMPL_CODE_MUTATOR_STEPS の全 run の endedAt の最大`（無ければ `""`）
  3. `mTime > vTime`（ISO 8601 文字列の辞書順比較）を返す
- `conformanceApprovedLatest(state)`: conformance 最新 run の `outcome.verdict === "approved"`

**endedAt recency の Rationale**: pipeline は step を逐次実行するため production では `endedAt` が step 間で単調。先行変更（conformance-fix-target D4）が同じ endedAt-recency パターンを採用済みで決定性が実証されている。

**code-mutator 集合の Rationale**: impl phase の creator/fixer 3 step が必要十分。spec phase の creator/fixer（design / spec-fixer）はソースでなく change-folder artifact を変更し、その下流は必ず implementer → verification を経るため `vTime` が更新され誤検出しない。将来 impl phase に code-mutator が増えても、この集合に追加すれば述語が自動的に覆う（構造的拡張余地）。

**却下案**:
- *state に `codeChangedSinceVerification` フラグを持ち各 fixer/verification で set/clear*: 書き込み点が分散し state schema を増やす。既存の StepRun timeline から導出する方が「LLM session に state を持たせない」核心原理に整合。却下。
- *git の HEAD sha を verification 実行時に記録し比較*: verification step に新たな副作用（sha 記録）を足す。timeline 導出で十分。却下。

### D5: 収束 — 再検証は既存 verification ↔ build-fixer ループに fresh 予算で乗る

`conformance approved → verification` の遷移で、pipeline の既存「fresh convergence episode reset」（`pipeline.ts:365-380`）が自動発火する。nextStep=verification は paired fixer（build-fixer）を持つ loop step で、currentStep=conformance はその paired fixer ではないため、`loopIters[verification]=0` / `fixerIters[build-fixer]=0` にリセットされる。

新しい counter / maxIterations を一切導入しない。再検証 passed で `vTime` が最新化されるため、以後 `codeChangedSinceLastVerification` は false になり conformance は再入場しない。無限ループは構造的に非発生。

**Rationale**: 既存の episode-reset 機構が「非 paired-fixer から loop step への入場」を fresh episode 化する設計のため、`conformance → verification` 入場は**追加コードなしで**再検証に fresh 予算を与える。これは D2（verification step 再利用）を選んだことの直接的な恩恵。

### D6: custom reviewer 構成での保証維持（compose-reviewers 変更不要）

`composeReviewerDescriptor` は code-review / code-fixer / regression-gate / custom reviewer の遷移行だけを filter して再生成し、**verification / conformance の行は base からそのまま保持**する。D2 / D3 で追加する verification・conformance 行は custom reviewer 構成でも維持される（変更不要）。

chokepoint を conformance approved に置いたことで、reviewer chain の動的構成（行数可変）と独立に保証が成立する。

## 検討した代替案

### A1: code-fixer の直後に毎回 verification を挿入する（`code-fixer → verification → reviewer`）

各 fixer iteration で verification が走るため、コード変更は確実に検証される。

- **Pros**: fixer ごとの即時検証。経路ごとに保証が局所的に成立する。
- **Cons**: reviewer 戻り routing（`resolveActiveReviewer` ベースの forward/fallback 行）を verification の出力側へ移す大改修が必要。conformance → code-fixer の局所修正でも code-review 全再走を誘発し、既存の収束予算（conformance-fix-target D5）を壊す。custom reviewer 構成との結合が複雑化する。
- **Why not**: D1 の chokepoint 方式（conformance approved）が全経路を単一遷移条件で覆え、改修範囲が最小。

### A2: 専用の `exit-verification` step を新設する

pr-create 直前専用の verification step を新設し、conformance approved → exit-verification → adr-gen と繋ぐ。

- **Pros**: 意図が名前で明示される。既存 verification step の文脈汚染がない。
- **Cons**: verification runner / build-fixer 配線 / 収束ループを二重化する（DRY 違反）。新設 step に既存収束（`VERIFICATION_RETRIES_EXHAUSTED`）を再実装する必要がある。
- **Why not**: 既存 verification step の再利用（D2）で収束・配線・runner がそのまま機能し、新設の必要がない。

### A3: state に `codeChangedSinceVerification` フラグを持たせる

fixer 実行時に `true`、verification 実行時に `false` を書き込む state フラグで「コード変更後か」を追跡する。

- **Pros**: 述語が O(1) の単純な lookup になる。
- **Cons**: 書き込み点が fixer step / verification step に分散し、state schema を増やす。「LLM session に state を持たせない」核心原理に反する。timeline からの導出で同等の判定が可能。
- **Why not**: D4 の timeline 導出（endedAt recency）が state 変更なしで同じ判定を提供し、先行 change（conformance-fix-target D4）で決定性が実証済み。

### A4: adr-gen の後（pr-create 直前）に再検証を置く

adr-gen → reverification → pr-create とし、pr-create の直前で最終検証する。

- **Pros**: 「pr-create 直前」の意図が構造で明示される。
- **Cons**: adr-gen はコードを変更しないため adr-gen 後の再検証に意味がない。adr-gen は loop step でないため episode-reset が適用されず、再検証 failed 時の収束を新設する必要がある。
- **Why not**: conformance approved chokepoint（D1）が意味的に正しく、episode-reset の恩恵（D5）も得られる。

## 影響

### Positive

- PR #648 で実証された「code-fixer のコードが機械検証なしで PR に到達する」欠陥が構造的に塞がれる。
- 保証は遷移表の `when` guard で宣言的に表現され、経路ごとの個別対処が不要。
- コード変更がない clean run（fixer 未実行）では再検証が追加されない（zero-overhead）。
- 既存の verification step、build-fixer、episode-reset、収束予算をすべてそのまま再利用する（新規 surface 最小）。
- custom reviewer 構成でも追加変更なしに保証が成立する（D6）。

### Negative

- build-fixer の回復路（再検証 failed → build-fixer → verification → adr-gen）で LLM 再レビューを飛ばす。build-fixer の変更は機械検証のみで通る。本変更のスコープは「機械検証の保証」であり「LLM レビュー網羅」は別 request。
- `verification passed` の出口が `conformanceApprovedLatest` 述語で分岐するため、conformance の前提（code-review approved 後にしか走らない）が崩れると出口判定が誤る。この前提はテストで固定する。

### Known Debt / Deferred

- 再検証 failed → build-fixer → verification → adr-gen の経路で LLM 再レビューを保証したい場合は別 request（明示的スコープ外）。
- impl phase に新しい code-mutator step が追加される場合、`IMPL_CODE_MUTATOR_STEPS` 集合への追加が必要（既存の構造的拡張余地で対応可能）。

## 参照

- Request: `specrunner/changes/post-fixer-reverification/request.md`
- Design: `specrunner/changes/post-fixer-reverification/design.md`
- Spec: `specrunner/changes/post-fixer-reverification/spec.md`
- 実証: PR #648（TC-018 違反が pipeline 内部 gate を素通り、2026-06-12）
- Implementation: `src/core/pipeline/reverification.ts`・`src/core/pipeline/types.ts`
- Related: `specrunner/adr/2026-06-12-conformance-fix-target-routing.md`（conformance chokepoint・endedAt recency の先行確立）
- Related: `specrunner/adr/2026-04-30-verification-cli-resident-step.md`（verification step 設計の基礎）
- Related: `specrunner/adr/2026-04-30-code-review-fixer-agent-design.md`（code-fixer と reviewer chain の設計）
