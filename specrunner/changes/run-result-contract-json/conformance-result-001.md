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
| tasks.md | ✓ | 全チェックボックス完了。T-01〜T-05 の Acceptance Criteria をすべて満たす |
| design.md | ✓ | D1〜D7 の決定事項すべてが実装に反映されている |
| spec.md | ✓ | 5 Requirement / 14 Scenario をすべてテストがカバー |
| request.md | ✓ | 受け入れ基準 6 項目すべて充足。`bun run typecheck && bun run test` green（276 files, 3266 tests） |

---

## Detail

### tasks.md

全チェックボックスが `[x]` 完了。

- **T-01**: `src/core/command/run-result.ts` が新設済み。`RunResultKind` union、`RunResultContract` interface、`buildRunResult` 純粋関数、`formatRunResultJson` ヘルパーが実装済み。副作用（I/O）なし確認。
- **T-02**: `command-registry.ts` の `run`（L187）・`job.subcommands.start`（L327）・`job.subcommands.resume`（L422）に `json: { type: "boolean" }` が定義済み。CLI → options → PrepareResult.json の伝播経路を全ファイルで確認（`run.ts` / `resume.ts` / `pipeline-run.ts` / `resume.ts` core / `runner.ts`）。
- **T-03**: `runner.ts` の 4 終端（setupWorkspace 失敗 / buildDeps 失敗 / pipeline throw / handleResult）それぞれに `if (json)` ガードが実装済み。`json=false` 時は stdout への書き込みなし。exit code 変更なし。
- **T-04**: `tests/unit/core/command/run-result.test.ts`（284 行、TC-005〜TC-020）・`runner.test.ts`（TC-JSON-RUN-001〜004、TC-026、TC-JSON-SETUP-001〜002）・`tests/unit/cli/run-json-flag.test.ts`（TC-JSON-CLI-001〜007）が新設済み。
- **T-05**: 写像ロジックが `run-result.ts` の 1 関数にのみ存在することを Grep で確認。exit code・人間向け出力の不変を検証。

### design.md

| 決定 | 実装 |
|------|------|
| D1: 終端契約は stdout JSON | `runner.ts` で `stdoutWrite` / exit code ロジック変更なし ✓ |
| D2: 写像を純粋関数 1 箇所に集約 | Grep: mapping logic は `src/core/command/run-result.ts` のみ ✓ |
| D3: JSON スキーマ | `RunResultContract` が schemaVersion / result / slug / jobId / step / prUrl / reason を定義 ✓ |
| D4: schemaVersion: 1 | 全 return path に `schemaVersion: 1` リテラル ✓ |
| D5: 写像規則 | awaiting-archive→pr-created / awaiting-resume→awaiting-human / else→failed。SPEC_REVIEW_RESULT_NOT_FOUND は先頭特殊ケースで failed ✓ |
| D6: フラグ配線 | 3 registry エントリ + CLI→PrepareResult の全 chain 確認 ✓ |
| D7: 4 終端 × json on/off | 4 終端それぞれに `if (json)` ガード実装 ✓ |

### spec.md

| Requirement | Scenarios | 検証 |
|-------------|-----------|------|
| R1: --json 受理と終端 JSON 出力 | 4 | TC-JSON-CLI-001〜007 + TC-JSON-RUN-001〜004 ✓ |
| R2: 種別区別 | 4 | TC-005〜TC-008、TC-JSON-RUN-001〜003 ✓ |
| R3: 最小フィールド | 3 | TC-009〜011、TC-015〜018 ✓ |
| R4: exit code 不変 | 2 | TC-JSON-RUN-001（exit 0）/ TC-JSON-RUN-002〜003（exit 1）✓ |
| R5: 人間向け出力不変 | 1 | TC-JSON-RUN-004 / TC-JSON-SETUP-002（stdout empty）✓ |

### request.md

| 受け入れ基準 | 確認 |
|-------------|------|
| `run --json` / `job start --json` / `resume --json` が終端 JSON を stdout に出す | ✓ |
| JSON 種別が pr-created / awaiting-human / failed を区別する | ✓ |
| JSON に PR URL / slug / jobId / 停止 step / 停止事由が含まれる | ✓ |
| exit code が現行（0 / 1 / 2）と変わらない | ✓ |
| `--json` 未指定時の人間向け出力が不変 | ✓ |
| `bun run typecheck && bun run test` が green | ✓ (276 files, 3266 tests passed) |
