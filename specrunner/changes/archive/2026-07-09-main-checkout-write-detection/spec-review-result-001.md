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
| 1 | LOW | Semantics | tasks.md T-02 / design.md D4 | `kind: "modified"` が "before-only" エントリ（step 前に dirty だったファイルが step 後に status から消えた場合）に割り当てられている。この状態はファイルが step 中にコミットまたはリバートされたことを意味し、main checkout への積極的な操作が行われた証拠として通常の `modified`（書き換え）よりも悪質な可能性がある。CLI 出力でユーザーが混乱しうる。 | CLI 描画側（T-08）で "before-only" ケースに補足説明（例: "file was dirtied before then cleaned during step — agent may have committed or reverted on main checkout"）を加えるか、kind を `"restored"` 等で区別することを検討。機能上の欠陥ではないため任意対応。 |
| 2 | LOW | Spec completeness | spec.md / tasks.md | `mainCheckoutDrift` フィールドの状態ライフサイクルが未定義。drift 検出後にユーザーが main checkout を手動修正して `job resume` し、step が成功した場合、`mainCheckoutDrift` が state に残存したままになる。spec は「state に記録する」とのみ述べており、resume 成功後に消去するか履歴として保持するかを明示していない。 | 意図が「監査証跡として保持」であれば spec.md か design.md D5 にその旨を一文補足する。消去が望ましければ T-07 に `patch: { mainCheckoutDrift: null }` でクリアするタイミングを追記する。どちらでも機能影響はないが明文化で実装者の迷いを防げる。 |
| 3 | LOW | Design completeness | design.md (Open Questions) | design.md 末尾の Open Question（DSM 閉包の実装時再確認）が未解決のまま tasks.md に移行している。T-02 の import 制限（`step→port / step→reviewers / step→config`）として作業指示には落ちているが、新たな層間逆依存が見つかった場合の対処（spec-review への escalation）が tasks に記載されているのみで、設計上の回避策は示されていない。 | 実装完了後の code-review で DSM エッジを明示的にチェックするか、T-02 の Acceptance Criteria に「import graph に新規逆エッジがないことを typecheck + import-graph ツールで確認」を追記する。低リスクだが明示することで手戻り確率を下げられる。 |

## Summary

spec.md・design.md・tasks.md は相互に一貫している。主要な設計判断（検出方式・監視スコープ・escalation 方針・fail-open 契約・no-worktree/managed 除外）はすべて根拠付きで文書化されており、受け入れ基準はテスト可能な形式で記述されている。

セキュリティ面では、`git status --porcelain -z --no-renames` の実行パスは `fs.realpath` 由来で固定されており、spawn は配列引数形式のため shell injection の余地はない。drift 記録に変更内容（hash 値そのもの）は含まれないため秘密情報の漏洩リスクもない。fail-open 設計（D6）は一次防御が別 request（adapter 側制限）に委ねられた backstop 層として適切な選択。

spec.md が "(成功時)" と明示するとおり after-snapshot は成功時のみ取得され、tasks.md T-07 の配置と整合する。失敗ステップでの drift は本設計上スコープ外であり（失敗時は pipeline がすでに interrupted）、この絞り込みは妥当。

LOW 3 件は実装者が判断できる範囲であり、実装ブロックには至らない。
