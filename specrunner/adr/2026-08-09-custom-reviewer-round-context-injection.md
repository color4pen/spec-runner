# custom reviewer への周回 context 注入と operator 裁定永続化モデル

## Status

Accepted (2026-08-09)

## Context

custom reviewer は毎周回、独立した agent session として起動し前周の記憶を持たない。
結果として (a) 修正済み指摘の stale な再提出、(b) 裁定済み事項の再発見による
escalation の蒸し返し、が起きていた。

同種の問題は既存 2 step で解消済みだった:

- **spec-review**: `prepareRoundContext` → `prior-round-context.ts` で前周 findings +
  spec-fixer commit 由来の変更 file を注入する
- **adr-gen**: `prepareRoundContext` → `post-fix-context.ts` で code-fixer commit 由来の
  変更事実を注入する

`buildStepContext`（`src/core/step/step-context-builder.ts`）は step の `prepareRoundContext`
を best-effort 実行し、戻り値の `Partial<DynamicContext>` を `dynamicContext` に
spread-merge する共通 seam として確立されていた。custom reviewer だけがこの seam を
実装していなかった。

また `job resume --prompt <text>` による operator 裁定は one-shot・非永続だった
（`resume.ts` → `runner.ts` → `pipeline.ts` の `depsWithoutResume` で strip。state への
書き込み経路なし）。一方、issue-comment 由来の構造化裁定 `DecisionRecord[]` は
verdict 層の再エスカレーション抑制にのみ使われており、reviewer の prompt には
注入されていなかった。

## Decision

### D1: step-specific な context 注入は `prepareRoundContext` seam で行う（adapter bundle には足さない）

custom reviewer step object に `prepareRoundContext(state, cwd, runtimeStrategy)` を実装し、
戻り値の `Partial<DynamicContext>` を seam が既存 `dynamicContext` に merge する。
spec-review / adr-gen と同型の構成を採用する。

**Rationale**: findings・裁定は step 固有の意味（再指摘プロトコル / 反論プロトコル）を
持ち、全 step 共通の adapter bundle（`agent-runner.ts` の artifact 注入）に混ぜると
受け手の規律が書けない。seam は fan-out member にも到達し、best-effort degrade を
保証している。今後の step も step-specific な context を渡す場合はこの seam を使うことを
本決定が確立する。

**Alternatives considered**:
- adapter 層の touched-files / artifact bundle に相乗り → 却下（全 step に漏れる、受け手規律が書けない）
- `buildMessage` 内で直接 state を読む → 却下（`buildMessage` は pure 契約、I/O を持てない）

### D2: 導出と block 構築は新 step-local module `custom-reviewer-round-context.ts` に置く

`prior-round-context.ts` / `post-fix-context.ts` の「pure block builder + async derivation
（port 背後 I/O）」構成を踏襲し、以下を export する:

- `deriveCustomReviewerPriorRound(...)` — I/O あり、失敗時 null
- `buildCustomReviewerPriorRoundBlock(ctx)` — pure
- `deriveOperatorAdjudicationContext(state)` — pure・no I/O
- `buildOperatorAdjudicationBlock(ctx)` — pure

**Rationale**: block 構築とデグレ分岐を独立にテストできる。step 非依存の導出関数にすることで
将来 built-in code-review への流用も可能な形にする。`prior-round-context.ts` への相乗りは
spec-fixer vs code-fixer の種別差・再指摘文言の差があるため却下。

### D3: 前周変更 file は「前周 round 以降の code-fixer commit」を machine-derived で union する

reviewer の前周 round `endedAt`（`state.steps[reviewerName]` 末尾 run の `endedAt`）より後の
code-fixer StepRun の commitOid を対象に `runtimeStrategy.listCommitChangedFiles` 結果を union する。
`post-fix-context.ts` の既存 export `resolveCodeFixerRounds` を再利用する。
1 件でも取得失敗なら null（all-or-nothing degrade）。

**Rationale**: code-fixer は 1 review 収束ループ内で複数回走り得るため「末尾 fixer 1 件のみ」
では取りこぼす。commit diff 由来なので agent 自己申告に依存しない。部分注入は
「変更 file が揃っているように見えるが実は欠けている」誤認を招くため all-or-nothing とする。

### D4: operator 裁定の永続化は新レコード型 `OperatorAdjudication` とする

JobState に top-level field `operatorAdjudications?: OperatorAdjudication[]` を追加する。

```typescript
interface OperatorAdjudication {
  text: string;       // operator 自由記述
  step: string;       // 対象 step 名
  recordedAt: string; // ISO 8601
}
```

既存の `decisions: DecisionRecord[]`（issue-comment 由来）とは独立したフィールドとして
append-only で管理する。`appendOperatorAdjudication(state, record)` を pure helper として
`schema/operations.ts` に置く（`appendSynthesizedCommit` と同型）。

**Rationale**: `DecisionRecord` は `findingKey`（finding への参照）と finding snapshot が
必須であり、自由記述の operator 裁定は構造的に適合しない。両者を別フィールドとすることで
「issue-comment 由来の構造化決定」と「operator 自由記述の裁定」の意味的差異を型として
表明できる。top-level field は state.json で自動 round-trip する（`stateToStateJson` が spread）。

**Alternatives considered**:
- 既存 `DecisionRecord` への相乗り → 却下（`findingKey` / finding snapshot が必須で構造不適合）
- event-journal threading → 却下（`decisions` / `reviewerStatuses` / `touchedFiles` と
  同型の top-level field で同等の永続性を得られる）

### D5: 永続化点は `resume.prepare()` — `--prompt` があるときのみ append する

`resume.prepare()` の「running」遷移後に `this.options.prompt` が非空なら
`appendOperatorAdjudication` を適用し、既存 persist 経路に載せて書き出す。
既存の one-shot deps 注入（`pipeline.ts` の `<resume-context>`）は変更しない。

**Rationale**: `resume` が prompt の起点であり `startStep` の解決責務を持つ唯一の箇所。
ここで append することで「どの step に対する裁定か」を単一箇所で確定できる。
one-shot deps 注入と永続化の責務が交差しないため pipeline/runner 側の strip 設計を維持できる。

**Alternatives considered**:
- `pipeline.ts` / `runner.ts` で永続化 → 却下（strip 責務と交差し、`startStep` 解決文脈も持たない）
- `resumePrompt` の one-shot 廃止（全 unit への再注入）→ 却下（pipeline 先頭で一元化した
  注入所有権設計に逆行し、どの step が裁定を「消費」したか追えなくなる。
  永続化 + 明示 block 注入で同じ目的をより監査可能に達成できる）

### D6: DynamicContext に custom reviewer 専用の 2 field を追加する（in-memory only）

- `customReviewerPriorRound?`: 前周 findings projection + 変更 file
- `operatorAdjudicationContext?`: operator 裁定 + decisions 両 ledger の projection

いずれも `prepareRoundContext` が毎 run 生成し、state/journal へは非永続。

**Rationale**: 既存の `priorRoundContext`（spec-review 専用・spec-fixer 由来）を再利用すると
field の意味と受け手が嘘になる。専用 field により各 field の意味と受け手が honest に保たれる。
`DynamicContext` は元々非永続なので要件の「in-memory only」を自動的に満たす。

**Alternatives considered**:
- `priorRoundContext` の再利用 → 却下（spec-fixer / code-fixer の種別差、文言差、意味の overload）

### D7: 裁定 block は `operatorAdjudications` + `decisions` 両 ledger の全件を含める（reviewer 単位の絞り込みなし）

`deriveOperatorAdjudicationContext(state)` は両 ledger の全 entry を projection する。
両方空なら null（block なし）。各 entry に step ラベルを付与して出所を判別可能にする。

**Rationale**: operator 裁定は change 単位の事実であり特定 reviewer のみに向けられるとは
限らない。cross-step の裁定可視性が本機構の目的そのもの。step ラベルで出所は判別可能であり、
「余分な context」に留まる害は許容できる。ノイズが顕在化した場合は別 request で
reviewer 単位フィルタを導入する。

**Alternatives considered**:
- `d.step === reviewerName` での絞り込み → 却下（architect 評価済み。裁定は change 単位の事実）

### D8: 導出失敗は block 全体を省略（all-or-nothing degrade、throw しない）

前周 block を省略する条件: `iteration < 2` / 前周 findings 欠落 /
`runtimeStrategy.listCommitChangedFiles` 不在 / いずれかの commit diff が失敗 or throw。
裁定 block を省略する条件: `operatorAdjudications` と `decisions` が共に空。
seam の best-effort try/catch により、いかなる失敗でも throw しない。

**Rationale**: 要件「導出失敗は block 全体を省略・部分注入しない・throw しない」。
空 findings（前周全 approve）は「欠落」ではないため変更 file が導出できれば注入する。

## Alternatives Considered

### Alternative 1: findings・裁定を adapter の共通 artifact bundle に追加する（D1 代替）

- **Pros**: 追加配線ゼロ。adapter が一括注入するため step が `prepareRoundContext` を実装しなくて済む
- **Cons**: findings・裁定は step 固有の意味（再指摘プロトコル / 反論プロトコル）を持ち、
  全 step 共通 bundle に混ぜると受け手の規律が書けない。
  bundle は file 一覧のヒントとして設計されており、findings を載せると責務が拡散する
- **Why not**: 却下。`prepareRoundContext` seam が既にこの目的で確立されており、
  spec-review / adr-gen の先例が同じ理由で bundle を使っていない

### Alternative 2: verdict 層の decisions 抑制（decision-ledger.ts）の拡張のみで対応する

- **Pros**: reviewer 側を変更せず、filter を一箇所（verdict 層）に集約できる
- **Cons**: 抑制は報告後の filter であり、reviewer が毎周同じ調査をやり直すコストと
  stale 指摘の混入は防げない。reviewer は裁定済み finding を再発見・再報告し、
  verdict 層で初めて filter される — 調査コストの無駄は残る
- **Why not**: 却下（request.md の architect 評価済み）。prompt 注入が根本側であり、
  filter は対症療法に留まる

### Alternative 3: 既存 `DecisionRecord` に `OperatorAdjudication` を相乗りさせる（D4 代替）

- **Pros**: 新フィールドを JobState に追加せずに済む。既存の ledger 管理コードを再利用できる
- **Cons**: `DecisionRecord` は `findingKey`（finding への参照）と finding snapshot が必須フィールドであり、
  自由記述の operator 裁定は構造的に適合しない。adapter するには null/optional を多用して
  型の意味を壊すことになる
- **Why not**: 却下（design.md D4 / request.md architect 評価済み）。構造不適合

### Alternative 4: `resumePrompt` の one-shot 注入を廃止し全 unit に再注入する（D5 代替）

- **Pros**: 全 unit が裁定 text を受け取れるため別途永続化が不要になる
- **Cons**: pipeline 先頭で注入所有権を一元化した現行設計（`pipeline.ts` の `depsWithoutResume` strip）に逆行する。
  どの step が裁定を「消費」したか追えなくなり、監査可能性が失われる
- **Why not**: 却下（design.md D5 / request.md architect 評価済み）。
  永続化 + 明示 block 注入のほうが監査可能性が高い

### Alternative 5: `pipeline.ts` / `runner.ts` で operator 裁定を永続化する（D5 代替）

- **Pros**: prompt の flow と同じ場所で永続化を処理できる
- **Cons**: `pipeline.ts` は `resumePrompt` を `depsWithoutResume` で strip する責務を持ち、
  そこに永続化を加えると strip 責務と交差する。また `startStep` の解決文脈を持たないため
  「どの step に対する裁定か」を確定できない
- **Why not**: 却下。`resume.prepare()` が prompt と `startStep` 両方の起点であり単一箇所として自然

### Alternative 6: 末尾 code-fixer commit 1 件のみを参照する（D3 代替）

spec-review の先例（末尾 spec-fixer OID 1 件）に倣い、末尾 code-fixer の commit のみを
changedFiles として注入する。

- **Pros**: spec-review との対称性を保てる。実装が単純になる
- **Cons**: code-fixer は 1 review 収束ループ内で複数回走り得る。
  末尾 1 件だけでは前周 reviewer 実行後から今回までの全変更を取りこぼす
- **Why not**: 却下（design.md D3）。spec-review は spec-fixer が基本 1 回のため末尾 1 件で足りるが、
  code-fixer は複数回走り得るため union が必要

## Consequences

### Positive

- custom reviewer の iteration ≥ 2 で「前周自身の findings」「code-fixer 変更 file（machine-derived）」
  「operator 裁定（永続化 + issue-comment 由来）」が prompt に注入され、stale 再指摘と
  escalation の蒸し返しが構造的に抑制される
- `prepareRoundContext` seam が 3 step（spec-review / adr-gen / custom reviewer）で
  実装され、step-specific context 注入の確立したパターンとなる
- `OperatorAdjudication` の永続化により operator の裁定が state に残り、後続 round が
  裁定の存在を観測可能になる（one-shot の揮発性を補完）
- 導出失敗は block 省略・続行であり pipeline の安定性に影響しない

### Negative / Trade-offs

- operator 自由記述が XML block として reviewer prompt に注入されるため、XML 特殊文字の
  エスケープが必須（実装済み: `&lt;` / `&gt;` / `&amp;`）
- decisions ledger の全件注入により、他 reviewer 宛の裁定が混ざる可能性がある
  （step ラベルで出所判別可能。許容範囲として受容）
- `endedAt` ベースの「前周以降」判定は pipeline の sequential 実行順に依存する
  （pipeline がこれを保証する設計であり許容）

### Known Gaps / Future Work

- built-in code-review step への同機構の適用は別 request 候補
  （`custom-reviewer-round-context.ts` の導出関数を step 非依存の形で設計済み）
- decisions 絞り込み（reviewer 名でのフィルタ）はノイズが顕在化した場合に別 request で導入

## References

- Request: `specrunner/changes/custom-reviewer-round-context/request.md`
- Design: `specrunner/changes/custom-reviewer-round-context/design.md`
- Spec: `specrunner/changes/custom-reviewer-round-context/spec.md`
- Related（seam の先行実装）: `specrunner/adr/2026-04-29-spec-review-pipeline.md`
- Related（post-fix-context の先例）: `specrunner/adr/2026-04-30-code-review-fixer-agent-design.md`
