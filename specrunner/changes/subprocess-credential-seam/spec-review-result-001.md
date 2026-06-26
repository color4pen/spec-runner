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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Spec completeness | tasks.md / T-07 | `vi.mock("node:child_process", () => ({ spawn: vi.fn() }))` だけでは `runSubprocess` が `child.stdout?.on` / `child.on` を呼び出す際に `undefined` が返ってクラッシュする。"model on runner-git-show-env.test.ts" の指示で実装者が補完することを前提としているが、モック返却値の最低形（EventEmitter 様オブジェクト）が spec に明示されていない。 | 実装者は既存 `runner-git-show-env.test.ts` のモックパターンをそのまま踏襲すれば解決する。ブロッキングではないが、T-07 の scaffold guidance にモック返却値の最小要件（stdout / stderr / stdin / on を持つ EventEmitter ライク）を 1 行追記しておくと意図がより明確になる。 |
| 2 | LOW | Consistency | tasks.md / T-04 | `buildExecFile` は現行 `const buildExecFile = (): ExecFileFunction =>` で export されていない。T-04 は `export const buildExecFile = (env = …, execFileAsyncImpl = …)` への変更を指示しているが、export の追加が明示されていない（T-08 が `import { buildExecFile }` を前提とするため必須）。 | T-04 の指示は `export` を追加する変更であると解釈すれば矛盾なく実装できる。blocking なし。 |

## 検証メモ

### ソースコード照合

- `src/git/dynamic-context.ts:10` — `execFile as nodeExecFile` を直接 import、`execFileAsync(...)` に env なし ✓（漏れ確認）
- `src/git/remote.ts:1` — `execFile` を直接 import、`execFileAsync(...)` に env なし ✓（漏れ確認）
- `src/git/transport-auth.ts:11` — `execFile` を直接 import、`getRawOriginUrl` に env なし ✓（漏れ確認）
- `src/cli/doctor.ts:9` — `* as childProcess` import、`buildExecFile` 内の execFileAsync 呼び出しに env なし ✓（漏れ確認）
- `src/util/git-exec.ts:19` — `runSubprocess` は `stripSecrets(process.env)` を常時適用 ✓（seam 確認）
- `src/util/spawn.ts:45-47` — `spawnCommand` は `stripSecrets(process.env)` を常時適用 ✓（seam 確認）
- grep `from ['"]node:child_process` — 現状 8 import 行: seam 2 ファイル（spawn / git-exec）+ verification 2 ファイル + doctor + src/git 3 ファイル。T-01〜T-03 後は 5 ファイルに収束 ✓

### 設計判断の妥当性

**D1 (B-12 tooth — import ban)**: `process.env` grep では env 省略 spawn を検出できないという根本的制約を正確に捉えており、import 経路を縛ることで「書き忘れ」を構造的に不可能にする設計は適切。現行 B-6 の grep 方式との差異が明確に説明されている。

**D2 (src/git → git-exec 集約)**: `dynamic-context.ts` / `transport-auth.ts` / `remote.ts` が timeout / AbortSignal を必要としない点を確認。seam 経由で十分。`gitExec` の戻り値型（`string | null`）が各サイトの現行インターフェースと整合する。

**D3 (remote.ts error 契約保全)**: 現行コードの locale 依存メッセージマッチング（`"not a git repository"`, `"128"`, `"No such remote"`）をより堅牢な `rev-parse` プローブに置換する設計は正当。`runSubprocess` が non-zero exit で resolve（throw しない）し、spawn error でのみ reject する挙動と T-03 の try/catch 構造が正確に対応している。`notGitRepoError()` / `SpecRunnerError("NOT_GIT_REPO", …, "Origin remote not configured.")` の二出力を保全できている。

**D4 (doctor allowlist)**: `execFile` + `timeout` + `AbortSignal` の組み合わせを現行 seam が提供していないことを確認。env strip を呼び出しサイトで実施しつつ import を allowlist するアプローチは、要件「strip または理由付き allowlist」の両方を同時に満たす。

**D5 (B-6 allowlist narrowing)**: `agent-runner.ts:270-271` が現在 2 行にまたがっており、`resolveClaudeCodeOAuthTokenFn(` が L270、`process.env` が L271 にある構造を確認。1 行に fold した上で pattern を `resolveClaudeCodeOAuthTokenFn(` に狭める手順は MATCHING SEMANTICS（file + substring 同時一致）と整合。

**D6 (ADR)**: `architecture/model.md` が out-of-loop / CODEOWNERS-gated であり、本 change では tooth + allowlist 実装にとどめ model 更新を行わない判断は適切。

### 受け入れ基準対応確認

| AC | 対応タスク |
|----|----|
| src/git 全 subprocess が stripSecrets 済み env でテスト固定 | T-01〜T-03 + T-07 |
| doctor.ts の execFile が strip 済みまたは allowlist | T-04 + T-08 |
| env 省略 credential 継承 spawn を検出する guard (pre-fix で red) | T-06 + T-09 |
| node:child_process 直接 import が seam 外禁止 | T-06 (B-12 tooth) |
| B-6 claude allowlist が狭まり同ファイル内の cast 付き spawn を検出 | T-05 + T-09 |
| git push/fetch/log/diff/remote が env 変更後も機能 | 既存 transport-auth テスト + T-11 |
| typecheck && test が green | T-11 |

全 AC が spec / tasks でカバーされている。
