# Spec Review Result: credentials-provider-parity

- **verdict**: approved
- **reviewer**: spec-reviewer (local Claude Code)
- **date**: 2026-05-18

## Summary

request.md の主張をすべてソースコード実測で検証した。設計判断（Case B: declarative + resolver 吸収）は妥当、delta spec のシナリオ網羅性は十分、task 分割と順序は依存関係を正しく反映している。セキュリティ面でも新たな攻撃面は生まれない（既存パターンの集約のみ）。

## Findings

### Verified Claims (all passed)

| Claim | Verification |
|-------|-------------|
| `process.env["SPECRUNNER_API_KEY"]` 直読 ~14 箇所 | `process.env` 9 + `ctx.env` 5 = 14 確認 |
| `DoctorContext` location = `src/core/doctor/types.ts` | line 80 に interface 確認 |
| `resolvedGitHubToken` / `githubTokenSource` fields 存在 | lines 107, 112 確認 |
| doctor checks 4 ファイルの path | 全 4 ファイル存在確認 |
| `checkRuntimePrereqs` の `SPECRUNNER_API_KEY` 直読 | `src/core/preflight.ts:38` 確認 |
| CLI callsite パターン（bootstrap/run/rm/managed） | 全 callsite の行番号・パターン一致 |
| `saveCredentials` が top-level spread | `github.ts:81` `{ ...existing, ...creds }` 確認 |
| `ERROR_CODES` naming convention | ALL_CAPS_SNAKE_CASE パターン確認 |

### Observations (non-blocking)

#### O-1: design.md と tasks.md の RequiredCredential 型不一致

design.md D2 は `resolverModule: string` フィールドを含むが、tasks.md Task 5 では省略されている。design が "hint for humans" と注釈しており実害はないが、design.md 側を tasks.md に合わせて省くか、tasks.md 側にコメント付きで残すかを統一すべき。

#### O-2: PreflightResult 拡張が design.md に未記載

Task 11 が `PreflightResult` に `specRunnerApiKey?` / `specRunnerApiKeySource?` を追加するが、design.md D6 はこの変更に言及していない。implementer が design.md を設計根拠として参照する際に混乱する可能性がある。

#### O-3: github-device-flow-auth spec の既存記述が不正確

既存 spec の Requirement「取得した access_token は config に保存される」（line 65）は `config.json` と記述しているが、実際の保存先は `credentials.json`。Task 13b で cross-reference を追加するだけでなく、この事実誤認も併せて修正する機会。

#### O-4: resolver return shape の非対称性

新 Anthropic resolver は `{ apiKey, source }` object を返すが、既存 GitHub resolver は `string` を返す。DoctorContext では両者とも value + source を別 field で持つので実用上の問題はないが、将来 GitHub resolver を同じ shape に揃える判断を意識的に先送りしている点を design.md に一文入れると implementer が勝手にリファクタしない。

### Security Assessment

- **Credential storage**: credentials.json の 0600 permission、atomic write は既存パターンを踏襲。新たな脆弱性なし
- **env override**: CI/CD 環境での標準パターン。credentials.json 優先は secret rotation 時の混乱を防ぐ正しい設計
- **直読集約**: `process.env["SPECRUNNER_API_KEY"]` を 14 箇所から resolver 内部 1 箇所に集約することで、credential handling の audit 容易性が向上
- **Secret in memory**: CLI ツールとして標準的なリスクレベル。OS keychain 連携はスコープ外として明示的に除外されており妥当

### Task Structure Assessment

14 tasks の依存グラフは正しい。型定義 (T1) → merge 戦略 (T2) → resolver 実装 (T3-T4) → requirements matrix (T5) → DoctorContext (T6-T8) → callsite 書き換え (T9-T12) → spec (T13) → 最終検証 (T14) の順序に問題なし。各 task の verification コマンドも適切。

### Delta Spec Assessment

`specs/credential-store/spec.md` は 5 Requirement × 10 Scenario で credential model を網羅している。MUST/SHALL の使い分けも適切。特に「callsite は process.env を直読しない」を Requirement として明文化した点は、将来の regression 防止に有効。
