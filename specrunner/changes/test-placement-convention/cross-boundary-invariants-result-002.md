# Cross-Boundary Invariants Review: test-placement-convention

- **reviewer**: cross-boundary-invariants
- **iteration**: 2
- **verdict**: approved

---

## 検査対象

- `src/config/schema.ts` — `TestPlacement` / `TestsConfig` / `configSchema.tests` 追加
- `src/prompts/test-placement.ts` — `renderTestPlacementInstruction` 新設
- `src/core/step/implementer.ts` — `buildImplementerInitialMessage` への `placement` 注入
- `tests/config/schema.test.ts` / `tests/prompts/test-placement.test.ts` — テスト追加

iteration 1 で decision-needed として上げた 2 件（deepMerge discriminated union 残渣・system prompt line 49 競合）は人間が判断済みのため再報告しない。JSDoc コメント陳腐化も本 change では対象外とする。

---

## 検査結果

### [INFO] mirror renderer — `sourceRoot` が `"src"` 以外のとき example が rule text と整合しない

**機構**: `renderTestPlacementInstruction` の mirror ブランチは `const exampleSource = "src/foo/bar.ts"` を固定例として使い、`sourceRoot` を剥がすか否かを `exampleSource.startsWith(\`${sourceRoot}/\`)` で判定する。

**発生条件**: `sourceRoot: "lib"` など hardcoded 例パスが `sourceRoot/` で始まらない値を設定すると、`stripped = exampleSource`（剥がしなし）になり `exampleTest = "tests/src/foo/bar.test.ts"` となる。一方 `sourceRootNote` は `` `lib/` prefix is stripped before mirroring. `` と述べる。この二文が矛盾する。

**影響評価**: 規則文（"Place each test file under `${testsRoot}/`, mirroring the source tree structure."）は正しく、LLM はこちらに従う。example はあくまで補助的な図示であり、矛盾する例があっても機能的誤動作は起きない。`sourceRoot` が `"src"` の場合（README および gamesmith ユースケースの主対象）は正確に機能する。設計 D5 の範囲外でもある。

**残存リスク**: `sourceRoot: "lib"` 等を設定したプロジェクトで LLM が example に引きずられた場合、full-path example を採用する可能性がゼロではない。ただし指示文の rule text が優先されるため、運用上の問題度は低い。将来の改善候補として記録する。

---

## 不変条件の充足確認

| 不変条件 | 判定 | 根拠 |
|---|---|---|
| `placement` 未設定時のメッセージがバイト同一 | ✓ | `placementSection = ""` → `TC-009` が `msg1 === msg2` を検証 |
| `IMPLEMENTER_SYSTEM_PROMPT` が無改変 | ✓ | diff に `implementer-system.ts` 変更なし。`TC-015` が `既存テストの配置パターンに従う` / `特定ディレクトリを指定しない` の存在を固定 |
| `TEST_CASE_GEN_SYSTEM_PROMPT` に placement 言及なし | ✓ | diff に `test-case-gen-system.ts` 変更なし。`TC-010` が `testsRoot` / `sibling` / `mirrorPlacement` の不在を固定 |
| test-coverage 検出ロジックが無改変 | ✓ | diff に `test-coverage.ts` 変更なし |
| config 検証エラーが既存 `throwFromFirstIssue` 経路を通る | ✓ | `tests: optional(object({ placement: optional(testPlacementSchema) }))` を `configSchema` に追加。失敗は `CONFIG_INVALID: tests.placement ...` として throw（TC-003 / TC-004 / TC-011 / TC-012 で確認） |
| `RawConfig.tests` passthrough が `verification?: unknown` と同形 | ✓ | `tests?: unknown` — 既存パターンと一致 |
| `deps.config.tests?.placement` アクセスが型安全 | ✓ | `SpecRunnerConfig.tests?: TestsConfig`、`TestsConfig.placement?: TestPlacement` を追加。`StepContext.config: SpecRunnerConfig` 経由で型付きアクセス |
| `validateConfig` が `raw as SpecRunnerConfig` を返す一貫性 | ✓ | `tests` を含む全フィールドで same passthrough。zod parse 結果ではなく raw を返す既存設計に準拠 |
| `typecheck && test` が green | ✓ | `tsc --noEmit` エラーなし。95 テスト pass（0 fail） |
