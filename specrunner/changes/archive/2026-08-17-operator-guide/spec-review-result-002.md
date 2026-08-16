# Spec Review Result: operator-guide (iteration 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周指摘の解消確認（再指摘プロトコル準拠）

前周 4 件の finding を Read tool で現ファイルを読み直してから照合した。

| Finding | 前周指摘内容 | 現状 | 判定 |
|---------|------------|------|------|
| F-01 [HIGH] | TC-019 Priority "should" → "must" 昇格 | TC-019: `**Priority**: must` に変更済み | ✅ 解消 |
| F-02 [MEDIUM] | 全 9 topic body 非空の iterable 検証 TC 欠落 | TC-002 が GIVEN/WHEN/THEN 付き iterable 検証 must TC として定義済み | ✅ 解消 |
| F-03 [MEDIUM] | spec.md コマンド抽出の制限範囲が未記述 | Scenario: 本文コマンドが registry で解決される の Given 節に抽出対象制限を明記済み | ✅ 解消 |
| F-04 [LOW] | TC-003 Category "integration" が tasks T-06 の unit 配置と不一致 | TC-003: `**Category**: unit` に変更済み | ✅ 解消 |

### spec.md 全量確認

- 全 9 Requirement に `SHALL` または `MUST` の normative keyword が存在することを確認した。
- 全 9 Requirement にそれぞれ少なくとも 1 Scenario が存在し、Given/When/Then 構造を持つことを確認した（計 13 Scenario）。
- topic 列挙（jobs / merge / audit / setup / escalation / request / review / inject / inbox）が request.md 要件 2 の列挙と完全一致することを確認した。
- 「コマンド実在」Scenario: Given 節に抽出対象制限（backtick 内の完全形 `specrunner <tokens>` のみ。shorthand 表記や backtick 外は検証対象外）と When 節のコマンドパストークン抽出方法（先頭小文字語列、`<` `[` `-` `/` `.` で停止）が明記されていることを確認した。

### test-cases.md 全量確認

- TC 数: 21件。Summary の Total/Automated/Manual/Priority 内訳と一致（must: 19, should: 2, could: 0）。
- TC-011・TC-012 の "integration" 分類: `.claude/skills/` ファイルシステムへの実アクセスを伴うため適切。
- TC-019 Priority: must ✅（前周 high finding 解消確認）
- TC-002 の GWT 構造: 全 9 topic を iterate して各 body が空文字でないことを確認する設計 ✅（前周 medium finding 解消確認）
- TC-003 Category: unit ✅（前周 low finding 解消確認）
- Result YAML の計数が TC 実数と一致していることを確認した。

### design.md 整合性確認

- D1〜D6 の設計判断が spec.md の各 Requirement に対応していることを確認した。
- D3 の leaf モジュール制約（`canon-escalation.ts` は `guide.ts` を import しない）が TC-019 および tasks T-06 に対応付けられていることを確認した。
- D6 のコマンド抽出正規表現（先頭小文字語列、終端記号セット）と spec.md Scenario の記述が一致することを確認した。

### tasks.md 全量確認

- T-01〜T-06 の実装順序依存（T-05 は T-01 完了後）が正しく記述されていることを確認した。
- T-06 において TC-002 の「全 9 topic body 非空」が must レベルの歯として明示されていることを確認した。
- T-06 において TC-019 の「canon-escalation.ts が guide を import しない」が must レベルの設計不変条件として明示されていることを確認した。

### 現行 CLI との照合

`src/cli/command-registry.ts` の実装を精読し、guide 本文で言及されるすべてのコマンドが実在することを再確認した（前周の F-04 解消確認も含む）。

| コマンド | 実在確認 |
|---------|---------|
| `job start --detach` / `--issue` | ✓ |
| `job wait <slug>` | ✓（line 898-914） |
| `job archive --with-merge` | ✓（line 1172） |
| `job resume --apply-canon / --adopt-commits / --from / --force` | ✓（line 975） |
| `job reopen --from --reason`（`apply-canon / adopt-commits / detach` 不在） | ✓（line 1069〜1081 で `--from` と `--reason` が必須、他 flag なし） |
| `job cancel --restore-draft` | ✓（line 932） |
| `job prune --force` | ✓（line 1217） |
| `job attach --branch` | ✓（line 1125-1130） |
| `inbox run` | ✓ |
| `login --force` | ✓ |
| `credentials set` | ✓ |
| `doctor` | ✓ |
| `init` | ✓ |
| `request template / validate` | ✓ |
| `rules new <step> <slug>` | ✓ |
| `reviewers new <name>` | ✓ |
| `config effective [--type <t>]` | ✓ |

`generateTopLevelUsage()` の `groupOrder` は現時点で 7 グループ（"Request commands" 〜 "Aliases"）。設計 D2 の指示通り末尾に `"Guide"` を追加する形が実装可能な構造であることを確認した。

### セキュリティ観点

- ガイドコンテンツは静的 TS 定数。ネットワーク・repo 状態に非依存で path traversal / injection の経路がない。
- CLAUDE.md への自動書込なし（要件 4 明示制約、`init.ts` の現実装でも自動書込なし）。
- `credentials set` の echo 禁止は既存実装で担保済み。
- `--prompt` flag はガイドコンテンツ内の operator 向け操作指示として言及されるが、spec には記載方法の制限は明示されていない。operator 限定フラグとして適切な範囲。
- OWASP Top 10: 静的ドキュメント出力コマンドのため適用なし。

---

## 検証できなかった項目

- **guide 本文の prose 内容**: body は implementer が記述するため現時点では存在しない。body が request.md 要件 2 の各 topic 内容を正確に反映するかは implementer / code-review ステップで確認が必要。
- **D6 の抽出正規表現が全コマンドを正しく拾うか**: body が存在しないため実測不可。backtick 内完全形での記載方針（T-01 に明記）が遵守されることを前提とする。

---

## Findings 詳細

### 観察 O-01 [low] design.md に解消済み deferred コメントが残存する

**ファイル**: `specrunner/changes/operator-guide/design.md`（lines 172-174）

以下の HTML コメントが design.md に残っている:
```
<!-- spec-fixer-deferred: TC-019 Priority "should" → "must" への変更 ... -->
<!-- spec-fixer-deferred: TC-002 全 9 topic body 非空の iterable 検証追加 ... -->
<!-- spec-fixer-deferred: TC-003 Category "integration" → "unit" への変更 ... -->
```

これらのコメントは「test-cases.md の変更を deferred とした」ことを記録しているが、現在の test-cases.md にはこれら 3 件の変更がすべて適用済みである。HTML コメントのため実装や挙動には影響しないが、将来の spec-fixer が「deferred 未適用」と誤読するリスクがある。

実害が無く不可逆性もないため本報告の findings には含めない。実装ステップへの影響もない。
