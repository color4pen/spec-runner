# Spec Review Result: finish-hint-actionable-fallback

- **verdict**: needs-fix
- **date**: 2026-05-20
- **reviewer**: spec-reviewer

---

## Summary

Task 1・2 の hint 書き換え方針は正しい。`specrunner rm` が `ALLOWED_STATUSES` で `failed`/`terminated` を許可済であることも確認済。Task 3 のテスト設計に regex バグがあり、そのままでは core fix（`rm` コマンドへの誘導）を一切検証できない no-op テストになる。

---

## Findings

### [MUST] Task 3 の regex が `'specrunner rm <jobId>'` にマッチしない

**場所**: `design.md` D2、`tasks.md` Task 3

**問題**:

提案されている正規表現 `/'specrunner (\w+)'/g` は、クォート内に引数が含まれる形式（`'specrunner rm <jobId>'`）にマッチしない。

```
'specrunner rm <jobId>'
 ^---------^            → 'specrunner ' はマッチ
             ^^         → \w+ は 'rm' をキャプチャ
               ^        → 次を ' と期待するが ' ' (スペース) が来る → マッチ失敗
```

結果として、Task 3 のテストは：

- `STATUS_HINTS["failed"]` / `STATUS_HINTS["terminated"]` → `rm` が抽出されず、assertion が発生しない（trivially pass）
- `pollTimeoutError` → `resume` のみ抽出、`rm` は抽出されない

**影響**: 将来 `rm` を別のコマンド名に誤記しても、このテストは通過する。テストの目的（"未実装コマンドへの誘導を構造的に catch"）が達成できない。

**修正案**:

クォートで囲まれた表現全体ではなく、`specrunner <verb>` パターンをスペース以降無視してマッチする regex に変更する:

```ts
// 変更前
/'specrunner (\w+)'/g

// 変更後: クォート内に引数があってもコマンド verb を抽出できる
/'specrunner (\w+)(?:\s[^']*)?' | 'specrunner (\w+)/g
```

または単純に:

```ts
/specrunner (\w+)/g
```

（hint 文字列は `specrunner` を CLI 名として使う文脈しか存在しないため、クォートへの依存は不要）

シンプルな `/specrunner (\w+)/g` への変更を推奨する。design.md D2 と tasks.md Task 3 双方の修正が必要。

---

## Non-blocking observations

### [INFO] 既存テストへの影響なし（design.md D3 の分析は正確）

`tests/finish-job-state.test.ts` の失敗/終了テストはすべて `.toThrow(/failed/)` / `.toThrow(/terminated/)` で `Error.message`（`SpecRunnerError` 第 3 引数）をマッチしており、hint 変更の影響を受けない。設計判断 D3 は正確。

### [INFO] `specrunner cancel` の出現箇所は本 request で網羅されている

`src/` 内の `specrunner cancel` 参照は `src/errors.ts:226` と `src/core/finish/job-state-update.ts:17-18` の計 3 箇所のみ（grep 確認済）。本 request のスコープで全廃できる。

### [INFO] セキュリティ観点での問題なし

変更対象はエラーメッセージ文字列のみ。認証・入力バリデーション・API 境界への影響なし。OWASP Top 10 該当なし。

---

## 修正指示

`design.md` D2 と `tasks.md` Task 3 の regex を `/specrunner (\w+)/g` に書き換えること。それ以外の変更は不要。
