# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | spec.md | `commitSkipped` の persist 回数についてスペックと現状コードが一致していない。spec.md の "Behavioral invariants preserved" には "1 for sequential skip" と書かれているが、現行の `commitSkipped` は `store.appendHistory`（内部で persist）→ `store.persist(s)` で 2 回 persist している。スコープ外に "persist 回数を変えない" とある。スペックが言う "1" は **リファクタ後** の状態であり、現行の 2 回目 persist（appendHistory-persist 後に同一 state を再書き込みする冗長な persist）を除去することを暗黙に含む変更である。 | spec.md の "Persist count" 行を "1 for sequential skip (down from current 2; the appendHistory-internal persist is the redundant write — same state, no observable effect)" と補記し、scope-out の "persist 回数を変えない" が sequential-vs-batched パターン（逐次 vs round バッチ）の区別を指すことを明示する。 |
| 2 | LOW | consistency | spec.md / tasks.md | `commitSkipped` における emit と persist の順序が暗黙に変わっている。現行コード: `appendHistory`-persist → emit → `store.persist`。T-05 後: emit → `store.persist`（single）。tasks.md は "preserves sequential emit-before-persist order" と説明するが、これは最終 persist との相対順序であり、emit より先にあった appendHistory-persist が消えることは言及されていない。`verdict:parsed` ハンドラが skip 時に state を disk から読む設計なら影響があるが、イベントペイロードに必要情報がすべて含まれるため実害はない。 | tasks.md T-05 の注釈に "Note: the appendHistory-internal persist (which currently fires before the emit) is removed by this task; the emit now precedes the single persist. verdict:parsed handlers receive all needed info in the event payload and do not read state from disk, so no observable effect." を追記する。 |

## Review Notes

### Architecture

設計は健全。

- **D1（module-level pure functions）**: `projectSuccess` / `projectSkip` を module-level 非エクスポート純粋関数として定義する選択は正しい。`this` 参照なし、`store` 呼び出しなし、同一ファイル内配置（新規モジュール不要）。
- **D2（`{step}-started` を projector 外で合成）**: round 専用の history entry を projector の外で付与する設計は、projector の "success/skip fold only" という単責を保ち、boolean フラグ汚染を回避する。
- **D3（`applySuccessPostPersistEffects` を private method）**: `this.events` へのアクセスが自然で、usage / lineage / emit の 3 効果を一箇所に集約する。
- **D5（構造 gate test）**: `core-invariants.test.ts` の既存 `grepE` / `parseGrepOutput` / `isCommentLine` インフラを再利用し、liveness（≥2 コールサイト）と duplication-marker の両面をテストする設計は行移動型の迂回を正しく塞ぐ。

### Correctness

- `appendHistoryEntry` import (`state/schema.ts`) は DSM ホワイトリスト（domain → shared-kernel）で許容。層境界違反なし。
- T-06 の history 順序保証: `appendHistoryEntry({step}-started)` を projector 呼び出しの前に置くことで `{step}-started` < `{step}-verdict` / `{step}-skipped` の順序が維持される。
- `commitRound` の single persist は T-07 で明示的に不変と規定されており、B-13 不変（single-writer）は保持される。
- halt 経路（`recordFailedStepResult` のみ、`store.fail` / `transitionJob` は呼ばない）は T-06 で明示的に skip されており B-14 不変が保持される。
- usage `appendInvocation` が `commitSuccess` で final persist の前から後に移動する点（D4 記載）は、try/catch でラップされた best-effort 処理であり観測可能な影響はない。

### Completeness

T-01 〜 T-09 のタスク分解は完全。各タスクに機械検証可能な acceptance criteria が設定されており、実装の曖昧さがない。

### Structural Gate Tests（T-08）

4 つの gate test の設計は適切:
- Test 1/2: duplication marker 0 件 → 複製コメント再導入を防ぐ
- Test 3/4: `projectSuccess(` / `projectSkip(` が ≥2 コールサイト → 行移動型の削除を検出する liveness gate
