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
| 1 | LOW | Robustness | tasks.md / T-04 | `detectSpecrunnerWorktree` の fail-open 設計（`fs.realpath` 失敗時に「内側でない」を返す）はガード漏れを起こし得るが、設計でリスク受容済み。実在しない cwd を渡すケースは通常 resume 以前の別エラーで拒否されるため運用影響は極小。 | 現状の設計判断（fail-open）を維持し、T-06 のテストで realpath ある cwd での挙動を担保すれば十分。 |

## Review Notes

### セキュリティ検証

**脆弱性の正確性**

- 攻撃経路 1（run-to-run self-disarmament）: 現 config の `forbiddenSurfaces` に config 自身が含まれていないため、agent が worktree 内で surface 宣言を削除しても conformance の breach 検出をすり抜ける。fix（D1）は `guard-config` surface を追加し、config への変更が既存の `deriveScopeBreach → synthesizeScopeFindings` 経路で捕捉されるようにする。`matchGlob` による literal path 照合（`src/state/schema.ts` と同形式）で有効に機能する。
- 攻撃経路 2（worktree resume config injection）: `resume.ts:212` の `resolveRepoRoot(cwd) → loadConfig` が worktree 内 cwd で呼ばれると、worktree side の改変済み config が読まれ得る。fix（D2/D3）は `prepare()` 最上部に specrunner-worktree 判定を挿入し、state 解決・config 読み込みより前に exit 2 で拒否する。

**scope.ts との整合性**

`deriveScopeBreach` は job 開始時に解決された `permissionScope.forbidden` を changed files と照合する。guard-config surface 追加後、agent が job run 中に config を変更した場合（--no-worktree モード含む）、conformance 実行時の changed files に `.specrunner/config.json` が現れ、breach として検出される。premissionScope は job start 時点の main checkout 側 config から確定されており、agent による mid-run config 改変では scope 自体は変わらない。この組み合わせが攻撃経路 1 を正しく塞いでいる。

**CLI dispatch 層との補完関係**

`bin/specrunner.ts` の汎用 `detectWorktree` ガード（任意 git worktree → exit 2）は有効だが、command を直接呼び出す経路や将来のリファクタで外れ得る。D2 の command 層ガードは脆弱性の実在層（config 読み込みパス）に直接置かれ、command 単位でテスト固定できる。両者は補完関係として設計に明記されており、重複ではない。

**OWASP 観点（CLI ツールとして適用可能な範囲）**

- A01 Broken Access Control: guard-config surface がアクセス制御（forbidden surfaces 宣言）の自己改変を防ぐ。fix は正しい。
- A05 Security Misconfiguration: agent による動的な構成弱体化を機械検出で阻止。
- 入力バリデーション: `validateConfig` が既存 schema 制約（`id` 非空・`paths` 非空配列）を guard-config エントリに対しても適用する。

### 設計一貫性

- **D1（surface 追加）**: `{ "id": "guard-config", "paths": [".specrunner/config.json"] }` は既存 JSON schema 制約を満たし、dogfooding テストの `.some(s => s.id === "guard-config")` 加算安全形式と整合する。user global config（`~/.config/specrunner/config.json`）は agent の worktree に存在せず changed files に現れないため対象外とする判断は正しい。
- **D2/D3（worktree 判定 helper）**: `detection.ts` への追加で `detectWorktree`（汎用）と `detectSpecrunnerWorktree`（specrunner 固有）を明確に分離する。`fs.realpath` 正規化で macOS `/private` prefix を吸収する設計も適切。
- **D4（error 再利用）**: `worktreeGuardError` のメッセージ（"cannot be run from inside a worktree"）と hint（"Run from the main worktree: cd <path>"）が spec 要件の「main checkout からの再実行案内」を満たす。exit 2 (ARG_ERROR) も既存ガードと揃っている。

### テスト設計

- T-02: `.some()` 加算安全形・既存 `toHaveLength(3)` はローカル fixture に対する assert なので regression なし。
- T-03: `makeFastConfig()` に `guard-config` surface を追加し `makeEvaluableStrategy([".specrunner/config.json"])` で呼ぶパターンは T-05-1 と対称。
- T-06: `realpath` prefix に依存しないパターン assert（`/cannot be run from inside a worktree/i`、`/Run from the main worktree/i`）で macOS での安定性を確保。既存 resume テストが `cwd: tempDir` を明示注入しているため worktree 内判定を誤爆しない。

### 受け入れ基準の網羅性

全 AC（breach 検出・dogfooding 固定・worktree resume 拒否・main checkout 継続・typecheck+test green）が tasks T-01〜T-07 に対応する実装タスクと観測可能なテスト形式で固定されており、実装可能性に問題はない。
