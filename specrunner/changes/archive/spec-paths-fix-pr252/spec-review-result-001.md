# Spec Review Result: spec-paths-fix-pr252

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-16

## Summary

request.md の要件・scope・受け入れ基準は明確。design.md と tasks.md が対象箇所を具体的行番号レベルで列挙しており、実装者が迷う余地がない。

## Findings

### Minor: design.md の箇所数カウント不一致

design.md は cli-commands/spec.md について「16 箇所」と記載しているが、tasks.md の列挙は 12 replacements。tasks.md の列挙が正確（grep + 目視で確認済み）。design.md のカウントは概算であり、実装に影響しない。

**Severity**: cosmetic / non-blocking

### Note: 受け入れ基準 grep が L282・L184 を捕捉しない

- L282 (`job-state-store/spec.md`): regex 内のエスケープ付きパス `\/specrunner\/requests\/active\/` は `grep "specrunner/requests/"` にマッチしない
- L184 (`cli-commands/spec.md`): `"specrunner", "requests", dir` はスラッシュ区切りでないため同様

tasks.md がこれらを明示的に列挙しているため実装漏れリスクは低い。受け入れ基準は必要条件であり十分条件ではないと理解する。

**Severity**: informational / non-blocking

## Security

セキュリティ上の懸念なし。spec 文書のテキスト置換のみでコード変更を含まない。

## Conclusion

scope が絞られた単純な参照修正。tasks.md の行番号指定は現在のファイル内容と一致することを確認済み。そのまま実装に進んでよい。
