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
| 1 | LOW | Completeness | spec.md | `specReview` の fail-closed シナリオが OID 欠落と `readFileAtCommit` unavailable を 1 シナリオに束ねている。design・tasks は両ケースを個別に列挙しており（T5 の (i)/(ii)）、spec の粒度が粗い。テスト実装時に見落としが起きるリスクはあるが、`MUST NOT` 表現と `absent` 帰結は明確なため、機能的ブロッカーではない。 | シナリオを「`specReviewOid` 欠落」と「`spec.md` 取得不能（どちらか unavailable）」の 2 つに分割すると tasks との対応が明確になる。今回は LOW のため任意。 |
| 2 | LOW | Implementability | tasks.md | T-03 で "specReview テスト用に spec-review run へ commitOid を付与できるようにする" と述べるが、既存 TC-007 が `commitOid` なしの spec-review run で `specReview="required"` を期待している点が D2 適用後に fail することを明示していない。実装者が "意味が変わる更新" の対象と認識できれば問題ないが、明示がないと既存テストが壊れた理由に気づきにくい。 | T-03 の "意味が変わる更新" に "既存 TC-007 は commitOid なし → D2 適用後に fail-closed に倒れるため commitOid 付与と readFileAtCommit stub が必要" と 1 行補足する。機能に影響しないため LOW。 |
| 3 | LOW | Completeness | spec.md | `floor.specReview` が constrain しない場合は spec.md I/O を実行しないという "MAY" 句が spec に存在するが、それが省略可能な最適化であること（正確さには無関係）が読み手に伝わりにくい。 | "constrain しないとき I/O は不要（satisfiesFloor が absent を無視する）" という補足コメントを spec の該当箇所に 1 文追加すると意図が明確になる。任意。 |

## Review Notes

### 修正の論拠の正確性

背景分析は正確。`achieved-assurance.ts:267` と `L297` の両 read が `finalHeadOid` であることを確認（現コードで実測）。events.jsonl の lineage frozen hash と finalHeadOid の test-cases.md を同一 commit で比較する旧構造は、同一 commit 内で両者を書き換える協調改竄で通過できる。本 request が提案する "testCaseGenOid の blob 跨ぎ比較" は、不変な git 履歴を anchor にするため攻撃面を消す。

### セキュリティ観点

- **整合性 (A04)**: 提案する fix は「同一 commit 自己整合」を「別 commit 跨ぎ比較」に正す構造修正であり、根本対策として妥当。
- **残存脅威（スコープ外として正しく分離）**: journal（events.jsonl / state.json）に記録された `commitOid` そのものを agent が改竄するケースは、OID 自体が journal 由来のため本 request だけでは塞げない。request はこれを明示的にスコープ外として分離し、別 request に委ねている。分離理由の説明が明確であり、歯を黙って削っていない。
- **fail-closed**: 全 return パスで当該次元を absent に倒す設計は一貫しており、fail-open を生む経路は見当たらない。
- **入力検証**: `readFileAtCommit` は unavailable を fail-closed に扱う。slug チェックはパス混同を防ぐ。sha256 は暗号学的に十分。
- **OWASP Top 10**: 該当する主項目は A04 (Insecure Design)。本 change はその是正。注入・認証・XSS 等は適用外（CLI/pipeline ランナーの git primitive）。

### 設計の整合性

- D1（scenario freeze を OID 束縛）と D2（specReview を OID 束縛）は対称的な構造を持ち、fail-closed 前例と一致する。
- D5（production 変更は `achieved-assurance.ts` 1 ファイル）は最小依存方針に沿い、port / runtime / caller 変更が不要であることを実コードで確認した。
- folder 移動（`specrunner/changes/<slug>/` → `specrunner/changes/archive/<date>-<slug>/`）に対して、suffix 解決付き `readFileAtCommit` を両 commit に適用する設計は正しい（active path と archived path の full path 差異を suffix マッチで吸収）。
- events.jsonl 依存の撤去は `fold` import 削除を含む（tasks T-01 で明示）。既存 blob freeze（`diffPathsBetweenCommits`）は存置され、testDerivation の合成条件は維持される。

### テスト十分性

- T1（scenario time-boundary 歯）/ T2（協調改竄歯）/ T4（specReview time-boundary 歯）の各 negative に「破壊確認コメント」を必須化している点が歯化の本体として適切。
- T3（positive）を実 runtime E2E（anchor と HEAD を別 commit）で固定する構成は、時間境界を実 git 履歴上で証明するため、mock だけでは検出できない退行を防ぐ。
- T6（実 config anti-regression）で #848 の歯（scopedTestCommand 未設定 → fail-closed）を退行させないことを明示している。
- T7（backward-compat）の "意味が変わる更新" と "assertion 無変更で green" の区別が明確。

### spec.md 構文適合

- 各 Requirement に `SHALL` / `MUST` normative keyword あり。
- 各 Requirement に Scenario（Given/When/Then）が複数あり（positive + negative + fail-closed）。
- Layer-1 振る舞い（archive floor の判定規律）に絞られており、型・FSM 強制の Layer-0 は含まない。
