# Spec Review Result: hardcode-github-client-id

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-16

## Summary

request.md は spec 準拠の背景説明・要件定義が正確。design.md は局所的変更に相応しい最小構成。
ただし tasks.md に **既存テストの更新漏れ** が 1 件ある。

## Findings

### F-001 [MUST-FIX] tasks.md: `tests/github-device.test.ts` TC-079b の更新が欠落

`tests/github-device.test.ts:137-156` に TC-079b として以下 2 テストが存在する:

1. `getGithubClientId throws GITHUB_CLIENT_ID_MISSING when env is absent` (L139-148)
2. `getGithubClientId throws when env is empty string` (L150-155)

Task 1 で throw を削除するため、この 2 テストはそのまま残すと **赤になる**。
tasks.md に「TC-079b を hardcode fallback を返す期待に書き換える」タスクを追加する必要がある。

**修正案**: Task 3 と Task 4 の間に Task 3.5 を挿入:

> **Task 3.5: `tests/github-device.test.ts` TC-079b の期待値を更新**
>
> **File**: `tests/github-device.test.ts`
>
> 1. TC-079b の describe ブロック名を実態に合わせて更新（e.g. "fallback to built-in client_id"）
> 2. env absent テスト: throw を expect → hardcode 値が返ることを expect
> 3. env empty string テスト: throw を expect → hardcode 値が返ることを expect（`"" || GITHUB_CLIENT_ID` で fallback する）

### F-002 [NOTE] empty string の扱いが暗黙的

Task 1 のコード例 `process.env["SPECRUNNER_GITHUB_CLIENT_ID"] || GITHUB_CLIENT_ID` は、空文字列 `""` も falsy として hardcode fallback になる。これは現行の `!clientId || clientId.length === 0` と等価なので **動作としては正しい**。ただし受け入れ基準に empty string ケースが明示されていないため、Task 4 のテストに empty string → hardcode fallback のケースを追加することを推奨する。

### F-003 [NOTE] Acceptance Criteria Mapping の網羅性

Task 5 `typecheck + test green` は受け入れ基準の全項目をカバーするが、TC-079b の修正なしでは Task 5 が赤になる。F-001 の修正で解消される。

## Security Considerations

- **client_id の hardcode**: GitHub OAuth Device Flow は client_secret 不要の公開仕様。`gh` CLI も同様に OSS hardcode しており、セキュリティリスクなし。
- **env override**: テスト用途の上書き機構は既存設計を踏襲。新たな攻撃面なし。

## Verdict Rationale

F-001 は実装時に確実にテスト失敗を引き起こす欠落タスク。tasks.md への追記で解消できるため needs-fix。
