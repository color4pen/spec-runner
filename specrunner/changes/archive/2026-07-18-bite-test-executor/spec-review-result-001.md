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
| 1 | LOW | Completeness | tasks.md / T-05 | T5 の gate 部分は `FORWARD_TYPES = {bug-fix, new-feature}` に制約されるため、job state の `request.type` を `bug-fix` または `new-feature` に設定しなければ gate が即 `strategy-deferred` を返す。tasks.md は「existing gate/floor tests の state shape に倣う」とするのみで、この制約を明示していない。既存の `gate.test.ts` を読めば自明だが、実装者の見落としリスクがある。 | tasks.md の T-05 に注記「`state.request.type` は `bug-fix` または `new-feature` を使うこと（gate の `FORWARD_TYPES` 制約）」を追加するとより安全。修正なしでも実装者は gate 実装から読み取れるため approval には影響しない。 |
| 2 | LOW | Security | tasks.md / T-02 | `scopedTestCommand` はユーザー config 由来の任意 shell 文字列で `sh -c` に直接渡る。これは既存の `verification.commands` と同一の信頼モデル（プロジェクト作成者が書いたコンフィグ）であり新たな攻撃面は生まれないが、spec/design でこの信頼境界を明示する記述がない。testFile の single-quote 転置によるパス injection 対策は明記されている。 | design.md の D2 または D3 に「`scopedTestCommand` は `verification.commands` と同一のプロジェクト信頼境界」という一行を追加すると自己文書化として有益。実装は既存 commands の扱いと対称であり変更不要。 |
| 3 | LOW | Test Coverage | tasks.md / T-04 | T4 の per-file pass/fail テストはパスが正常系ファイル名（ASCII、スペースなし）である。`scopedTestCommand <file>` を `sh -c` に渡す際の single-quote escaping を検証するケース（スペースや `'` を含むパス）が acceptance criteria に含まれていない。tasks.md はエスケープアルゴリズムを規定しているが検証するテストは言及されていない。 | 実害は実際に現れにくい（git 管理ファイルにスペースは稀）ため必須ではないが、T4 にスペースを含むテスト file 名での追加ケースを optional として記載しておくと防護が強固になる。現行 AC で approval を妨げない。 |

## Summary

仕様は一貫しており、実装に進める品質を満たしている。

- **セキュリティ**: shell injection への主要な対策（testFile の single-quote escaping、`spawnCommand` による `stripSecrets`、`fs.rm` によるシンボリックリンクの明示的除去）はすべて design.md / tasks.md で具体的に規定済み。node_modules の再帰削除を防ぐ symlink-first cleanup（D4）も適切。
- **機能**: D1（symlink）・D2（opt-in config field）・D3（per-file scoped exec）・D4（never-throw + cleanup）の設計判断はいずれも根拠と却下案を伴い、spec との対応が取れている。`spawnCommand` alias（`verification/commands.ts` vs `util/spawn.js` の名前衝突回避）まで tasks.md に明記されている。
- **後方互換**: `scopedTestCommand` 未設定＋custom commands → `unavailable` の既存挙動を保ち、managed runtime は unchanged。T-03 の更新 1 件のみで既存テストへの影響は最小。
- **テスト**: T1〜T6 は受け入れ基準が歯を名指しし、T2 の破壊確認（symlink 除去）・T4 の per-file 独立検証・T5 の実 runtime end-to-end が揃っている。fake 禁止の実配線要件（D6）は仕様の最重要制約として設計・tasks の両方に繰り返し記載されている。
- **スコープ管理**: per-scenario・dogfood 有効化・port 変更の各除外理由が明記されており、スコープ肥大のリスクが抑制されている。

LOW 3 件のみ。blocking issue なし。
