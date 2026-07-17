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
| 1 | LOW | Implementation clarity | tasks.md T-04 | `isExcludedPath` は `gate.ts` 内 private 関数（未 export）。T-04 は「export するか中立モジュールへ抽出する」と記述しているが、export/move どちらを選ぶかの判断基準が曖昧。DSM 検査（B-1〜B-3）上は `src/core/archive → src/core/step/bite-evidence` は同層（domain→domain）で許可されているため、`export function isExcludedPath` が最小変更。move が必要になるのは `arch-allowlist.ts` の closure 検査が intra-domain でもより細粒度の制約を設けている場合に限られる。 | implementer は先に `module-boundary.test.ts` / `core-invariants.test.ts` を確認してから export と move のどちらかを選ぶこと。export を選ぶ場合は `isExcludedPath` の JsDoc に公開 API として使う旨を記載する。spec 文書自体は修正不要。 |
| 2 | LOW | Spec completeness | spec.md | `testHash` の「runtime が digest artifacts を提供できる条件」が spec.md では `when the runtime can digest artifacts` と抽象的。`digestArtifacts` は `RuntimeStrategy` に required で存在し managed では `hash: null` を返す。spec.md は `testHash` の absent 条件として "managed runtime" と "file-not-found (hash: null)" を明示していない。 | 実装上は design.md D3 の記述（`digestArtifacts` を optional に GateDeps の Pick に追加し、hash が null/absent なら testHash absent）で十分解決できるため、実装ブロックにはならない。spec.md に対して optional 補足コメントとして「ManagedRuntime の `digestArtifacts` は `hash: null` を返すため、managed 経路では `testHash` は absent になる」と追記してもよいが必須ではない。 |
| 3 | LOW | Security | design.md / tasks.md T-01 | `diffPathsBetweenCommits` の `paths` 引数に空配列が渡された場合の動作が仕様で明示されている（`{kind:"success", files:[]}`）が、paths が空の状態で materializedTestFiles.length === 0 の短絡が T-04 の `deriveAchievedAssurance` で先に発生するため、実際にはこの分岐に到達しない。仕様の redundancy であり矛盾ではない。なお `diffPathsBetweenCommits` の paths は git diff output から取られ user 入力ではないため injection リスクは構造的にゼロ。 | 修正不要。paths 空 → `{kind:"success", files:[]}` の仕様は defensive API として正しい。 |

## Review Summary

### 全体評価

仕様は高品質。問題（P0: 宣言を provenance として rubber-stamp する fail-open）が明確に特定され、解法（達成 provenance に差し替え + fail-closed 徹底）が一貫して全文書を貫いている。

### 設計整合性

- **D1（宣言→達成差し替え）**: `satisfiesFloor` / `getProfile` / `STANDARD_PROFILE` を変更せず、渡す assurance object だけを差し替える最小変更で、seam 変更の波及を最小化している。
- **D2（achieved 導出の fail-closed）**: specReview（pure state 読み）→ baseOid/finalHeadOid 解決 → materializedTestFiles 同定 → 凍結検査 → base-red 再測という評価順序は論理的に正しく、各失敗モード（unavailable/欠落/0件/凍結破れ/空洞）が absent に倒れる設計が一貫している。
- **D4（二 OID primitive）**: 既存 `listCommitChangedFiles`（`<oid>^ <oid>`）と同型の DU / never-throws 契約で追加する。managed=unavailable → fail-closed の一貫性は維持されている。
- **D5（state hoist + runtime inject）**: `let jobStateForFloor` を outer scope へ hoist する手順は `let jobAssurance` と対称で自然。narrow `Pick<RuntimeStrategy, ...>` による inject で unit test が fake runtime を使えることも正しい。Step 1 の try block が throw するときは早期 return するため、Step 3.6 に到達するとき `jobStateForFloor` は必ず初期化済みという不変条件も成立する。

### テストカバレッジ

T1〜T8 の命名受け入れ基準は必要な歯を全て名指ししている。
- T1（anti-regression: unavailable → fail-closed）と T2（profile 欠落 TC-011 反転）は今回の P0 修正を二重ロックする。
- T3（達成は通す）で gate が常時 fail にならないことを保証し、T4（凍結の歯）と T5（空洞の歯）でそれぞれ偽造経路と空洞テストを封じる。
- T6（fail-closed の網羅）は 6 種の unavailable/欠落を個別ケースとして固定する。
- T7（record 束縛・後方互換）と T8（回帰保存）で既存挙動の保護を明示している。
- 破壊確認（T1: 常に achieved=required に固定すると落ちる、T4: 凍結検査を外すと落ちる）がコメントで明示されており、歯の実効性が担保されている。

### アーキテクチャ適合

- `src/core/archive → src/core/step/bite-evidence` の intra-domain import は architecture/model.md §3 の許可行列（domain→domain の `—` セル）で許可されている。
- `diffPathsBetweenCommits` を `RealRuntimeStrategy` に追加することで B-11（concrete runtime が `RealRuntimeStrategy` を implements する不変条件）が維持される。
- セキュリティ観点: 新規 primitive は spawn を array args で呼び出すため shell injection リスクゼロ。OID/path は git が生成した値でありユーザー入力ではない。credential は関与しない（B-6/B-10 適合）。

### スコープ境界

Phase 1 / Phase 2 / R5 の境界が request・design・spec・tasks で一貫しており、「未達を通さない（fail-closed）」と「dogfood で歯が緑で噛む（Phase 2）」の区別が明示されている。残余（同一ファイル内の空洞 test 混在）も scope-out として明示済み。
