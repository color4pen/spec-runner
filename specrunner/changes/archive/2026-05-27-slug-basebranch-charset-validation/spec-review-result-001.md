# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## Summary

設計・タスク・spec の方向性は正しく、セキュリティ上の問題を的確に捉えている。ただし design.md D3 に記載された `BASE_BRANCH_REGEX` が実際に要件を満たさない不正なパターンであり、tasks.md / spec.md の正しい定義と矛盾している。この不整合を放置すると実装者が誤ったパターンを採用するリスクがある。

---

## Findings

### [MUST FIX] design.md D3 の `BASE_BRANCH_REGEX` が誤っている

**場所**: `design.md` セクション D3

**問題**:

design.md D3 に記載された正規表現:

```
BASE_BRANCH_REGEX = /^[A-Za-z0-9._/-]+$/
```

この正規表現はキャラクタクラス内に `-` を含むため、**先頭が `-` の文字列（`-flag` 等）を許容してしまう**。`--upload-pack=evil` は `=` を含むため偶然 reject されるが、`-flag` は reject されない。

tasks.md T-01 および spec.md の正しい定義:

```
BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/
```

こちらは先頭文字に `-` を含まないキャラクタクラスを使うため、`-flag` を正しく reject する。

**影響**: 実装者が design.md を参照した場合、`-flag` を受け入れる誤ったパターンを実装してしまう。T-08 の受け入れ基準（`baseBranch: "-flag"` → error violation）を満たせない。

**修正**: design.md D3 の `BASE_BRANCH_REGEX` を以下に修正する。

```
BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/
```

---

## Confirmations (問題なし)

- **脅威モデル**: path traversal / git option injection のリスク分析が正確。spawn() は配列引数なのでシェルインジェクションリスクはなく、option injection のみが残存リスク。
- **D4（`--` セパレータ不採用）**: charset validation で先頭 `-` を排除するため、git option injection は到達しない。reasoning は妥当。
- **SLUG_REGEX**: `^[a-z0-9][a-z0-9-]{0,63}$` は全 3 ファイルの現行定義と一致し、共有定数化のスコープも正確。
- **tasks.md / spec.md の整合性**: T-01 の `BASE_BRANCH_REGEX` 定義、T-02〜T-03 の実装スニペット、spec.md の scenario はすべて整合している。
- **既存テスト互換性**: D5 の分析通り、`makeRaw()` デフォルト値（`slug: "my-slug"`, `baseBranch: "main"`）はいずれも新 regex に適合する。
- **セキュリティ（OWASP A03 Injection）**: parser レイヤーでの charset validation は injection 対策として適切な防御位置。手書き request.md バイパス経路の閉鎖は要件を満たす。
- **エラーメッセージの情報漏洩**: ローカル CLI ツールであり、slug / filePath は呼び出し元が制御するため、エラーメッセージへの値の埋め込みは許容範囲。

---

## Required Fix

`specrunner/changes/slug-basebranch-charset-validation/design.md` の D3 セクションを修正する。

```diff
-**決定: `BASE_BRANCH_REGEX = /^[A-Za-z0-9._/-]+$/`**
+**決定: `BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/`**
```

修正後、tasks.md・spec.md との整合が取れる。
