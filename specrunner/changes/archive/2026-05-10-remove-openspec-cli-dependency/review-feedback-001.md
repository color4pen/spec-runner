# Code Review: remove-openspec-cli-dependency (Iteration 001)

## Summary

openspec CLI への全依存廃止を大規模かつ高品質に実装している。パス切り替え、propose prompt の template 化、finish/doctor の簡素化、dynamic-context の specs 廃止が的確に完了。typecheck green、全 1549 テスト green。ただし 3 箇所にテキスト残存（openspec CLI 参照 / proposal.md 参照）があり、受け入れ基準「コード実行パスから openspec 参照が消滅」を完全には満たしていない。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.85** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/prompts/propose-system.ts:179 | セキュリティセクションに `openspec CLI での change folder 生成` の記述が残存。propose agent への injection 防御文中で openspec CLI を role として参照しており、受け入れ基準「PROPOSE_SYSTEM_PROMPT に openspec の文字列が含まれない」(TC-006) に違反 | `あなたの役割（openspec CLI での change folder 生成 + commit/push）` → `あなたの役割（change folder の設計・生成 + commit/push）` に修正 |
| 2 | HIGH | correctness | src/core/step/spec-fixer.ts:52 | `proposal.md or design.md` と記述されており、proposal.md への参照が残存。request.md 要件8「proposal.md への参照がプロンプト内に残っていない」に違反。spec-fixer agent が存在しないファイルを参照する指示になっている | `proposal.md or design.md` → `design.md` に修正（proposal.md は生成されなくなったため） |
| 3 | MEDIUM | maintainability | src/core/finish/branch-checkout.ts:24 | JSDoc コメントに `Used before Check 5+6 so that openspec validate runs in the feature branch.` が残存。Check 6（openspec validate）は削除済みのため古い記述 | `Used before Check 5 so that preflight runs in the feature branch.` に更新 |
| 4 | MEDIUM | maintainability | src/git/dynamic-context.ts:27-29 | interface の JSDoc コメントに `openspec/specs/` と `openspec/changes/` のリテラルが残存。`CHANGES_DIR` は `specrunner/changes` に変更済みだがコメントが未更新 | `specsList` → `specrunner/specs/` (or R3 で削除予定のため `(deprecated)` 追記)、`changesList` → `specrunner/changes/` に更新 |
| 5 | MEDIUM | maintainability | src/core/step/pr-create.ts:9 | Design D5 コメントに `openspec/changes/<slug>/pr-create-result.md` が残存。実際のパスは `specrunner/changes/` に切り替わっている | `specrunner/changes/<slug>/pr-create-result.md` に更新 |
| 6 | LOW | correctness | src/core/finish/archive-change-folder.ts:46 | `git mv` 実行前に `specrunner/changes/archive/` ディレクトリの存在確認・作成が行われていない。`git mv` は移動先の親ディレクトリが存在する必要がある。初回 archive 時に `archive/` ディレクトリが未作成だと失敗する可能性がある | `git mv` の前に `await fs.mkdir(path.join(cwd, changesDirRel(), "archive"), { recursive: true })` を挿入する。または `git mv` は親 dir が存在しなくても成功する（git は自動作成する）ことを確認した上でコメントを追加 |

## Verdict

- **verdict**: needs-fix

**理由**: HIGH severity の findings が 2 件（#1, #2）存在。いずれもプロンプト文字列内の残存参照であり、受け入れ基準に直接違反する。修正は各 1 行のテキスト変更で済む。

## Test Coverage (Scenario Coverage)

test-cases.md の must シナリオ 50 件のうち:
- TC-001〜TC-005 (paths): ✅ テスト実装済み
- TC-006〜TC-011 (propose prompt): ✅ テスト実装済み（ただし #1 が残存するため TC-006 は実質 FAIL）
- TC-012〜TC-017 (finish archive): ✅ テスト実装済み
- TC-018〜TC-019 (preflight): ✅ テスト実装済み
- TC-020〜TC-022 (doctor): ✅ テスト実装済み
- TC-023〜TC-024 (dynamic-context): ✅ テスト実装済み
- TC-025〜TC-027 (proposal.md 除去): ⚠️ src/prompts/ は clean だが src/core/step/spec-fixer.ts に残存（#2）
- TC-028〜TC-030 (request.md コピー): ✅ 実装済み（テストは local/managed 双方で git add 呼び出し確認）
- TC-031〜TC-033: ✅ テスト実装済み
- TC-035 (openspec 実行パス消滅): ⚠️ #1 の残存により部分的 FAIL
- TC-036〜TC-037 (typecheck / test): ✅ green
- TC-050 (openspec/changes/ リテラル): ⚠️ コメント内に残存（#4, #5）— ただしこれはコメントのみで TC-050 の除外条件に該当する可能性あり
