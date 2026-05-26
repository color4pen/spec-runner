# Spec Review Result: test-isolation-guard

- **verdict**: approved
- **reviewer**: spec-review agent
- **date**: 2026-05-26

---

## Summary

設計の核心（compile-time guard + runtime safety net の二重防御）は正しく、prod code に test 知識を入れない方針も一貫している。spec.md の要件・シナリオは受け入れ基準をカバーしており、実装可能な粒度に分解されている。

以下の所見はいずれも `needs-fix` には至らない。implementer への注意点として記録する。

---

## Findings

### F1: Task 5 の `git rm` は機能しない（低重大度）

**場所**: `tasks.md` Task 5

`.specrunner/jobs/` は `.gitignore` により `git` 管理対象外 (`.specrunner/*` + `!.specrunner/config.json` の構成)。`git ls-files .specrunner/jobs/` は空を返し、git log にも履歴がない。つまり、test 由来 fixture は git-tracked ではなく純粋なローカルファイル。

`git rm` は "not found" エラーで終わる。正しい操作は `rm`（または `rm -f`）。

**影響**: task 5 を実行するとエラーになるが、`bun run test` は通る（既にファイルが存在しないか、存在しても test は tempDir を使うため）。実装者が `rm` に読み替えれば解消。

### F2: 件数の軽微な不一致（情報）

- request.md: "47 件混入"、"15 test file が fail する"
- design.md / tasks.md / spec.md: "46 件"、"14 test file"

実コードの grep 結果（`tests/helpers/store-factory.ts` 本体を除く）は 14 ファイルで design の数字と一致。main repo の `.specrunner/jobs/` は現時点で UUID 形式 17 件のみ（非 UUID 46 件はローカル環境で既に消えているか、ワークツリー未存在）。実装上の支障はないが記録する。

### F3: spec.md シナリオの GIVEN が固定カウント（情報）

**場所**: `specs/test-isolation-guard/spec.md`、"非 UUID 形式の fixture が削除される" シナリオ

GIVEN として "UUID 形式 16 件 + 非 UUID 形式 46 件" が hardcode されている。実装時点で main repo の UUID ファイルは 17 件に増えているため、シナリオの前提が現実と一致しない。

THEN 節（UUID を維持、非 UUID を削除）の論理自体は正しく、受け入れ基準も "固定カウントではなく criteria で検証" と明示されているため問題の実害はない。シナリオの GIVEN は記述当時の snapshot として読むべき。

---

## Security

- prod code への変更なし（`src/` は不変）
- globalSetup は test 環境限定、prod path への読み取りのみでの検出ロジック
- 入力検証・認証・OWASP Top 10 の懸念事項なし

---

## Design Assessment

| 設計判断 | 評価 |
|---------|------|
| D1: `defaultStoreFactory` 削除（compile-time guard） | ✅ "判断する場面を消す" 原則と完全整合 |
| D2: 14 test file を `makeStoreFactory(tempDir)` に移行 | ✅ 移行対象・パターンが具体的で実装可能 |
| D3: UUID v4 で本物 / test 由来を区別 | ✅ `randomUUID()` の事実に基づく客観的基準 |
| D4: globalSetup で runtime safety net | ✅ compile-time + runtime の二重防御として正当 |
| D5: prod spec (job-state-store) を変更しない | ✅ test infrastructure は spec 対象外で正しい |
