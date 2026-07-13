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
| 1 | MEDIUM | Design Gap | design.md D2 / spec.md Req-1 | `roundDeps = { ...deps }` は shallow clone なので、メンバー実行が `deps.config` 等の nested object フィールドを書き換えると共有 `deps` にも影響する。Risks セクションで「真の保証は D1 にある」と正しく述べているが、テストは `resumePrompt` / `resumeContext` の不変性のみを固定する。本 request のスコープ（`resumePrompt`/`resumeContext`）では十分だが、将来の拡張時に誤解を招く可能性がある。 | 対処不要（スコープは適切）。必要なら spec.md Req-1 に "shallow clone — nested fields are not protected" の注記を付ける程度で十分。 |
| 2 | LOW | Behavioral Edge Case | design.md D1 / spec.md Sequential Req | Pipeline の `firstUnitExecuted` フラグは CLI ステップも「消費済み unit」として扱う。CLI ステップ（spec-review 等）はは `buildStepContext` を呼ばないため `deps.resumePrompt/Context` を読まない。「CLI ステップ開始の resume + human note」という極端なケースでは、旧挙動（CLI スルー → 次 agent step が受取）から新挙動（CLI で消費フラグ立ち → 次 agent step は受取らない）に変化する。実用上は CLI step で pipeline が停止しても human note 供給と組み合わせるシナリオが存在しないが、設計文書で言及されていない。 | 対処不要。設計上は新挙動の方が意味論的に正しい（CLI ステップは resume note を活用できないのに「透過的に届ける」のは偶然挙動）。明示したければ design.md D1 Risks に一行追加する程度で十分。 |
| 3 | LOW | Test Clarity | tasks.md T-05 | `tests/unit/step/executor-resume-context.test.ts` の TC-RC-004（`expect(deps.resumePrompt).toBeUndefined()` — in-place clear の機構 assert）と `src/core/step/__tests__/executor-resume-context.test.ts` の同等 assert のみを移設・削除対象とし、TC-RC-001〜TC-RC-003（resumeSessionId の assert）は影響を受けない。tasks.md の記述が「削除／更新する」だけで対象 assertion を限定していないため、実装者が TC-RC-001〜003 を誤って削除するリスクがある。 | tasks.md T-05 に「TC-RC-004 のみ移設対象。TC-RC-001〜003 は機構変更の影響を受けないため現状維持」の一文を追加することを推奨。マスト修正ではない。 |

## レビュー所見

### コード対応確認

- `executor.ts:243-246` の in-place クリアブロックは実際に存在し（現状コードで確認済み）、D1 の削除対象として正確に特定されている。
- `resume.ts:274` の `startStep === resumePoint.step` strict equality gate は実際に存在し（現状コードで確認済み）、D3 の修正対象として正確に特定されている。
- `resolve-step.ts` の `mapMemberToCoordinator` は現在 non-export（`function`）であり、T-04 の `export` 追加は正しい変更量。

### 設計決定の評価

- **D1（one-shot 所有を Pipeline へ移す）**: `runInternal` が `firstUnitExecuted` フラグと `depsWithoutResume` を持つ設計は、ADR D4「実行 seam を跨ぐ入力 lifecycle は orchestration が所有する」に厳密に準拠する。executor が単一 step の I/O しか見えない点を正しく分析している。
- **D2（round が readonly input を構築）**: `Promise.allSettled` fan-out 前に `{ ...deps }` を構築し、executor がクリアしない状態で全 member に渡す構造は、「構造として D4 を明示する所有点が round」という設計意図を正しく実現している。
- **D3（写像後一致 gate）**: `mapMemberToCoordinator(resumePoint.step, reviewers)` を使うことで、静的 step では `resumePoint.step === resumePoint.step`（完全等価）になり、動的 member 経路のみ修正される。Alternatives の検討も論理的に正しい。
- **D4（偶然挙動の非固定）**: "意図した配布を固定し、現状の偶然挙動を仕様化しない" は重要な設計原則。spec.md の scenarios が observable behavior（誰に届くか）を固定し、実行順非依存なことを明示している点は適切。

### セキュリティ評価

外部 API エンドポイントなし・ユーザー入力バリデーション対象なし・認証経路変更なし。変更は内部パイプライン state machine のリファクタリングであり、OWASP Top 10 の適用範囲外。不変性の強化（shared state mutation の排除）は fail-safe 方向への変更であり、セキュリティ観点では改善。

### タスク順序の評価

「scenario 先（T-01 → T-02-04 → T-05 → T-06）」の順序は正しい。T-01 の red テストが D1/D2/D3 実装の受け入れ条件として機能し、T-05 で旧機構 assert を移設してから T-06 で全体を green にする流れは、意図した挙動の固定に先行する正しい TDD アプローチ。
