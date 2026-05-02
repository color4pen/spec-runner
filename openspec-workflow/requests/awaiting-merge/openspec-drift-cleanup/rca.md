# RCA: openspec-drift-cleanup

## 技術的原因

### 直接原因

1. `openspec/specs/cli-commands/spec.md` の Requirement header `### Requirement: \`specrunner\` バイナリは 5 つのサブコマンドを提供する` が、実装が 6 サブコマンド (init/login/run/ps/doctor/finish) に拡張されたにもかかわらず main 上で「5」のまま残存している。
2. `openspec/changes/test-slug/` (verification-result.md のみ残存) が main にコミットされ削除されていない。`openspec list` 結果を汚染する。

### 根本原因

| # | 失敗 | 詳細 |
|---|------|------|
| A | PR #50 (cli-doctor-command) で count を 5 → 6 へ上げる delta が抜けた | doctor を新 Requirement として追加した際、`5 つのサブコマンド` Requirement に doctor を加える MODIFIED delta（または RENAMED + MODIFIED）を入れ忘れた。結果、main spec は count=5 のまま doctor だけ別 Requirement で追加された |
| B | PR #51 (cli-finish-command) は archived spec のスナップショット (count=6) を前提に MODIFIED delta を書いた | しかし main の cli-commands spec はまだ count=5。`openspec archive` の syncer は MODIFIED の header `6 つのサブコマンド` を main で見つけられず "header not found" で fail |
| C | PR #51 を `--skip-specs` で迂回 archive | drift を解消せず archive を完了させたため、main spec ↔ 実装 ↔ archived delta の三者乖離が固定化した |
| D | `openspec/changes/test-slug/` は dogfooding テストで作成され、片付けされずに main にコミットされた | proposal も無く、archive 対象でもないため `openspec archive` のライフサイクルから外れた状態でゴミとして残った |
| D' | 実は test-slug は **`tests/pipeline-integration.test.ts` の vi.mock が repo cwd へ writeFile する**ため、test 実行のたびに自動再生成されている。誰かが test 実行後に状態を `git add` した結果、main に commit された | 単発の手動残骸ではなく、test 実行で必ず再発するため、削除だけでは雪だるま式に再発する。最低限 `.gitignore` で commit を防ぐか、mock を tempDir へ書くよう変更する必要がある |

### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| `openspec/specs/cli-commands/spec.md` Requirement header / body / Scenario | あり | 本 cleanup で 6 に修正 |
| 他 spec の Requirement header (count 系含む) | grep で `5 サブコマンド` 等は本 spec のみで他には無い（spec ごとの Requirement 構造であり cascade は cli-commands に閉じる） | 対象外（スコープ外） |
| `openspec/changes/test-slug/` | 単発残骸ではなく、`tests/pipeline-integration.test.ts:14, 35` の mock writeFile で test 実行のたび再生成される | 削除 + `.gitignore` に `openspec/changes/test-slug/` を追加（commit 再発防止）。mock を tempDir へ書き直す根本対策は別 request |
| 過去の archive 済み change folder の整合性 | スコープ外（request 補足参照） | 対象外 |

### 修正方針

1. `openspec/specs/cli-commands/spec.md` を直接編集し、`5 つのサブコマンド` → `6 つのサブコマンド`、本文・Scenario 含めて 6 サブコマンド (init/login/run/ps/doctor/finish) に統一。
2. 本 cleanup change folder `openspec/changes/openspec-drift-cleanup/` を作成し、delta spec に **`## RENAMED Requirements` と `## MODIFIED Requirements` の両方** を含める。MODIFIED 単独で header を変えると同じ "header not found" が再発するため。
3. `openspec/changes/test-slug/` ディレクトリ全体を `git rm -r` で削除。

## プロセス的原因

### 検出すべきだったフェーズ

- [x] spec-review（設計段階で検出可能だった）— 「count 系 Requirement に新サブコマンド追加時は count update を delta に含めること」を spec-reviewer が指摘すべき
- [ ] code-review（実装は仕様変更にぶら下がるため、code-review の責務外）
- [x] verification（archive 前に `openspec validate <change>` を流せば fail を事前検出可能）

### レビュー観点の分析

| 対象 | ファイル | 該当観点の有無 | 詳細 |
|------|---------|-------------|------|
| code-review checklist | `code-review/references/checklist.md` | なし → ギャップ（ただし scope 外） | spec の delta 整合性は code-review の責務外 |
| spec-review criteria | `spec-review/references/review-criteria.md` | なし → ギャップ | 「Requirement header を MODIFY する場合は RENAMED + MODIFIED を併用する」「count を含む Requirement に項目追加する場合は count を必ず更新する」観点が未収録 |
| rules | `.claude/rules/review-standards.md` | なし → ギャップ | review-standards はカテゴリ・severity を定義するメタ規約であり、openspec 固有の delta 規約はここではなく spec-review 側が持つべき |
| verification | （工程） | なし → ギャップ | verification phase に `openspec validate <change>` を追加すれば fail を archive 前に捕捉できる |

### 改善アクション

本 request の **スコープ外**（request.md「補足 → スコープ外」に明記）。openspec-workflow 側の改善は別 request として上げる前提で、ここでは下記をギャップとして記録するに留める:

| アクション | 対象ファイル | 追加内容 | ステータス |
|-----------|------------|---------|----------|
| spec-review criteria に Requirement header 変更時の RENAMED+MODIFIED ルールを追加 | `openspec-workflow` 側 `spec-review/references/review-criteria.md` | 「MODIFIED で header (`### Requirement: ...`) を変える場合は RENAMED Requirements を併記すること。MODIFIED 単独では openspec archive 時に "header not found" で fail する」 | deferred（別 request） |
| `tests/pipeline-integration.test.ts` の mock を tempDir へ書くよう修正 | `tests/pipeline-integration.test.ts:14, 35` | `process.cwd()` ではなく test setup の `tempDir` を使う。closure scope の関係で mock 内 `tempDir` 参照は hoist 問題があるため、`process.env["SPECRUNNER_TEST_CWD"]` 等で受け渡す必要あり | applied（応急策: .gitignore） / deferred（根本: mock 修正） |
| spec-review criteria に count 整合性チェックを追加 | `openspec-workflow` 側 `spec-review/references/review-criteria.md` | 「Requirement header / body / Scenario に count（数）を含む場合、新項目追加時は count を delta で必ず更新すること」 | deferred（別 request） |
| verification phase に `openspec validate <change>` を追加 | `openspec-workflow` 側 verification skill | archive 失敗を事前検出。--skip-specs で迂回しないとマージ不可なケースを CI で停止 | deferred（別 request） |

スコープ内では、本 cleanup の delta spec 自体が「RENAMED + MODIFIED 併用」の正例として残るため、後続 request で spec-review/verification 改善の参照例として活用できる。
