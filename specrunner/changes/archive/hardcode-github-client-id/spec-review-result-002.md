# Spec Review Result: hardcode-github-client-id (Round 2)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-16

## Summary

Round 1 の F-001（TC-079b 更新漏れ）は Task 3.5 として tasks.md に反映済み。F-002（empty string）も Task 4 のテストケースでカバー済み。request.md の 5 要件・4 受け入れ基準すべてが tasks.md のタスクにマッピングされており、spec との整合性も確認済み。

## Round 1 Findings の解消状況

| ID | Status | 対応 |
|---|---|---|
| F-001 | **resolved** | Task 3.5 追加。TC-079b を fallback 期待に書き換える指示あり |
| F-002 | **resolved** | Task 4 に empty string → hardcode fallback のテストケース含む |
| F-003 | **resolved** | F-001 解消により Task 5 が green になる前提が整った |

## Round 2 Findings

### F-004 [NOTE] design.md の `export const` 記述と tasks.md の `const` に微差

design.md は「`GITHUB_CLIENT_ID` を `export const` で定義する」と記述するが、直後に「外部 export は関数経由に留める」と矛盾する補足がある。tasks.md の Task 1 コード例は `const`（非 export）で正しい。実装時は tasks.md に従えば問題ない。修正不要だが、design.md の `export const` は `const` が正確。

## Spec 整合性チェック

| spec scenario | request 要件 | task | 検証 |
|---|---|---|---|
| 既定動作（env 未設定 → hardcode） | 要件 1, 2, 3 | Task 1, 4 | ✅ |
| 環境変数オーバーライド | 要件 2 | Task 1, 4 | ✅ |
| doctor 未設定 → ok | 要件 4 | Task 2, 3 | ✅ |
| テスト green | 要件 5 | Task 3.5, 4, 5 | ✅ |

## 影響範囲の確認

- `getGithubClientId()` の呼び出し元: `src/auth/github-device.ts` L26, L61 のみ。throw 削除による影響は当該ファイル内で完結し、既存の try-catch による handling は不要になる（元々 catch していない）
- `GITHUB_CLIENT_ID_MISSING` 定数: `src/errors.ts` に残存するが、request.md でスコープ外として明記済み
- doctor check: `tests/core/doctor/checks/env/github-client-id.test.ts` の TC-016 更新が Task 3 でカバー済み

## Security Considerations

- **client_id hardcode**: GitHub OAuth Device Flow は public client 仕様（client_secret 不使用）。`gh` CLI 等の OSS 先例あり。セキュリティリスクなし
- **env override**: 既存機構の継続。新たな攻撃面なし
- **OWASP Top 10**: 該当する脆弱性カテゴリなし

## Verdict Rationale

Round 1 の全指摘が解消済み。request → spec → design → tasks の整合性に問題なし。実装可能な状態。
