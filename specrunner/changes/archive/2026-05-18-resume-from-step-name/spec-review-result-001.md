# Spec Review Result: resume-from-step-name

- **reviewer**: spec-reviewer
- **date**: 2026-05-18
- **verdict**: approved

## Summary

request.md → design.md → tasks.md → delta spec の一貫性・網羅性を検証した。変更対象 3 ファイル（resolve-step.ts, command-registry.ts, resolve-step.test.ts）と既存コードの整合も確認済み。重大な欠陥なし。

## Findings

### [INFO] F-01: 現行コードの silent fallback-to-critic が明示 error に変わる（意図的な breaking change）

現行 `resolveResumeStep` L98-102 は `from` が `fixer`/`creator` 以外の任意文字列を `"critic"` にフォールバックする。本変更で不正値は Error throw に変わる。CLI の `flag-parser.ts` enum validation が先にガードするため実質的に到達しないが、`resolveResumeStep` を直接呼ぶ内部コードがある場合は影響する。request.md の設計判断 4 と tasks.md T-01c で明示されており、意図通り。

### [INFO] F-02: delta spec が baseline の override 固有シナリオを汎化している

baseline の `--from` Requirement には「fixer-empty mismatch を上書き」「fixer crash を上書き」の具体シナリオがある。delta spec は「任意の resumePoint 状態」で汎化しており、意味的には上位互換だが具体的なエッジケースの文書性がやや低下する。テストケース TC-04〜06 で振る舞い regression は検証されるため実害なし。

### [INFO] F-03: `--from <step-name>` は phase-agnostic（意図通り）

step 名直接指定時は resumePoint の phase に依存せずそのまま返す設計。code phase で `--from design` を指定すると spec phase の step から再開する。これは「ユーザーが明示した step を尊重する」設計意図と合致しており、request.md の要件 2 で明記されている。

## Checklist

| Item | Status |
|------|--------|
| request.md ↔ design.md 整合 | OK |
| design.md ↔ tasks.md 整合 | OK |
| tasks.md が受け入れ基準を網羅 | OK |
| delta spec が baseline と矛盾しない | OK |
| delta spec の MODIFIED format | OK（正しく MODIFIED Requirements セクション） |
| 対象ファイルの行番号・型名が実コードと一致 | OK（resolve-step.ts L16, L91-106, L54; command-registry.ts L89, L335） |
| テストケースが要件を網羅 | OK（TC-01〜07 で全シナリオカバー） |
| スコープ外が明確 | OK |
| セキュリティ考慮 | 問題なし（enum validation で入力制限、FS/Network アクセスなし） |
| baseline spec 直接編集の禁止 | OK（delta spec 経由、AUTHORITY_SPEC_GUARD_RULE 準拠） |
