# ADR: ADR 品質強制の強度設計 — follow-prompt (確率的) vs validator+fixer (決定論的)

- **date**: 2026-05-22
- **slug**: adr-alternatives-followup
- **status**: accepted

## Context

adr-gen agent が `Alternatives Considered` セクションを確率的にしか生成しない問題が発覚した (issue #335)。`adr-gen-system.ts` が MUST と要求しているにもかかわらず、prompt を read-skip して欠落させるケースが再現した。

実害:
- 「なぜ X でなく Y を選んだか」の設計判断の再現性が失われ、ADR の核心価値が機能不全になる
- PR #328 で実際に欠落 → code-fixer が誤って `docs/adr/` に重複 ADR を作成する事故が発生

PR #362 で `followUpPrompt` primitive (intra-step self-fix) が確立された。この primitive を adr-gen に適用するにあたり、「どの程度の強制力で ADR 品質を担保するか」という設計方針を決定する必要があった。

spec (delta spec) に対しては PR #361 で決定論的 dsv (validator + fixer loop) を確立したが、ADR に同等の機構を即座に導入すべきかどうかは自明ではなかった。

## Decisions

### D1: ADR 品質強制の強度は spec より弱くてよい — まず follow-prompt だけで補強する

spec と ADR の役割の非対称性に基づき、強制力のレベルを分けた。

| | spec (delta spec) | ADR |
|---|---|---|
| 役割 | 実装・archive の baseline 規範 | 設計判断の記録 |
| 欠落の影響 | 実装ミス・archive 失敗に直結 | 「判断の再現性」が低下するが機能不全には直結しない |
| 採用した強制力 | 決定論的 validator + fixer loop (dsv) | 確率的補強 (follow-prompt のみ) |

**理由**:
- ADR は「こうでなければならない」という規範ではなく「こう決めた、なぜかを記録する」ドキュメントである。Alternatives が薄くても pipeline の機能には影響しない
- 重い機構 (機械 validator gate + 専用 adr-fixer step) を先に入れると、ADR が薄い場合に pipeline が止まり、副作用が実装の進捗をブロックする
- follow-prompt も prompt である以上、効果は確率的で Alternatives 欠落を 0 にする保証はない。本決定は「決定論的保証」ではなく「低コストな確率的改善」を狙う

**段階導入の方針**: follow-prompt で Alternatives 欠落が実際に再発した場合に限り、機械 validator + 専用 adr-fixer を別 request で追加する。

### D2: `getFollowUpPrompt` 動的 method でゲート — 静的 field では不十分

`AgentStep` に `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` optional method を追加し、executor が静的 `followUpPrompt` より優先して解決する。

```typescript
// executor.ts
followUpPrompt: step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt,
```

**問題**: `AdrGenStep` は `adr: false` の no-op パスでも step 自体が実行され agent turn が走る。静的 `followUpPrompt` を設定すると `adr: false` でも follow-prompt が発火し、「Alternatives を追記せよ」に反応して ADR を誤生成するリスクがある。

**採用案**: `getFollowUpPrompt` method で `adr` flag を参照して動的に解決する。

```typescript
// adr-gen.ts
getFollowUpPrompt(_state: JobState, deps: StepDeps): string | undefined {
  if (!deps.request.adr) return undefined;
  return ADR_FOLLOWUP_PROMPT;
}
```

- `adr: false` → `undefined` → follow 不発火（no-op パスで ADR 誤生成を防止）
- `adr: true` → prompt 返却 → shouldRunFollowUp が truthy で発火

**理由**:
- `getMaxTurns` と同型のパターン（既存プラクティス踏襲）
- `shouldRunFollowUp` に ADR 固有ロジックを入れずに済む（shared 層の cohesion 維持）
- adapter の `AgentRunContext` は `followUpPrompt?: string` のまま変更不要（後方互換）

### D3: follow-prompt は「修正」を指示し「判定」を指示しない

follow-prompt に「Alternatives Considered が存在するか判定せよ」ではなく「読み直して不足があれば追記せよ」という action 指示を与える。

**理由**: 判定ステップを入れると agent が「あります」と誤判定して通過する確認バイアスが生じる (feedback_verify_dont_trust)。action 直指示によりバイアスを回避する。

これは design step の follow-prompt と同方針。

### D4: 案 A (JSON 構造化出力) は恒久的に不採用

issue #335 で提案された「JSON 構造化出力で Alternatives を必須フィールドとして tool が組み立てる」案は採用しない。

**理由**: 構造化出力の対応品質は adapter 間で非対称 (Claude 強 / Codex 弱)。adapter-neutral であることが specrunner の設計原則であり、特定 adapter に有利な実装は導入しない。この判断は将来も変わらない。

## Alternatives Considered

### Alternative 1: 即時に機械 validator + 専用 adr-fixer を導入する (= spec と同等の決定論的 gate)

spec の dsv と同型の機構を ADR にも即座に適用する。

**Pros**:
- Alternatives 欠落を決定論的に検出・強制できる
- 「確率的改善」ではなく「保証」になる

**Cons**:
- ADR の欠落は pipeline の機能不全に直結しないため、ブロッキング gate は過剰
- 専用 adr-fixer step の新設が必要（step 名ベースの fixer 判定 `pipeline.ts:179` により adr-gen の兼務は不可）
- 実績のない機構を先に入れると、問題が発生した際の原因特定が困難になる

**Why not**: ADR は設計記録であり spec 規範ではない。強制力は役割に応じて選ぶ（段階導入原則）。

### Alternative 2: prompt 規律の強化 (「Alternatives は MUST」をさらに強調)

`adr-gen-system.ts` の指示をより強く書き直す。

**Pros**:
- 実装コストゼロ

**Cons**:
- LLM uncertainty principle により確率的 skip は継続する。対症療法で再発する

**Why not**: 「prompt を追加するだけ」の対処は同一の根本原因に対して機能しないと判明済み。

### Alternative 3: 案 A — JSON 構造化出力で Alternatives を必須フィールドに

`Alternatives Considered` を必須フィールドとして tool schema で定義し、LLM に構造化出力を強制する。

**Pros**:
- Alternatives の存在を構造的に保証できる

**Cons**:
- adapter 間の対応品質が非対称 (Claude 強 / Codex 弱)
- adapter-neutral という設計原則に反する
- セクション内容の semantic 妥当性は依然として保証できない（フィールドが存在するだけで中身が空でも通過する）

**Why not**: adapter-neutral でないため恒久的に不採用。

## Consequences

- `AdrGenStep` に `getFollowUpPrompt` method が追加され、`adr: true` 限定で Alternatives self-fix が発火する
- `AgentStep` interface に `getFollowUpPrompt?` method が追加される（既存 step への影響はない、optional）
- follow-prompt は best-effort であり、Alternatives の欠落を 0 にする保証はない。follow-prompt 単独で不十分と判明した場合は validator 路線（専用 `src/core/adr/rules/` + 専用 adr-fixer step）に移行する
- 将来 validator 路線に進む際の確定事項: ADR validator は `src/core/adr/rules/` に新設（dsv の delta spec 固有型を流用すると cohesion が崩れる）、専用 adr-fixer step（adr-gen 兼務は `pipeline.ts:179` のステップ名ベース fixer 判定との矛盾）

## 関連 ADR

- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — `followUpPrompt` primitive の確立。本 ADR はその 2nd consumer (adr-gen への適用) と適用ポリシーの決定
- [2026-05-18-validation-rule-interface](./2026-05-18-validation-rule-interface.md) — dsv の決定論的 validator 設計。本 ADR で「ADR は dsv 同型の決定論的 gate を今は適用しない」と明示的に区別
