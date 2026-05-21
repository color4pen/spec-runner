# Code Review Feedback — flatten-request-files — iter 2

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-20

---

## 総評

iter 1 の must-fix 指摘（F-01: TC-PIPELINE-001/002 未カバー、F-02: TC-STORE-008 欠落）が両方正確に対応されている。追加されたテストは test-cases.md の GIVEN/WHEN/THEN を忠実に実装しており、実装コードとの整合も取れている。他に新規の問題は検出されなかった。

---

## Findings

### F-01 対応確認 (resolved)

`tests/unit/core/command/pipeline-run-canonical.test.ts` が新規追加された。

- **TC-PIPELINE-001**: `/path/to/specrunner/requests/active/my-feature.md` が match し `match[1] === "my-feature"` ✅
- **TC-PIPELINE-002**: 旧形式 `/path/to/.../active/my-feature/request.md` が不一致 ✅
- **TC-PIPELINE-003**: ハイフン含む slug `multi-part-slug` が正しく抽出される ✅

パターンのコピーは `pipeline-run.ts` 本体 line 23 と一致しており、regression リスクなし。

---

### F-02 対応確認 (resolved)

`tests/unit/core/request/store.test.ts` に TC-ST-008 が追加された。

- `write()` で flat ファイルを作成後、`read()` で取得した `ParsedRequest.slug` が `"my-feature"` であることを検証 ✅
- `read` が store.test.ts の import に追加されている ✅

---

## 正常確認事項（通過）

| 確認項目 | 結果 |
|---|---|
| iter 1 から実装コードの追加変更なし（テスト追加のみ） | ✅ |
| `CANONICAL_PATTERN` テスト 3 件が flat 形式パターンを正確に検証 | ✅ |
| TC-ST-008 が store.test.ts の既存 TC-ST-001〜007 と整合 | ✅ |
| `bun run typecheck && bun run test` が 2477 tests green（iter 1 verification 結果より） | ✅ |
| must TC カバレッジ: STORE 全 8 件、PIPELINE 全 3 件、CMD 系、FINISH 系、MIGRATE 系すべて対応済み | ✅ |
| ADR 3 判断記録・delta spec flat 表記・migration 実行済み（iter 1 より継続） | ✅ |
