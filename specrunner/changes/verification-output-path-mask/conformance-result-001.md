# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-04 の全チェックボックス [x] 完了。`src/util/path-mask.ts` 作成、`writeVerificationResult` シグネチャ拡張、3 呼び出し箇所すべてに `cwd` 渡し済み。 |
| design.md | ✅ | D1: 純粋関数を `src/util/` に分離、他 `src/` モジュール依存なし。D2: writer seam 1 箇所（`lines.join` 後・`fs.writeFile` 前）に適用。D3: cwd → homeDir の順、リテラル split/join、空文字列ガード付き。 |
| spec.md | ✅ | SHALL/MUST 要件すべて対応。cwd 相対化（TC-PM-01）・$HOME プレースホルダ化（TC-PM-02）・verdict/phase 不変（TC-PM-03）を testedable な Scenario としてカバー。 |
| request.md | ✅ | 受け入れ基準 3 件すべて満たす。テストあり（runner-path-mask.test.ts）、既存テスト無変更で green、typecheck && test 通過（3898 tests passed）。 |

## Details

### tasks.md

全チェックボックス `[x]` 確認済み。

- T-01: `src/util/path-mask.ts` に `maskAbsolutePaths(text, { cwd, homeDir? })` を export。`node:os` のみ import、他 `src/` モジュールへの依存なし。
- T-02: `writeVerificationResult(result, outputPath, cwd)` にシグネチャ拡張。3 箇所（commands path / package-json-integrity 早期 return / 通常 return）すべてに `cwd` を渡している。`PhaseResult` / `VerificationResult` フィールドは生値のまま返却（正規化対象外）。
- T-03: `tests/unit/util/path-mask.test.ts`（10 ケース）と `tests/unit/core/verification/runner-path-mask.test.ts`（TC-PM-01〜04）を追加。既存 `runner.test.ts` は無変更。
- T-04: typecheck && test green（verification-result.md Verdict: passed、315 test files / 3898 tests）。

### design.md

- D1（専用 util）: `src/util/path-mask.ts` として `env-filter.ts` / `paths.ts` と同じ単機能 util パターンで実装。`homeDir` 引数注入で決定的なテストが可能。
- D2（writer seam 1 箇所）: `const content = maskAbsolutePaths(lines.join("\n"), { cwd }); await fs.writeFile(outputPath, content, "utf-8");` の形で確認。stdout/stderr ブロック・phase 表・skip 理由すべてがこの 1 箇所でカバーされる。
- D3（正規化順序・リテラル置換）: cwd+/ → cwd → homeDir+/ → homeDir の順。`split(target).join(replacement)` でメタ文字エスケープ不要。空文字列ガードあり。

### spec.md

各 Scenario の対応:

- **cwd 配下パスが repo 相対化される**: TC-PM-01 が `tempDir` (= cwd) 配下の絶対パスを stdout に混入させ、result ファイルに絶対パスが含まれないことを assert。`PhaseResult.stdout` は生値を保持することも確認。
- **$HOME 配下パスがプレースホルダ化される**: TC-PM-02 が `os.homedir()` 配下パスを stderr に混入させ、result ファイルに `~/` プレフィックスで出力されることを assert。
- **verdict 判定と phase 実行の挙動が不変**: TC-PM-03 が絶対パスを含む出力を持つ run で verdict / phase status が期待通り（failed / passed / failed）であることを assert。

### request.md

- 受け入れ基準 1（テストあり）: TC-PM-01 / TC-PM-02 が直接カバー。
- 受け入れ基準 2（既存テスト無変更 green）: `git diff main...HEAD -- tests/unit/core/verification/runner.test.ts` が空（無変更確認済み）。全 3898 tests green。
- 受け入れ基準 3（typecheck && test green）: verification-result.md Verdict: passed で確認済み。

## Observations (non-blocking)

**OBS-1**: 本 pipeline の `verification-result.md` 自体には絶対パスが残っている（build phase の tsup.config.ts パス、test phase の vitest RUN 行）。pipeline 開始時点のプロセスが旧コードをロード済みのため、dogfooding の構造上 in-flight run では新コードが適用されない。request.md「既存 archive の遡及修正はスコープ外」に該当。修正コードはマージ後の次回 run から有効。

**OBS-2**: cwd と同じ prefix を持つ兄弟ディレクトリのパス（例: `<cwd>-backup/file`）が `.-backup/file` に変形される可能性がある。design.md Risks セクションで認識・受け入れ済み（verdict / exitCode への影響なし）。
