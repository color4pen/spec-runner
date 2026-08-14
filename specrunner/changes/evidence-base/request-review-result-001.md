# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション確認

| 主張 | 確認先 | 結果 |
|------|--------|------|
| `resolveBaseCandidateOids`: base = 最新 test-materialize commitOid / candidate = 最新 implementer commitOid | `src/core/step/bite-evidence/oids.ts` L27-43 | ✅ 一致 |
| `detectBaseImplementationContamination` に ponytail マーカー「startedAt 全順序に依存。Evidence Base 導入時に tree 合成へ置換」 | `src/core/step/bite-evidence/oids.ts` L55 | ✅ 一致 |
| gate.ts step 3.5: 汚染検出 → strategy-deferred | `src/core/step/bite-evidence/gate.ts` L119-129 | ✅ 一致 |
| `FORWARD_TYPES = {bug-fix, new-feature}` は gate と archive floor で共有 | `gate.ts` L36, `achieved-assurance.ts` L21 | ✅ 一致 |
| `achieved-assurance.ts` P2.5: 汚染 base → baseline unbuildable → 両 dimension を absent に fail-closed | `src/core/archive/achieved-assurance.ts` L236-246 | ✅ 一致 |
| `runtime-strategy.ts:700` — `runTestsAtCommit(oid, testFiles, cwd, config)` | `src/core/port/runtime-strategy.ts` L700-705 | ✅ 一致（managed は unavailable） |
| `config/schema/types.ts:162` — `scopedTestCommand?: string` | `src/config/schema/types.ts` L162 | ✅ 一致 |
| job state は job 開始時点の base branch OID を記録していない | `src/state/schema/types.ts` 全体を確認、`jobBaseOid` 等のフィールド無し | ✅ 一致 |
| `--adopt-commits` は synthesizedCommits ledger にのみ追加、implementer commitOid は不変 | `src/core/command/resume.ts` L460-464 | ✅ 一致 |

### 要件・受け入れ基準の確認

- Requirement 1 (job base 同定): design で確定と明記。両候補（state 記録 / 最初の synthesized commit の親から導出）は実装可能。適切な deferred。
- Requirement 2 (red 側置換): runtime port への新メソッド追加を示唆。現行 `runTestsAtCommit` は local のみ対応、managed unavailable の挙動維持は要件 5 で明示済み。
- Requirement 3 (candidate 側置換): `--adopt-commits` で採択されたオペレータ commit は synthesizedCommits ledger にのみ記録され、候補 tree に反映されないことが確認済み。Effective branch HEAD（synthesized + adopted）を候補とする方向は一貫。
- Requirement 4 (時系列依存機構の撤去): 撤去対象 3 点（`detectBaseImplementationContamination` / gate 3.5 / archive P2.5）はすべてコードで実在確認済み。撤去対象テストの列挙は design での責務として明記されており適切。
- Requirement 5 (非対応環境の挙動維持): `scopedTestCommand` 未設定・managed unavailable・非 forward type の strategy-deferred は既存コードで動作確認済み。

### スコープ確認

- 受け入れ基準はすべて `typecheck && test` で機械検証可能な形式。
- ADR フラグ `adr: true` 設定済み。Evidence Base という新抽象の導入は ADR-worthy。
- type `spec-change` は適切（fundamental な bite-evidence 意味論の変更 + runtime port 変更を含む）。

## 検証できなかった項目

None

## Findings 詳細

None
