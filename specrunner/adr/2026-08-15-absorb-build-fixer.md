# ADR-20260815: build-fixer の廃止 — verification 失敗は implementer の継続 session で直す

> 本 ADR は `absorb-build-fixer` request の設計判断を記録する。`2026-04-30-implementer-build-fixer-separation.md` が確立した build-fixer 独立 Agent 方針を破棄し、verification 失敗の修正責務を実装者本人（implementer）へ集約する。

## ステータス

accepted

supersedes: `specrunner/adr/2026-04-30-implementer-build-fixer-separation.md`

## コンテキスト

pipeline の verification 失敗は長らく独立 step `build-fixer` が担っていた。build-fixer は fresh session で起動し、「機械的修正のみ・設計判断禁止・verification-result.md に記載された失敗出力の範囲のみ」という制約下で作業する設計だった（ADR-20260430-implementer-build-fixer-separation）。

この設計には 2 つの構造的損失がある：

1. **文脈の損失** — verification 失敗の大半は直前の implementer session が書いたコードが原因である。build-fixer は fresh session のため「なぜその構造にしたか」「どこまで書いたか」を知らず、文脈を再構築しながら制約付きで直すことになる。
2. **制約による修正能力の低下** — 失敗の原因が設計判断に触れる場合、build-fixer は制約上それを直せず、歪んだ最小修正か escalation を余儀なくされる。「機械的修正のみ」は build-fixer が設計を壊さないための防御だったが、直すのが実装者本人なら設計判断は本人の責務の内であり、防御が問題解決能力の制限にしかならない。

加えて、`loopFixerPairs` 機構と `IMPL_CODE_MUTATOR_STEPS` が build-fixer を中心に設計されているため、build-fixer に halt した旧 job の resume 互換も考慮対象になる。

### 前提コードの確定事実

- 遷移表の `loopFixerPairs[VERIFICATION] = BUILD_FIXER` が loop 予算・exhaustion・fresh-budget リセットの全計算に使われる（`pipeline.ts:522` — `newEpisode = currentStep !== pairedFixer`）
- `step-context-builder.ts` の `resumeSessionId` 算出は `FIXER_STEP_NAMES` の判定で分岐する
- `resolve-step.ts` の `resumePoint` 経路は allowed 検証をせず step 名をそのまま返す（build-fixer 復帰点が descriptor に無くなると "Step not found"）
- `IMPL_CODE_MUTATOR_STEPS = [IMPLEMENTER, BUILD_FIXER, CODE_FIXER]` が `codeChangedSinceLastVerification` 述語（ADR-20260612-post-fixer-reverification）で使われる

## 決定

### D1: `loopFixerPairs[VERIFICATION]` を `IMPLEMENTER` に変更し、verification 失敗遷移を実装者本人へ

`VERIFICATION failed → BUILD_FIXER` を `VERIFICATION failed → IMPLEMENTER`（再入）に置換する。`loopFixerPairs[VERIFICATION]` を `STEP_NAMES.IMPLEMENTER` に変更し、STANDARD / FAST 両 descriptor に適用する。

**Rationale**: `loopFixerPairs` の値を build-fixer から implementer へ変えるだけで、ループ予算・exhaustion（`VERIFICATION_RETRIES_EXHAUSTED`）・fresh-budget リセット（conformance 再検証時）の全機構が**無改造で維持**される。`newEpisode = currentStep !== pairedFixer` のロジックは paired fixer の役割(role)を検証せず、純粋な集合演算だけを使うため、implementer（role: creator）を値に置いても機構上安全。`IMPLEMENTER success → VERIFICATION` の既存経路が回復後の再検証に自動的に機能する。

**副作用への対処**: `Object.values(loopFixerPairs)` に implementer が入ることで、pipeline の "Approved verdict overturned by fixer budget" ブロック（`fixerNamesForReroute`）も implementer を対象に含む。STANDARD には `SPEC_REVIEW approved → IMPLEMENTER（when: isTestGenExempt）` という creator 経路が実在し、この経路での implementer は fixer ではない。誤 intercept を防ぐため「遷移元が paired reviewer と一致する場合のみ発火」する `currentStep === exhaustedReviewer` guard を追加する。

**却下案**:
- *verification を paired fixer 無しの自己ループにする*: paired fixer が無くなると `newEpisode` リセットが発火せず、conformance→verification 再検証が即 exhaustion で打ち切られる（ADR-20260612 の fresh-budget 契約を破壊）。却下。
- *loopFixerPairs 用の独立カウンタを新設する*: 既存機構の再発明。却下。

### D2: 回復再入時の bite-evidence バイパス（`verificationFailedLast` gate）

STANDARD の実装完了経路に `{ IMPLEMENTER, success, VERIFICATION, when: verificationFailedLast }` を `when: isTestGenExempt` 行の直後・`→ BITE_EVIDENCE` 行の前に追加する。`verificationFailedLast(state)` は「最新 verification run の verdict が `failed`」を返す純関数。

**Rationale**: build-fixer の回復ループ（`verification(fail) → build-fixer → verification`）では build-fixer は verification の paired fixer であり `newEpisode=false`（リセット無し）で予算が積み上がっていた。implementer 経由でも同じ密ループにするには、回復再入の implementer 完了を **bite-evidence を挟まず** verification に直帰させる必要がある。bite-evidence は `loopIntermediateSteps` 非該当のため `newEpisode=true` となり、挟むと**回復サイクル毎に verification 予算がリセットされ exhaustion が永久に発火しない（無限ループ）**。

`verificationFailedLast` は回復中のみ真で、初回実装（verification 未実行）・conformance 再入（直近 verification は passed）では偽なので、それらは従来通り bite-evidence を通す。

**off-by-one の許容**: implementer は creator 実行時も `enterFixerStep` でカウンタを 1 進める。STANDARD 非 exempt 初回は `bite-evidence → verification` の `newEpisode=true` リセットがこれを打ち消す。exempt（chore 相当）/ FAST は bite-evidence が無いため +1 が残り、回復試行が実質 1 回少なくなるが、**歯（RETRIES_EXHAUSTED）は発火し続ける**（回復不能検知の目的は達成）。exact 回数は受け入れ基準に含まれないため許容。

**却下案**:
- *bite-evidence を `loopIntermediateSteps` に追加する*: spurious reset は消えるが、回復ループ毎に bite-evidence（CLI gate）が再実行され `failed → escalate` という新しい escalation 経路とコストが回復ループに入る。build-fixer の密ループ意味論から乖離する。却下。

### D3: 再入は直前 implementer session の継続、制約を課さない

verification 失敗による implementer 再入を**直前 implementer session の継続（resume）**として実行し、失敗した command と出力を message で渡す。前回 sessionId が null/不在なら fresh session に fallback（エラーにしない）。

再入指示は「verification の失敗を解消する。canon（test-cases.md / spec）と整合するよう実装・テストを直す」のみ。**機械的修正限定・設計判断禁止・範囲限定の制約は課さない**。守るべき境界（canon を勝手に変えない・scope 外を触らない）は既存の write-scope 機構（GUARDED_WRITE_STEPS に implementer は既存）が担う。

実装: `step-context-builder.ts` の `resumeSessionId` 算出を拡張し、`step.name === STEP_NAMES.IMPLEMENTER && verificationFailedLast(state)` のとき `getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) ?? undefined` を渡す（null-合体で fresh fallback、build-fixer の継続機構と同パターン）。

**Rationale**: 失敗の大半は直前の実装の続きであり、継続なら「自分が直前に書いたコードと判断」を保持したまま直せる。制約撤去は権威解体の一環：direct すのが実装者本人なら設計判断は本人の責務内。

**却下案**:
- *AgentStep に `resumeSessionId?()` フックを新設する*: より疎結合だが Step interface を拡張する。`step-context-builder` には既に `FIXER_STEP_NAMES` による step 固有分岐が同一箇所にあり、そこへ implementer 条件を足すのが最小差分。却下。
- *conformance→implementer も継続にする*: `verificationFailedLast` gate が false になる（直近 verification は passed）ため、conformance 再入は従来通り fresh のまま。スコープ外。

### D4: build-fixer 廃止と後方互換 — legacy alias `"build-fixer" → IMPLEMENTER`

step 定義（`build-fixer.ts`）・prompt（`build-fixer-system.ts`）・`AGENT_STEP_NAMES`/`STEP_NAMES.BUILD_FIXER`・registry の step 登録と role・`FIXER_STEP_NAMES`/`IMPL_CODE_MUTATOR_STEPS`/`GUARDED_WRITE_STEPS` の build-fixer エントリ・doctor の必須 agent・managed.ts / config-effective.ts の登録を削除する。

後方互換のため `resolve-step.ts` に `LEGACY_STEP_ALIASES = { "build-fixer": STEP_NAMES.IMPLEMENTER }` を追加し、`from` と `resumePoint.step` に alias を適用する（`from` 経路では `allowed.has()` 検証より**前**に適用し、alias 後の名前を検証対象とする）。

`StepName = string` / passthrough により、build-fixer 実行歴は state の projection/fold で保持・無視される（コード変更不要）。

**Rationale**: `resumePoint` 経路は allowed 検証をしないため、alias 無しでは build-fixer 復帰点が "Step not found" になる。alias は「過去 step 名を無視し後継へ流す」互換を最小の写像で成立させる。`mapMemberToCoordinator` と同じ場所・同じパターン。

**既知の限界（許容）**: `IMPL_CODE_MUTATOR_STEPS` から build-fixer を除くため、「build-fixer が最後のコード変更者」の legacy state では `codeChangedSinceLastVerification` が当該変更を検出しない。このシナリオは実運用上発生困難（build-fixer は verification 成功後にのみ次へ進み、halt した job は alias により implementer が代わりに実行されて mutator 履歴を上書きする）。

## 却下した代替案（全体方針）

### 案 A: build-fixer を維持しつつ session 継続のみ加える

build-fixer step を残し、fresh → implementer session の継続に変更するだけに留める。

- **Pros**: 変更範囲が小さい。build-fixer の独立 step としての責務境界が維持される。
- **Cons**: 「機械的修正のみ」制約を外せない（build-fixer の system prompt が制約の主体）。Agent identity が分かれているため、implementer の session context を build-fixer の session 継続として使う技術的根拠が弱い。ADR-20260430 の「system prompt と role が矛盾する」パターンに逆戻りする。
- **Why not**: 制約撤去が設計の根幹（D3）であり、build-fixer という別 Agent の system prompt を使い続ける限り制約は残る。

### 案 B: code-fixer と同様に build-fixer を fixer chain の一員として残す

code-fixer が reviewer 判断に基づく修正を担うように、build-fixer を「機械検証失敗への自動修正」専担として残す。

- **Pros**: 責務分離の哲学を維持。code-fixer の「reviewer 信号→修正」と build-fixer の「機械信号→修正」の対称性が保たれる。
- **Cons**: D3 の問題（文脈損失・制約による能力低下）を解消しない。build-fixer が設計判断に触れる失敗を解決できない構造は変わらない。
- **Why not**: 対称性は設計上の美観であり、実運用上の損失（文脈の再構築コスト・誤修正リスク）を正当化しない。

## 影響

### Positive

- verification 失敗の修正が「自分が書いたコードを自分で直す」になり、文脈再構築コストとトークン消費が削減される
- 設計判断に触れる失敗を制約なしに直せるようになり、歪んだ最小修正や不必要な escalation が減る
- `loopFixerPairs` 機構の再利用により、exhaustion・fresh-budget リセット・conformance 再検証保証（ADR-20260612）が無改造で維持される
- Agent 数が 1 つ減り（specrunner init の同期コスト・registry/config schema が縮小）、`specrunner-build-fixer` の管理が不要になる
- 既存 job state は無変換で互換（build-fixer 実行歴は保持・無視、resume は alias で implementer へ）

### Negative

- chore / FAST 経路で回復試行が実質 1 回少なくなる（D2 の off-by-one）
- build-fixer 実行歴を含む legacy state で `codeChangedSinceLastVerification` が当該変更を検出しない（D4 の既知限界）
- implementer が verification 失敗の修正も担うため、1 implementer session でより広い変更が行われる可能性がある（write-scope 機構で境界は維持）

### Known Debt / Deferred

- code-fixer の統合（context 使用量の実測後に別途判断）
- managed runtime での session 継続方式（local runtime の継続のみが本 ADR の対象）

## 参照

- Request: `specrunner/changes/absorb-build-fixer/request.md`
- Design: `specrunner/changes/absorb-build-fixer/design.md`
- Spec: `specrunner/changes/absorb-build-fixer/spec.md`
- Implementation: `src/core/pipeline/reverification.ts`・`src/core/pipeline/types.ts`・`src/core/step/implementer.ts`・`src/core/step/step-context-builder.ts`・`src/core/resume/resolve-step.ts`
- Supersedes: `specrunner/adr/2026-04-30-implementer-build-fixer-separation.md`（build-fixer 独立 Agent 方針）
- Related: `specrunner/adr/2026-06-12-post-fixer-reverification.md`（`loopFixerPairs`・`IMPL_CODE_MUTATOR_STEPS`・fresh-budget 機構の根拠）
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（descriptor / loopFixerPairs 構造）
