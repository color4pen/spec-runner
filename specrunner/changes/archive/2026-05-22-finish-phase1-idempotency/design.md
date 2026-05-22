# Design: finish Phase 1 spec-merge idempotency

## Problem

`mergeSpecsForChange` は change folder 不在時に `fs.readFile(request.md)` で ENOENT → escalation に変換し Phase 1 全体を crash させる。`archiveChangeFolder` は同条件で `{ ok: true, skipped: true }` を返す冪等 skip を持つが、`mergeSpecsForChange` にはこのガードがない。

Phase 1 が spec-merge → archive → commit の順で実行されるため、1 回目の finish で archive 済み → 2 回目の finish で spec-merge が先に死に、Phase 3 merge に到達できない。

## Solution

`mergeSpecsForChange` の先頭（`fs.readFile(request.md)` の前）に change folder 不在チェックを追加し、不在なら `{ ok: true, skipped: true }` を返す。`archiveChangeFolder` と同じパターン。

### 変更箇所

**`src/core/finish/spec-merge.ts` — `mergeSpecsForChange` 関数**

`readFile` の try/catch を分解し、ENOENT を skip に、parse エラーを escalation に振り分ける:

```
// 現在: readFile + parse を同一 try/catch で包み、全 catch → escalation
// 修正後:
const changeFolderAbsPath = path.join(cwd, changeFolderPath(slug));
const changeFolderExists = await fs.exists(changeFolderAbsPath);
if (!changeFolderExists) {
  return {
    ok: true,
    skipped: true,
    message: "spec-merge skipped: change folder not found",
  };
}
// 以降: readFile + parse（change folder 存在が保証された状態）
```

### 判断: `fs.exists(changeFolder)` vs ENOENT code 判別

`archiveChangeFolder` が `fs.exists` パターンを使っているため揃える。ENOENT code を `catch` 内で分岐する方式は Node の error code 判別の煩雑さ（`err.code` 型ガード）を持ち込むだけで利点がない。

### orchestrator への変更

不要。`runPhase1Archive` は既に各ステップの `ok/skipped` をチェックして分岐しており、spec-merge が `skipped: true` を返せば archive → commit も自然に skip する（archive は自前の不在チェックで skip、commit は staged changes なしで skip）。

### テスト

1. **unit**: `mergeSpecsForChange` に change folder 不在ケースのテストを追加（TC-SM-069）
2. **unit**: `mergeSpecsForChange` に request.md parse 不能ケースのテストを追加（TC-SM-068）— 従来 escalation が維持されることの regression guard
3. **integration**: TC-103 の `readFile` mock を修正し、change folder 不在時に request.md が ENOENT を投げるようにする（現在は mock が常に valid content を返すため bug を隠している）
