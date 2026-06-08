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
| 1 | MEDIUM | Test coverage | spec.md | `packageManager` フィールドに未知の PM 名（例: `"berry@4.0.0"`）が入った場合の挙動（→ npm fallback）を検証するシナリオが spec.md に無い。tasks.md T-01 は「既知 PM 名なら採用」と規定しているが、シナリオ化されていないためテスト実装時に見落とされる可能性がある。 | spec.md の "lockfile も packageManager フィールドも無い" シナリオの Given に「`packageManager` に未知名が設定されている場合も含む」と追記するか、別シナリオを追加して `"npm"` fallback を明示する。 |
| 2 | LOW | Spec clarity | tasks.md | T-01 の「読み取り / parse 失敗は握りつぶす」がどこまでの例外を握りつぶすか明示されていない。`packageManager` フィールドが null/undefined のときに `.split("@")` を呼ぶと TypeError が発生するが、外側の try/catch で握りつぶす意図かどうかが不明。実装者が `pkg?.packageManager?.split("@")[0]` のような optional chaining を使えば問題ないが、spec として明示されていない。 | T-01 に「`packageManager` フィールドへのアクセスおよび `split` も含め、ブロック全体の例外を握りつぶす」または「optional chaining を使う」と明記する。 |
| 3 | LOW | Known limitation | spec.md / design.md | `yarn.lock` を検出した場合に `yarn install --frozen-lockfile` を実行するが、Yarn Berry (2+) はこのフラグを hard error にする。Non-Goal として明示されているが、doctor check や verification エラーメッセージに yarn 検出時のヒントが規定されていない。ユーザーが自力でトラブルシュートする必要がある。 | doctor の T-04 に「yarn 検出時の hint に Yarn Berry 利用者向け workaround（`verification.commands` を使う旨）を含める」旨を追記する。 |
| 4 | LOW | Spec clarity | tasks.md | T-04 の「runtime カテゴリの check 数は 3 のまま」が `commonChecks` のみを指すのか `localChecks`（`codexCliCheck` も `category: "runtime"`）を含む全 runtime check を指すのか曖昧。現在の total は 4（commonChecks 3 + localChecks 1）。 | T-04 の記述を「`commonChecks` の runtime カテゴリ check 数は 3 のまま」に限定して明示する。 |

## Summary

設計の一貫性・セキュリティともに良好。

- **セキュリティ**: PM コマンドを `[command, ...args]` タプルで spawn する設計（D4）により shell injection が構造的に排除されている。`packageManager` フィールドから抽出した値を known PM 名で検証してから使用しており、任意コマンド注入の余地がない。
- **一貫性**: `DoctorFs` が `DetectPmFs` を構造的に満たすことが確認済みで、doctor チェックへの検出関数再利用は問題ない。`createWorktreeManager` の第 4 positional DI は既存スタイルと整合している。
- **後方互換**: `bun.lock` / `bun.lockb` 検出による既存挙動の完全保存が spec.md で明示されている。
- **依存**: 外部ライブラリ不追加（`node:*` のみ使用）。deps 4 個維持。

見つかった問題はいずれも LOW / MEDIUM で実装ブロックにならない。
