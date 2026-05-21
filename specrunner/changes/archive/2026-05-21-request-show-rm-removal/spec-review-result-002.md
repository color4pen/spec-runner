# Spec Review Result: request-show-rm-removal

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## 前回レビュー（001）からの進捗

| 前回指摘 | 状態 |
|---|---|
| [BLOCKER] slug validation Requirement ヘッダー不一致 | ✅ 修正済み（案 A を適用）|

slug validation Requirement のヘッダーが baseline と完全一致するよう修正された。本文は `new / validate / review` のみに限定、Scenario も適切に存在する。

---

## Findings

### [BLOCKER] `（drafts パス対応）` Requirement 内の `request show` 孤立 Scenario

**場所**: `specrunner/specs/cli-commands/spec.md` line 565-593 （baseline）

**問題**:

baseline の `### Requirement: \`specrunner request\` サブコマンド群が動作する（drafts パス対応）` には以下 2 つの Scenario が含まれる。

```
#### Scenario: `specrunner request show <slug>` が request.md を表示する
#### Scenario: `specrunner request show <slug>` が旧 path を fallback で解決する
```

この Requirement は delta spec の `## Requirements` にも `## Removed` にも登場しない。`mergeSpecsForChange` は未言及の Requirement をそのまま残すため、merge 後の baseline に **削除されたコマンドを説明する Scenario が残存する**。

結果として merged baseline は:
- `## Removed` で `request show` を削除済みと宣言する
- `（drafts パス対応）` Requirement の Scenario で `request show` の動作を説明する

という矛盾した状態になる。

**修正方法**:

delta spec の `## Requirements` に `（drafts パス対応）` の MODIFIED 版を追加し、`request show` 関連の 2 Scenario を除去する（`request validate` / `request review` の Scenario は維持する）。

ヘッダーは baseline と完全一致させること（MODIFIED として自動分類されるため）:

```markdown
### Requirement: `specrunner request` サブコマンド群が動作する（drafts パス対応）

drafts/ 化後、slug ベースのサブコマンドは MUST `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する
```

---

### [MINOR / 情報] `（drafts テーブル更新）` MODIFIED に Scenario なし

**場所**: `specrunner/changes/request-show-rm-removal/specs/cli-commands/spec.md` — `specrunner request` サブコマンド群が動作する（drafts テーブル更新）

rules.md では `## Requirements` 配下の MODIFIED 対象にも最低 1 つの Scenario が必須とされているが、この Requirement には Scenario が存在しない。

ただし baseline 版（line 594）も Scenario なしのテーブル専用 Requirement であり、delta-spec-validation-result が approved を返している。既存の baseline quality 問題の継承であり、本変更が新たに導入した問題ではないため、実装ブロックとしない。

---

## セキュリティ評価

前回レビューと変わらず問題なし。削除方向の変更であり新たな攻撃対象領域を生じさせない。slug validation の `（MODIFIED）` 適用後も `new / validate / review` の path traversal 防止 regex は維持されている。

---

## 修正必要箇所サマリー

| # | ファイル | 修正内容 |
|---|---|---|
| 1 | `specrunner/changes/request-show-rm-removal/specs/cli-commands/spec.md` | `（drafts パス対応）` Requirement の MODIFIED 版を `## Requirements` に追加し、`request show` 関連 Scenario 2 件を除去する |
