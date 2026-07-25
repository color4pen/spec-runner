# Regression Gate Result — Iteration 1

## Evidence

### [LOW] docs manual contract テストのファイル名が未特定

**Finding**: tasks.md の「テストの取り扱い」節で docs manual contract テストのファイル名が未定だった。

**Verification**: `git diff main...HEAD -- specrunner/changes/test-materialize-existing-coverage/tasks.md` で確認。

該当行（tasks.md L87）:

```
- docs manual contract（新規 `tests/unit/docs/test-coverage-manual-contract.test.ts`、既存 docs-contract を壊さない追加）:
```

推奨ファイル名 `tests/unit/docs/test-coverage-manual-contract.test.ts` が明示されており、他 2 件（`test-coverage-manual-exclusion.test.ts` / `test-materialize-manual-scope-contract.test.ts`）と同形式で一貫している。

**Result**: FIXED — 回帰なし
