# Spec Review Result: flatten-request-files

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-20

---

## 総評

request / design / tasks の三点セットは整合的で実装タスクの粒度も適切。セキュリティ観点（path traversal 防止・slug validation）も十分に織り込まれている。

唯一のブロッカーは **delta spec の網羅性不足**。baseline `specrunner/specs/cli-commands/spec.md` に旧 dir 形式のパスを参照しているシナリオが 3 件残っており、delta spec に反映されていない。

---

## 指摘事項

### [MUST] delta spec が baseline の 3 シナリオを更新していない

現状の delta spec (`specs/cli-commands/spec.md`) は `request new` / `request show` / `request rm` の 3 Requirements を更新しているが、baseline spec 内に旧パス (`active/<slug>/request.md`) を参照している以下のシナリオが残っている。

**1. `request validate` シナリオ（baseline line 455-458）**

```
#### Scenario: `specrunner request validate <slug>` が slug で解決する
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として validation を実行する
```

→ `specrunner/requests/active/my-feature.md` に更新が必要。

**2. `request review` シナリオ（baseline line 460-463）**

```
#### Scenario: `specrunner request review <slug>` が slug で解決する
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象としてレビューを実行する
```

→ `specrunner/requests/active/my-feature.md` に更新が必要。

**3. `job start <slug>` シナリオ（baseline line 491-494）**

```
#### Scenario: `specrunner job start <slug>` で pipeline を起動する
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として pipeline を開始する
```

→ `specrunner/requests/active/my-feature.md` に更新が必要。

また、baseline の `specrunner request` サブコマンド群 Requirement 内の以下のシナリオも旧パスを参照している（line 451-453）:

```
#### Scenario: `specrunner request show <slug>` が request.md を表示する
- **THEN** `specrunner/requests/active/my-feature/request.md` の本文を stdout に出力し exit code 0 で終了する
```

delta spec の `request show` Requirement は正しく更新されているが、このシナリオ（`request` サブコマンド群 Requirement の中のシナリオ）は別ブロックにあり更新漏れとなっている。

**修正方法**: delta spec に上記 3〜4 シナリオ分の更新を追加する。対象 Requirement は:
- `specrunner request` サブコマンド群が動作する（show / validate / review シナリオ）
- `specrunner job` サブコマンド群が動作する（job start slug シナリオ）

---

## 確認済み（問題なし）

### request / design 整合性
- flat 化の動機・設計判断（DJ-1〜DJ-5）が明確に記述されている ✅
- `changes/<slug>/request.md` を固定名のまま維持する理由が設計判断 DJ-2 に明記されている ✅
- スコープ外の明示（`changes/archive/` の過去 snapshot 不変・拡張子柔軟化除外）が適切 ✅

### タスク網羅性
- store.ts の全関数（resolve / list / write / checkSlugCollision）が Task 1 で対応 ✅
- `CANONICAL_PATTERN` 正規表現更新が Task 2 で対応 ✅
- CLI コマンド（new / rm / show / validate / review）が Task 3 で対応 ✅
- finish 系（move-requests-dir.ts / resolve-target.ts）が Task 4 で対応 ✅
- migration 関数が Task 5 で実装（extra files がある dir の partial migration も考慮済み）✅
- テスト更新が Task 6 で対応（migration unit test 追加含む）✅
- ADR が Task 8 で予定 ✅

### セキュリティ
- slug validation (`/^[a-z0-9][a-z0-9-]{0,63}$/`) が request-rm.ts に維持されており path traversal を防止 ✅
- migration script は既知サブディレクトリ（`active/` / `merged/`）のみを走査し、ユーザー入力によるパス操作はない ✅
- `checkSlugCollision` は `readdir` の結果に対して `.md` 拡張子マッチを行うのみで外部入力のパス注入リスクなし ✅
- 認証・外部 API に影響するコード変更なし ✅

### 設計の一貫性
- migration の copy-then-delete（非アトミック）は 1 回限りの migration ツールとして許容範囲 ✅
- `detectSlugFromCwd` のパターンを残す判断（tasks）と更新する判断（design）の軽微な不一致は、いずれにせよ flat 化後に unused path となるため harm なし ✅

---

## 修正サマリー

delta spec に以下を追加:

1. `specrunner request` サブコマンド群 Requirement 内の `show` シナリオを flat パスに更新
2. `specrunner request` サブコマンド群 Requirement 内の `validate` シナリオを flat パスに更新
3. `specrunner request` サブコマンド群 Requirement 内の `review` シナリオを flat パスに更新
4. `specrunner job` サブコマンド群 Requirement 内の `job start <slug>` シナリオを flat パスに更新
