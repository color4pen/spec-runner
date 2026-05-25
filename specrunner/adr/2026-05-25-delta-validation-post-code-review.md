# ADR-20260525: baseline 編集違反を pipeline 内で構造的に検出・自動修正する

**Date**: 2026-05-25
**Status**: accepted

## Context

agent が `specrunner/specs/<capability>/spec.md`（= authority / baseline spec）を直接編集する事故が累積しており、同型 issue が 5 件（#383, #385, #299, #316, #263）open となった。`memory/feedback_avoid_patchwork` が定める「3 件で構造変更を疑う」を超過しており、構造的な根絶策が必要な状況である。

既存の防衛策は 4 層：

| タイミング | 対策 | 限界 |
|---|---|---|
| request 起票時 | `request review` agent が baseline path 直接記述を指摘 | LLM 判断に依存、漏れが発生 |
| session 開始時 | `rules.ts` の baseline 編集禁止 rule を全 agent に注入 | agent が誤判断すれば違反する |
| commit 直前 | `commit-push.ts` の inline halt | 違反 = pipeline 即死 = 手動介入必須 |
| `finish` spec-merge | integrity check + escalation halt | 違反の根本（直接編集）に対処しない |

最後の砦である commit-push の inline halt には **agent に self-fix の機会を与えない**という構造的欠陥がある。違反を検出しても修正 loop がないため、pipeline を halt させるだけで人手に委ねる結果になっていた。

## Decision

既存の `delta-spec-validation` + `delta-spec-fixer` loop 構造を再利用し、3 つの変更を連携させて解決する：

1. **新 rule 追加**: `no-authority-spec-direct-edit` を `delta-spec-validation` の rules に登録
2. **2 回目 validation**: `code-review approved` 後に `delta-spec-validation` を再実行する context-aware transition を追加
3. **halt 降格**: `commit-push.ts` の inline halt を warning ログに変え、対処を validation step に委譲

## Design Decisions

### D1: `changedFiles` injection（git diff 結果の rule への注入）

**選択**: `DeltaSpecRuleInput` に `changedFiles?: string[]` を追加し、`DeltaSpecValidationStep.run()` が git diff を事前実行して結果を注入する（option b）。

**理由**:
- rule 自体は `input.changedFiles` を filter する純粋関数になり、副作用が入らない
- `changedFiles` が undefined の場合は rule をスキップ（backward compatible）
- base branch は `deps.request.baseBranch` から取得（`ParsedRequest` の既存フィールド）

**却下案**:
- option (a) `gitDiffFiles: () => Promise<string[]>` を `DeltaSpecRuleInput` に追加 → rule 内に副作用が入り、dependency injection パターンと不整合。テストで stub が困難になる

### D2: `Transition.when` predicate（context-aware transition）

**選択**: `Transition` interface に optional `when?: (state: JobState) => boolean` を追加し、pipeline の transition lookup に 1 行の predicate 評価を追加する。

```typescript
// Before
const transition = this.transitions.find(
  (t) => t.step === currentStep && t.on === outcome,
);

// After
const transition = this.transitions.find(
  (t) => t.step === currentStep && t.on === outcome && (!t.when || t.when(state)),
);
```

- `when` なし → 常にマッチ（既存 transition は変更不要）
- `when` あり → predicate が true のみマッチ
- 配列順序: conditional transition を fallback の前に配置（`Array.find` の first-match 特性を利用）

**却下案**:
- wrapper step 追加（`delta-spec-validation-post-review` 等の別 step 名を新設）→ prompt / STEP_NAMES / fixer pair の重複が発生し、認知負荷が増加する。baseline 違反と delta format 違反は「spec の path / 構造の正しさ」という同一軸の問題であり、同じ validator / fixer で扱うべき
- pipeline engine に別の loop primitive を追加 → `Transition.when` の 1 行追加で十分な問題に対して過剰な機構変更

### D3: STANDARD_TRANSITIONS の変更（2 回目 validation の wire-up）

**変更内容**:

| Before | After |
|--------|-------|
| `code-review approved → adr-gen` | `code-review approved → delta-spec-validation` |
| （なし） | `delta-spec-validation approved → adr-gen`（when: code-review に attempt あり） |
| `delta-spec-validation approved → spec-review` | そのまま残る（fallback） |

when predicate: `(state) => (state.steps?.["code-review"]?.length ?? 0) > 0`

配列順序が重要（conditional を fallback の前に配置）：

```typescript
// 2nd phase — must come BEFORE fallback
{ step: "delta-spec-validation", on: "approved", to: "adr-gen", when: hasCodeReviewRun }
// 1st phase fallback — no when
{ step: "delta-spec-validation", on: "approved", to: "spec-review" }
```

**1 回目（design 直後）**: `delta-spec-validation approved → spec-review`（既存挙動維持）
**2 回目（code-review 後）**: `delta-spec-validation approved → adr-gen`（新規）

### D4: delta-spec-fixer の既存 loop をそのまま 2 回目で再利用

`STANDARD_LOOP_FIXER_PAIRS`（`delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation`）は 2 回目フェーズでも同一 mechanism で動作する。loop iteration budget は通算で管理される。追加の fixer pair 登録は不要。

### D5: commit-push inline halt → warning 降格

**選択**: `findAuthoritySpecViolations()` の検出ロジックは残し、違反検出時は `stderrWrite("Warning: ...")` に変更してパイプラインを続行させる。

- **staged-changes path**（line 92-98）: `throw` → `stderrWrite` + commit 続行
- **HEAD-diff path**（line 74-78）: `throw` → `stderrWrite` + push 続行

**理由**:
- commit-push の inline halt は「検出するが修正機会を与えない」設計であり、pipeline halt = 手動介入の悪循環を生んでいた
- 2 回目 `delta-spec-validation` + `delta-spec-fixer` に責務を集約することで、agent が self-fix できる構造になる
- warning ログを残すことで early detection のヒントは保持できる
- `finish` Phase 1 spec-merge の integrity check は最終 safety net として残るため、warning 降格でも多層防御は維持される

**却下案**:
- inline halt を完全削除（検出ロジックごと）→ warning ログが失われ、early detection の可観測性が低下する

## Alternatives Considered

### Alternative 1: wrapper step を追加する（`delta-spec-validation-post-review`）

code-review 後専用の validation step を新規 step 名で追加し、`code-review approved → delta-spec-validation-post-review → adr-gen` とする案。

- **Pros**: pipeline の flow がステップ名で自己説明的になる。code-review 後の validation が独立した step として状態ファイルに現れる
- **Cons**: `delta-spec-validation-post-review` のために wrapper / STEP_NAMES エントリ / fixer pair / prompt が重複する。baseline 違反と delta format 違反は「spec の path / 構造の正しさ」という同一軸の問題であり、別 step として分離することに意味論的な根拠がない。STEP_NAMES の肥大化で pipeline の認知負荷が増加する
- **Why not**: 既存の `delta-spec-validation` + `delta-spec-fixer` loop をそのまま再利用することで重複を排除できる。`Transition.when` predicate による context-aware routing の方が総変更面積が小さい

### Alternative 2: `gitDiffFiles` 関数を DeltaSpecRuleInput に注入する（option a）

`DeltaSpecRuleInput` に `gitDiffFiles?: () => Promise<string[]>` を追加し、rule が呼び出したときに git diff を実行する案。

- **Pros**: rule が必要なときだけ git diff を実行できる（lazy evaluation）。step 側で事前実行する必要がない
- **Cons**: rule 内に副作用（非同期 git diff 実行）が入り、dependency injection パターンと不整合。unit test で git 呼び出しを stub するために mock 関数を渡す必要があり、テストの記述が複雑になる。rule が「純粋な評価関数」でなくなる
- **Why not**: `changedFiles?: string[]` の事前注入（option b）により、rule を純粋関数として保ちつつ git diff 結果を利用できる。`changedFiles` が undefined の場合は rule をスキップする graceful degradation で backward compatibility も確保できる

### Alternative 3: `findAuthoritySpecViolations` を commit-push から完全削除する

`commit-push.ts` の inline halt だけでなく、`findAuthoritySpecViolations()` の検出ロジックごと削除する案。

- **Pros**: dead code が残らない。将来の `delta-spec-validation` 一元化との整合性が高い
- **Cons**: commit / push の直前という early detection の機会が失われる。`delta-spec-validation` の 2 回目が実行されるのは code-review approved 後であり、それまでの間に baseline 編集が存在しても observable ではなくなる
- **Why not**: warning ログは health check や debug のヒントとして価値がある。`delta-spec-validation` への完全委譲は将来の整理課題（Known Debt）として残し、現時点では warning に降格して検出の可観測性を維持する

### Alternative 4: tool permission で baseline path への write を SDK レベルで遮断する

agent の tool 設定で `specrunner/specs/` 配下への Write tool 呼び出しを deny する案。

- **Pros**: agent が物理的に baseline を編集できなくなるため、構造的な根絶が可能
- **Cons**: tool permission の設定は agent ランタイム（Managed Agents SDK）の機能に依存する。現行の agent 設定 schema では path-based deny の粒度が提供されていない。実装可能になっても、既存の delta-spec-fixer が `specrunner/changes/` 配下の delta path に書き込む際に permission 設計が複雑になる
- **Why not**: 長期的な根絶策として別 request で扱う。本 ADR は artifact / pipeline レイヤーでの構造解を提供し、tool permission による SDK レベルの遮断は次フェーズの対策として位置付ける

## Pipeline Flow（変更後の 2nd phase）

```
code-review approved
  → delta-spec-validation (2nd invocation)
    → approved → adr-gen → pr-create → end
    → needs-fix → delta-spec-fixer → delta-spec-validation (loop)
    → escalation → escalate
```

## Consequences

### Positive

- baseline 直接編集違反が発生しても pipeline が即死せず、agent の self-fix で続行できる
- `no-authority-spec-direct-edit` rule が design 直後の 1 回目にも実行されるため、早期検出の機会が増える
- `Transition.when` predicate は汎用的な conditional routing 機構であり、将来の context-dependent 分岐に再利用できる
- `delta-spec-fixer` の既存 prompt + loop が再利用されるため、新たな wrapper / agent 追加なしに対処が完結する
- 同型 5 issue（#383, #385, #299, #316, #263）の実害を構造レベルで削減できる

### Negative

- `commit-push.ts` の warning 降格により、违反が検出されても pipeline がその場では止まらない。`delta-spec-validation` 2 回目まで達しない経路（例：pipeline が途中キャンセルされた場合）では、warning のみが残って violations が修正されないケースが理論上存在する
- `Transition.when` predicate の評価には `JobState` への参照が必要であり、transition の定義が pure data から関数を含む形になる。serialization / snapshot には適さない
- `delta-spec-fixer` の iteration budget が 1 回目と 2 回目で共有されるため、1 回目フェーズで iteration を多く消費すると 2 回目フェーズで fixer が起動できなくなる可能性がある

### Known Debt

- `commit-push.ts` の `findAuthoritySpecViolations()` は warning ログ用に残っているが、将来 `delta-spec-validation` が完全にカバーすれば冗長になる。2 重検出の整理は別 request で
- tool permission による SDK レベルの遮断（baseline path への write tool を deny）は長期的な根絶策として未実施。本 ADR は artifact / pipeline レイヤーでの対処に限定
- request 起票時の予防強化（`request review` / `request generate` での baseline path 検出）は別 request (#299) で扱う

## References

- Request: `specrunner/changes/delta-validation-post-code-review/request.md`
- Design: `specrunner/changes/delta-validation-post-code-review/design.md`
- Related: `specrunner/adr/2026-05-18-validation-rule-interface.md`（DeltaSpecRuleInput の元設計）
- Related: `specrunner/adr/2026-04-29-spec-fixer-iteration-loop.md`（pipeline loop primitive の確立）
- Related: `specrunner/adr/2026-05-19-prevent-authority-path-in-request-body.md`（request 起票時の予防策）
- Related issues: #383, #385, #299, #316, #263
