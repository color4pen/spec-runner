# Spec Review Result: request-show-rm-removal

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## Findings

### [BLOCKER] delta spec — slug validation Requirement の header 不一致

**場所**: `specrunner/changes/request-show-rm-removal/specs/cli-commands/spec.md` — `## Requirements` 内

**問題**:

delta spec の slug validation Requirement ヘッダーが baseline と一致しない。

| | ヘッダー |
|---|---|
| **delta spec** | `### Requirement: \`request new\` / \`request validate\` / \`request review\` は slug validation を実行する` |
| **baseline** (line 551) | `### Requirement: \`request new\` / \`request show\` / \`request rm\` / \`request validate\` / \`request review\` は slug validation を実行する` |

rules.md の規律:
> baseline に存在する Requirement を変更する場合、`### Requirement:` header が baseline と完全一致すること（一致した場合 tool が MODIFIED に自動分類する）

header が一致しないため、tool はこれを **ADDED** と分類する。その結果:

1. 旧 Requirement（`show` / `rm` を含む）が baseline に **REMAIN** し続ける（`## Removed` にも記載がない）
2. 新 Requirement が重複 **ADDED** される
3. merge 後の baseline に slug validation に関する矛盾する 2 つの Requirement が共存する

**修正方法（2案のいずれか）**:

**案 A（推奨）**: `## Requirements` 内のヘッダーを baseline と完全一致させる。

```markdown
### Requirement: `request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する

**Replaces**: 「`request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する」

`request new <slug>` / `request validate <slug>` / `request review <slug>` は slug 入力に対し MUST ...
```

（ヘッダーは旧名のまま、本文で show/rm を削除した内容に書き換える。tool が MODIFIED として処理する）

**案 B**: `## Removed` に旧 Requirement 名を追加し、新ヘッダーは ADDED として扱う。

```markdown
## Removed

- "`specrunner request show <slug>` は request.md の本文を表示する"
- "`specrunner request rm <slug>` は drafts 配下から request を削除する"
- "`request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する"
```

---

### [MINOR / 情報] validation-tc.test.ts が request.md の要件に未記載

**場所**: `design.md` の Affected Files / `tasks.md` Task 4

design.md と tasks.md は `tests/unit/core/command/validation-tc.test.ts` (TC-46〜TC-48) の削除を正しく捉えているが、request.md の要件リストには記載がない。

削除対象コマンドのテストクリーンアップとして設計上の必然であり、実装ブロックではない。request.md の要件として明示すると将来の参照性が上がるが、今回のレビューでは修正必須扱いとしない。

---

## セキュリティ評価

`request show` / `request rm` の削除は攻撃対象領域を縮小する方向であり、新たなセキュリティリスクを導入しない。slug validation の MODIFIED 後も path traversal 防止の regex は維持されているため、残存コマンド（`new` / `validate` / `review`）の保護は継続される。

---

## 修正必要箇所サマリー

| # | ファイル | 修正内容 |
|---|---|---|
| 1 | `specrunner/changes/request-show-rm-removal/specs/cli-commands/spec.md` | slug validation Requirement のヘッダーを baseline と完全一致させる（案 A）、または旧 Requirement 名を `## Removed` に追加（案 B） |
