# ADR-20260627: reviewer 活性化ゲート — 変更ファイル導出不能時は fail-closed（over-activation）

**Date**: 2026-06-27
**Status**: accepted

## Context

custom reviewer には `paths` 活性化条件を宣言できる（例: `src/auth/**` 変更時のみ security レビューを走らせる）。活性化ゲート（`src/core/step/executor.ts`）は `RuntimeStrategy.listChangedFiles()` で変更ファイル一覧を取得し、条件に一致しなければ reviewer を skip する。

managed runtime には local git worktree がなく `git diff` を実行できない。そのため:

- `listChangedFiles()` は無条件で `[]` を返す（`managed.ts:514`）
- `canDeriveChangedFiles()` は `false` を返す（`managed.ts:527`）

この設計のもとで活性化ゲートが `canDeriveChangedFiles()` を確認せずに `listChangedFiles()` を直接呼ぶと、`paths` 条件付き reviewer は常に「該当ファイルなし」と判定されて **無言で skip** される。security レビュー等が消えたまま PR が「レビュー通過」のように進む。

この挙動はコードに意図として記されていた:

- `managed.ts:506-512`: `"fail-safe: under-activate rather than evaluate against stale or fabricated data"`
- `runtime-strategy.ts:385-387`: `"reviewer activation consumers MUST NOT reference this predicate — they maintain fail-safe (under-activate) via listChangedFiles alone"`

一方、隣接する scope-check（`src/core/step/scope-check.ts:49`）は同じ `canDeriveChangedFiles() === false` に対して **fail-closed**（UNKNOWN finding を synthesize して人間に委ねる）で応答する。同じポートの同じシグナルに対し、二つのコンシューマが正反対の方針を持ち、かつ一方の方針がプロジェクトの fail-closed escalation 不変条件と矛盾していた。

## Decision

活性化ゲートも `canDeriveChangedFiles()` を先に確認し、`false` の場合は `listChangedFiles()` を呼ばず **reviewer を活性化して走らせる**（fail-closed by over-activation）。

具体的には:

- `evaluateActivation` に `ActivationFacts.changedFilesDerivable?: boolean` フィールドを追加する。省略時は `true`（導出可能）として扱い、既存の呼び出し元（`computeInvalidations` など）は変更なし。
- ゲートは `canDeriveChangedFiles?.() !== false` で `changedFilesDerivable` を計算して渡す。
- `evaluateActivation` の `paths` 分岐は `changedFilesDerivable === false` を先に確認し、その場合は glob マッチを行わず `activated: true` を返す。
- `requestTypes` の評価は `paths` の前であり、`changedFilesDerivable` に関係なく機能する。
- 矛盾するコメント（`"fail-safe: under-activate"` / `"MUST NOT reference this predicate"`）を新しい fail-closed 契約を反映した内容に更新する。

**採用した fail-closed 戦略**: skip（fail-open）でも escalation（halt）でもなく、活性化（over-activation）。判定できない ⇒ 該当しうる、の方向に倒す。reviewer は `paths` フィルタなしで変更全体をレビューする。paths はレビューの *内容を絞る* ためのものではなく *実行を gate する* ためのものなので、paths 対象のスーパーセットをレビューすることは常に安全側。

## Alternatives Considered

### Alternative 1: 現状維持 — under-activation を fail-safe とみなす

`listChangedFiles()` が返す `[]` に対して `paths` 条件を評価し、一致しなければ reviewer を skip する現挙動を継続する。managed runtime の `"fail-safe: under-activate"` コメントをそのまま維持する。

- **Pros**: コード変更なし。managed runtime で余分な reviewer セッションが実行されない。
- **Cons**: security reviewer 等が無言で消える。記録される `skipReason` が「条件不一致」と「導出不能」を区別しない。scope-check の fail-closed 方針およびプロジェクトの fail-closed escalation 不変条件と正面から矛盾する。
- **Why not**: レビューが無言で落ちることは安全でない。同じポートのシグナルに対して隣接コンポーネントと逆の方針を持ち続けることは設計の一貫性を破壊する。却下。

### Alternative 2: scope-check と同じく escalation（UNKNOWN finding を synthesize して人間に委ねる）

`canDeriveChangedFiles() === false` かつ `paths` 条件が存在する場合、scope-check と同様に UNKNOWN decision-needed finding を synthesize して job を halt する。

- **Pros**: scope-check との一貫性が最も高い。あいまいな状況での自動判断を一切行わない。
- **Cons**: managed runtime で `paths` reviewer を宣言するすべての run が毎回 halt して人間の判断を要求する。managed runtime の `canDeriveChangedFiles() === false` は稀な異常ではなく worktree 不在に起因する構造的常態であり、毎回 halt は運用として過大。scope-check の escalation は「scope 逸脱」という稀で重大な事象に対応するもので、`paths` 導出不能は性質が異なる。
- **Why not**: コストと安全性のトレードオフが over-activation より劣る。採用した D1（activate）は escalation より安全側ではないが、silent skip よりは常に安全側であり、managed runtime を止めずに運用できる。将来的に escalation に切り替えが必要になれば、`changedFilesDerivable` という observable fact を渡す同じシームで対応可能。

### Alternative 3: 活性化ゲート内部で executor が paths 条件を検査して force-activate する

`evaluateActivation` を変更せず、executor 側で `canDeriveChangedFiles()` が `false` かつ `step.activation.paths` が存在する場合に force-activate する分岐を追加する。

- **Pros**: `evaluateActivation` の signature を変更しない。
- **Cons**: executor が `step.activation.paths` を検査する必要が生じ、活性化ポリシーが `evaluateActivation` と executor に分割される。`evaluateActivation` が純粋関数・単一責任を失う。既存の呼び出し元（`computeInvalidations`）との不整合が生じやすい。
- **Why not**: ポリシーは `evaluateActivation` に集約すべき。observable fact（`changedFilesDerivable`）を入力として渡す D2 の方が責任の分離が明確。却下。

### Alternative 4: `changedFilesDerivable` を必須フィールドにする

`ActivationFacts.changedFilesDerivable` を optional ではなく required にして、すべての呼び出し元に明示的に渡させる。

- **Pros**: 導出可能性の意識付けを強制できる。
- **Cons**: `computeInvalidations`（`reviewer-status.ts`）の呼び出し側も変更が必要になる。スコープ外の reviewer invalidation 挙動が変化するリスクを生む。既存テストフィクスチャの全面更新が必要。
- **Why not**: `computeInvalidations` は本変更のスコープ外であり、変更しないことが要件。optional + 省略時 derivable デフォルトにより、変更を活性化ゲートの呼び出し側のみに限定できる。却下。

## Consequences

### Positive

- managed runtime で `paths` 条件付き reviewer が無言 skip されなくなる。
- `skipReason` が「条件不一致」と「導出不能」を区別できるようになる（導出不能時は skip が記録されない）。
- 活性化ゲートと scope-check が同一ポートのシグナルに対して同一の fail-closed 方向を持つ。
- `evaluateActivation` が pure・deterministic のまま（`changedFilesDerivable` を observable fact として受け取るだけ）で、モック不要のユニットテストで方針を固定できる。
- `computeInvalidations` 呼び出し側は `changedFilesDerivable` を渡さないため byte-for-byte 変更なし（opt-in フィールド + 省略時は導出可能のデフォルト）。

### Negative / Trade-offs

- managed runtime で `paths` reviewer を宣言している job は、これまで `skipped` だったレビューが実行されるようになり、reviewer セッションのコストと時間が増加する。これは意図した修正（過去の「承認」は実質 unearned だった）。
- over-activation の reviewer は `paths` で絞り込んだはずのファイル以外もレビュー対象にする。reviewer の目的・criteria が自然にフォーカスするため品質上の問題は生じにくいが、意図した paths 限定実行とは異なる。

### Known Debt

- managed runtime で変更ファイルを実際に導出する実装（worktree なしでの diff）は本変更のスコープ外。実装されるまで over-activation が常態となる。
- `pipeline.ts` の reviewer invalidation パス（`computeInvalidations`）には既存の `"fail-safe"` コメントが残る（reviewer invalidation は別設計・スコープ外）。

## References

- Request: `specrunner/changes/reviewer-activation-fail-closed/request.md`
- Design: `specrunner/changes/reviewer-activation-fail-closed/design.md`
- Spec: `specrunner/changes/reviewer-activation-fail-closed/spec.md`
- Related: `specrunner/adr/2026-06-07-no-worktree-execution-mode.md`（managed runtime / no-worktree 実行モードの背景）
