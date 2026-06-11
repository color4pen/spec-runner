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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Security / Spec Gap | spec.md — "fetch succeeds without ambient git credentials" シナリオ | Then 節が `http.<origin>.extraheader` の注入のみ言及し、`credential.helper=` の per-invocation 無効化（design D2）に触れていない。headless ハング防止の意図が spec レベルで担保されていないため、実装者が `credential.helper=` を省略してもシナリオを満たしていると判断できる余地がある。 | Then 節に `And the credential.helper is overridden to empty for this invocation, preventing any credential prompt` を追記して D2 の保証を spec に落とす。 |
| 2 | MEDIUM | Security / Token Leakage | spec.md — Requirement "token MUST NOT appear in … logs" シナリオ | シナリオが「ログにトークンが出ない」を検証するが、`base64` エンコード形の除外が明文化されていない。design D5 は「base64 等の可逆形も遮断」と明示しているが spec には反映されていない。テスト実装者が平文だけをチェックして base64 をスキップするリスクがある。 | シナリオの Then 節を `does not contain the token, its base64 encoding, nor the extraheader argument value` と拡張する。 |
| 3 | LOW | Security / Accepted Risk | design.md — Risks | プロセス引数への base64 トークン一時露出（ps/proc 可視性）は Risks に記載されているが、spec の Requirement や AC には「この露出は許容された設計トレードオフである」という記述がない。将来の spec-review でこのリスクが再指摘される可能性がある。 | spec.md の "token MUST NOT appear in remote URL, persistent git config, or logs" Requirement 本文に、プロセス引数への一時的な露出は per-invocation で永続化されないため許容範囲とする旨を一文添える。 |
| 4 | LOW | Clarity / Tasks | tasks.md — T-01 | `wrapTransportGitExecSpawn` の引数型コメントが `base: SpawnFn /* util/git-exec */` となっているが、`git-exec.ts` の SpawnFn は `ChildProcess` を返す同期型で `util/spawn.ts` の async `SpawnFn` と異なる。同じ識別子 `SpawnFn` を使うと実装者が混同するおそれがある。 | コメントを `base: GitExecSpawnFn /* ChildProcess-returning, sync */` のように区別する表記に修正する（あるいは tasks の実装者向け注記として明示する）。 |
