# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | src/core/pipeline/parallel-review-round.ts | L74 と L104 のコメントが「listChangedFiles returns []」という旧契約を参照している。管理された実装は現在 `{kind:"unavailable"}` を返すが、コメントは `[]` を返すと記述しており、DU 化後の実際の動作と齟齬がある（動作は正しい。`result.kind === "success" ? result.files : []` の写像でコメントが言う「invalidation 不発」は保存されているが、なぜそうなるかの機構説明が不正確）。 | コメントを「Managed runtime: listChangedFiles now returns {kind:"unavailable"} → mapped to [] → invalidation not fired (fail-safe)」相当に更新する。 | no |
| 2 | low | maintainability | src/core/step/executor.ts | L261 のコメントが「listChangedFiles returns [] structurally」と記述しているが、ManagedRuntime は現在 `{kind:"unavailable"}` を返す。動作は正しい（canDerive===false で listChangedFiles を呼ばない短絡は変わらない）が、コメントの機構説明が旧契約ベース。 | コメントを「listChangedFiles returns {kind:"unavailable"} structurally」相当に更新する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.90

## Summary

### 概要

`listChangedFiles` を `ChangedFilesResult` DU に変更し、LocalRuntime の実行時失敗（git diff 非ゼロ終了・spawn 例外）を `unavailable` として表現する修正。`scope-unevaluable-fail-closed` 不変の per-call 導出失敗経路という残余を既存パターン（`listWorktreeChanges` と同型 DU、既存ハンドラ再利用）で閉じている。

### 受け入れ基準の充足状況

**全 must 項目 ✅**

- **TC-004/005/006** (LocalRuntime 実装): `list-changed-files.test.ts` で exit 0 → `success`、非ゼロ → `unavailable`（reason に exit code）、spawn throw → `unavailable` を固定。success-empty を返さないことのリグレッションガードも存在する。
- **TC-007** (ManagedRuntime): 常に `unavailable` を返し、reason に "managed" を含むことを固定。
- **TC-008** (scope-check fail-closed): `scope-escalation.test.ts` の `T-06-NEW` セクションで `canDerive=true + unavailable` → verdict=escalation、UNKNOWN finding（origin:"scope"、resolution:"decision-needed"、severity:"high"、options≥2）を固定。従来の fail-open 素通り（`[]`=breach なし）が閉じることを明示的に確認している。
- **TC-011** (activation gate fail-closed): `executor-activation.test.ts` の per-call unavailable セクションで `canDerive=true + unavailable + paths reviewer` → agent 呼び出し（skip されない）、かつ `listChangedFiles` が呼ばれたことを固定。
- **TC-022** (typecheck && test green): verification-result.md で確認済み（503 test files、6958 tests 全 pass、typecheck 0 error）。

**行動保存 consumer（round-invalidation・no-op-detect）✅**

- `parallel-review-round-invalidation.test.ts` の全 stub を `{kind:"success", files:[...]}` へ機械移行済み。behavioral assertion（invalidation 発火・不発の条件）は完全に不変。
- `executor-no-op.test.ts` も同様に shape のみ移行済み。

**型による自己強制 tooth ✅**

- 全 consumer が `result.kind` で discriminant 分岐を行い、`string[]` を直接使うコードパスは型として不能になっている。typecheck が green であることで確認済み。

**canDeriveChangedFiles / B-11 / RealRuntimeStrategy 無変更 ✅**

- `local.ts:724`、`managed.ts:550` の `canDeriveChangedFiles()` は不変。`RealRuntimeStrategy` intersection に変更なし。

**architecture prose 更新（D7）✅**

- `components.md:27`（Scope derivation 不変条件）: per-call 失敗と構造的非導出の相補を追記。
- `components.md:148–149`（listChangedFiles・能力 predicate）: DU 契約・非対称設計（managed の listChangedFiles=unavailable vs listWorktreeChanges=success:[]）を反映。
- `dynamic-model.md:61`（capability gate 不変条件）: back（scope checkpoint）が per-call 失敗も UNKNOWN 合成で捕捉することを追記。

### 指摘事項

L74 / L104（parallel-review-round.ts）と L261（executor.ts）のコメントが旧契約を参照しているのは cosmetic な不正確さ。動作への影響はなく、fixer が対処する必要はない（Fix=no）。

### 総評

設計・実装・テストが request.md の受け入れ基準を全て充足している。DU パターンの適用が listWorktreeChanges と一貫しており、新規 escalation 機構を作らず既存ハンドラ再利用に徹した設計判断も spec 通り。approved。
