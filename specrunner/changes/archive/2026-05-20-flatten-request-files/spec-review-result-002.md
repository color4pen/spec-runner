# Spec Review Result: flatten-request-files (002)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-20
- **prior-review**: spec-review-result-001.md (needs-fix)

---

## 総評

spec-review-result-001.md で指摘した **delta spec 4 シナリオの更新漏れ** がすべて解消されている。request / design / tasks の整合性・セキュリティ観点に新たな問題なし。

---

## 001 指摘事項の解消確認

### [MUST] delta spec が baseline の 3〜4 シナリオを更新していない → **解消済み ✅**

001 が指摘した 4 箇所はすべて delta spec に追加されている。

| 指摘シナリオ | baseline 旧パス | delta での対応 |
|---|---|---|
| `request show`（サブコマンド群 Requirement） | `active/my-feature/request.md` | 新 Requirement「request サブコマンド群が動作する（flat パス対応）」の show シナリオ |
| `request validate` | 同上 | 同 Requirement の validate シナリオ |
| `request review` | 同上 | 同 Requirement の review シナリオ |
| `job start <slug>` | 同上 | 新 Requirement「job サブコマンド群が動作する（flat パス対応）」の job start シナリオ |

delta spec の新 Requirement 構成:
1. `request new` — flat パス更新 ✅
2. `request show` — flat パス更新 ✅
3. `request rm` — flat パス更新 ✅
4. `specrunner request サブコマンド群が動作する（flat パス対応）` — show / validate / review の 3 シナリオ ✅
5. `specrunner job サブコマンド群が動作する（flat パス対応）` — job start シナリオ ✅

delta-spec-validation-result.md も `approved` を返している。

---

## 確認済み（問題なし）

### request / design / tasks の整合性

- store.ts の 4 関数（resolve / list / write / checkSlugCollision）が Task 1 で網羅 ✅
- `CANONICAL_PATTERN` 正規表現更新が Task 2 で対応 ✅
- CLI コマンド（new / rm / show、validate / review は store.resolve() 経由で自動）が Task 3 で対応 ✅
- finish 系（move-requests-dir.ts / resolve-target.ts）が Task 4 で対応 ✅
- migration 関数が Task 5 で実装（extra files の partial migration も考慮）✅
- tests が Task 6 で対応（migration unit test 追加含む）✅
- ADR が Task 8 で予定 ✅
- migration 実行が Task 9 に明示 ✅

### セキュリティ

- slug validation regex `/^[a-z0-9][a-z0-9-]{0,63}$/` が request-rm.ts に維持され path traversal を防止 ✅
- migration script は hardcoded サブディレクトリ（active / merged）のみを走査。ユーザー入力によるパス操作なし ✅
- `checkSlugCollision` は readdir 結果に `.md` 拡張子マッチするのみ。外部入力の直接パス注入リスクなし ✅
- 認証・外部 API に影響するコード変更なし ✅
- OWASP Top 10 該当項目なし ✅

### その他設計観点

- `detectSlugFromCwd` の design（更新）vs tasks（互換性のため残す）の軽微な不一致は 001 で「harm なし」確認済み ✅
- migration の copy-then-delete（非アトミック）は 1 回限りの migration ツールとして許容範囲 ✅
- `changes/<slug>/request.md` を固定名で維持する設計判断（DJ-2）が ADR 対象として明記されている ✅

---

## 注記（非ブロッカー）

Task 9 の migration 実行方法が「finish 時の merge commit に含める形で実行する」と設計に記載されているが、具体的な実行トリガーが tasks.md 上では明示されていない。実装者が Task 9 を手動実行するものと解釈して進めることが想定される。スコープ内の実行であるため blocking はしないが、実装時に確認が必要な点として記録する。
