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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Completeness | design.md D8 | **同一 slug の複数 active attempt で liveness.json が競合する。** 要件7 は「同一 slug の attempt は複数併存しうる」と明示しているが、`.specrunner/local/<slug>/liveness.json` は per-slug 単一ファイルのため、複数 attempt が concurrent に active な場合、後続 attempt の liveness.json が先行 attempt のものを上書きする。先行 attempt の `worktreePath` 取得は sidecar 参照が失敗し T-09 の fallback（`buildWorktreePath` 規約再導出）に倒れて動作するが、この上書き動作と fallback への依存が仕様として明記されていない。 | D8 の sidecar ファイルレイアウト表の `liveness.json` 備考に「同一 slug の複数 attempt が concurrent active の場合、liveness.json は最新 attempt のものになる。他の attempt の worktreePath は `buildWorktreePath(repoRoot, slug, jobId)` 規約から再導出する」を追記する。 |
| 2 | MEDIUM | Completeness | tasks.md T-12 | **`job show <jobId>` / `job cancel <jobId>` の jobId 二次解決 scan 範囲が未定義。** T-12 および D7 では「slug-dir 横断 scan で二次解決」とあるが、active（worktree / managed marker）のみをスキャンするか archived / legacy を含めるかが記載されていない。`job cancel <jobId>` でアーカイブ済みのものを誤解決するリスクや、`job show <jobId>` の検索範囲の期待差が実装者に委ねられている。 | T-12 の jobId 二次解決 Acceptance Criteria に「active（worktree + managed marker）のみをスキャンし、`--all` フラグがある場合は archived / legacy を含める」を明記する。 |
| 3 | MEDIUM | Security | design.md D5, tasks.md T-06 T-07 | **slug の path traversal サニタイズへの言及がない。** 段2 で `changes/<slug>/` および `.specrunner/local/<slug>/` のパスを生成する新規経路が複数追加されるが、slug が `../../etc/passwd` 等の path traversal 文字列を含む場合の排除について spec に記載がない。request.md パーサー側のバリデーションに暗黙依存しているが、新規パス生成経路での明示的な検証が未保証。 | T-06 または T-07 の Acceptance Criteria に「slug が有効な識別子文字列（英数字・ハイフン・アンダースコア）であることをアサートし、path traversal 文字（`..` / `/` を含む）は拒否する」を追加する。既存の slug バリデーション関数への参照でも可。 |
| 4 | LOW | Completeness | design.md Open Questions | **Open Questions の Q2（managed marker lifecycle）が実質解決済みだが残存している。** D7 に marker のスキーマ・write タイミング・clear タイミングが定義され、T-12 の Acceptance Criteria にも準拠が明記されており、「要確定」の課題は解消されている。 | design.md の Open Questions Q2 を削除するか「D7 / T-12 で解決済み」と記す。 |
| 5 | LOW | Completeness | design.md D8 D2 | **sidecar の `session-<attempt>.sessionId` と events.jsonl の step-attempt record `sessionId` の役割分担が不明確。** D2 の step-attempt record は `sessionId` フィールドを持ち、D8 の sidecar には `session-<attempt>.sessionId` ファイルがあり「fold での `sessionId` 解決に使用」とある。実行中の attempt はまだ events.jsonl に記録されていないため sidecar で sessionId を保持する、という意図と推察されるが spec に明記されていない。 | D8 の sidecar `session-<attempt>.sessionId` の備考に「step 実行中（events.jsonl 未記録の状態）の sessionId を保持する。step 完了後は events.jsonl の step-attempt record が正とし、fold では sidecar を参照しない」を追記する。 |

## Summary

前回レビュー（spec-review-result-001.md）の HIGH 2件・MEDIUM 3件・LOW 1件はすべて対処済み。

- **Finding 1（旧 HIGH）**: D3 `load()` の冪等リカバリ（fold 行数 > カウンタの場合リセット）で delta-append クラッシュリカバリの穴が塞がれた。Risks 節にも mitigation が明記された。✓
- **Finding 2（旧 HIGH）**: D7 に managed marker の完全なスキーマ（ファイル名・フィールド・write/clear タイミング）が定義された。T-12 の Acceptance Criteria にも準拠要件が追加された。✓
- **Finding 3（旧 MEDIUM）**: D8 に sidecar ファイルレイアウト表（liveness.json / session-\<attempt\>.log / session-\<attempt\>.sessionId / marker.json）が追加された。T-09 の Acceptance Criteria に準拠参照が追加された。✓
- **Finding 4（旧 MEDIUM）**: T-13 に `createExitGuardHandler(repoRoot, jobId)` の明示的なシグネチャと「自 job のみを遷移させる」の Acceptance Criteria が追加された。✓
- **Finding 5（旧 MEDIUM）**: T-11 に `InterruptionRecord` TypeScript インターフェースと fold での `resumePoint` 再生成ロジックが追加された。✓
- **Finding 6（旧 LOW）**: D1 の表で usage.json を「JSON 配列への atomic overwrite（read-modify-write）」に修正、D6 でも `fs.appendFile` ではないと明示された。✓

新規 CRITICAL / HIGH は無く、実装ブロッカーなし。Finding 1–3（MEDIUM）は実装着手前に design.md / tasks.md に 1 文追記するだけで解消できる軽微な補足漏れ。
