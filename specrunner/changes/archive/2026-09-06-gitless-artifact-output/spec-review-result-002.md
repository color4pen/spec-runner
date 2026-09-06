# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

| ファイル | 確認内容 |
|---|---|
| `design.md` | D1〜D16 全決定（前周 F-2 の dir エントリ byte 表現修正・前周 F-1 の step 7 frozen snapshot 再利用修正を中心に再読） |
| `spec.md` | 全 Requirement（12 件）と Scenario 群。前周 F-3（reviewer drift シナリオ追加）・前周 F-4（escape symlink シナリオ）の解消を確認 |
| `tasks.md` | T-01〜T-12 の実装タスクと AC。前周 F-4（T-06 AC 追加・T-10 escape symlink ケース追加）・前周 F-5（T-10 AC に削除 hunk 確認追加）の解消を確認 |
| `test-cases.md` | TC-001〜TC-078。新設 TC-077（review drift）・TC-078（escape symlink fail-closed）・削除 hunk 確認（TC-021 / T-10 AC）の整合を確認 |

### 前周 finding 解消状況の確認

| 前周 finding | 解消確認 | 根拠 |
|---|---|---|
| F-1（HIGH）: T-09 step 7 frozen snapshot 再利用未規定 | ✅ 解消 | T-09 step 7 に「step 6 の revision 束縛が返した frozen candidate snapshot を再利用する（candidate を再走査しない）」と明記。AC にも「change set 導出に使った candidate digest が verification record の bound digest と等しい」を追加 |
| F-2（MEDIUM）: dir エントリの hash byte 表現未規定 | ✅ 解消 | D3 に「`dir\0<path>\040000\0\n` を唯一の正規形、`\0` 省略形式は不正」と明示。T-02 も同形式を採用し「唯一の正規形として実装し混在させない」と規定 |
| F-3（MEDIUM）: reviewer revision drift シナリオ欠落 | ✅ 解消 | spec.md に「Scenario: Candidate mutation during review halts the run」追加。D10 Requirement も「before review」と「after each of them」で対称化。TC-077 も追加 |
| F-4（MEDIUM）: escape symlink テストカバレッジ欠落 | ✅ 解消 | T-10 に「escape symlink fail-closed ケース」追加。T-06 AC に「materialize 後の candidate に candidate root 外を指す symlink が存在しない」追加。TC-078 追加 |
| F-5（LOW）: T-10 AC に削除 hunk 確認が欠落 | ✅ 解消 | T-10 AC に「成功ケースで `changes.patch` に削除 hunk が存在する（deleted entry の patch 表現が end-to-end で欠落しない。TC-021 の integration 分類の意図を縦断で充足する）」を追加 |

### 今回の新規検証ポイント

- **D8 patch 分類テーブルの内部整合性**: `not-applicable` 条件と `changes.patch` 欄の parenthetical 「削除は unified diff にも出す」の矛盾を精査
- **cross-phase candidate digest 一致保証**: step 6（verification）と step 8（review）の pre-snapshot が一致しない場合の manifest 生成挙動を T-09 / D10 / TC-026 から検証
- **削除 binary ファイルの分類**: D8 の二つの分類（`omitted:binary` / `not-applicable`＋deletion）が同時適用された場合の未定義挙動を確認
- **T-05 step → capability マッピングの完全性**: pr-create 以外の pipeline step への capability 要件定義の有無を T-05 AC と D12 から確認
- **セキュリティ観点（継続確認）**: symlink escape の 3 層防御（baseline snapshot / materialize / revision binding）・source 不変 guard・git 拒否 spawn の記述整合性

---

## 検証できなかった項目

- **実装コードの存在確認**: `src/core/artifact-output/`・`src/core/snapshot/` は本 change で新設予定であり worktree 未存在。実装の正誤は検証対象外
- **`bun run test` / `bun run typecheck` の green 確認**: 実行環境が無いため既存 test の regression は確認不可
- **D16 実測値**: T-10 規模ケースの metrics 実測値は「assert しない」仕様のため spec review では評価対象外
- **OQ-1〜OQ-6**: Open Questions として明示的に未確定の事項

---

## Findings 詳細

### F-1（MEDIUM・fixable）: D8 削除エントリの patch 分類表が内部矛盾している

**所在**: `design.md` > D8 patch 表現可能性テーブル

**内容**: D8 のテーブルは削除を `not-applicable` に分類し、`changes.patch` 欄に「含まない」と記述している。しかし同欄の括弧書きで「削除は unified diff にも出す」と例外を注記しており、「含まない」と「unified diff に含む」が同一欄に共存する内部矛盾が生じている。

manifest の `patch` フィールドが `not-applicable` の entry を読んだ consumer は、`changes.patch` に削除 hunk が存在することを知る手段がない。spec.md の Scenario「A deletion is present in both patch and manifest」や T-07 の「削除された text file は削除 hunk として patch に含める」と合わせると、削除 text ファイルが実際には patch に含まれるにもかかわらず、manifest の patch 分類が `not-applicable` である状態が発生する。

**修正案**: 削除 text ファイル専用の分類（例: `included:deletion`）を追加するか、`included` の条件に「kind=file かつ deleted かつ baseline 側が UTF-8 text かつ size 上限内」を追加する。manifest の patch 分類と `changes.patch` の実際の内容が 1:1 で対応するよう修正する。

---

### F-2（MEDIUM・fixable）: cross-phase candidate digest 一致を強制する機構が spec に未定義

**所在**: `design.md` > D10、`tasks.md` > T-09 step flow、`spec.md` > TC-026（対応シナリオ）

**内容**: D10 は verification と review の revision binding をそれぞれ独立して定義しており、各フェーズで「実行前 snapshot == 実行後 snapshot でなければ halt」を保証する。しかしフェーズ間（step 6 verification 終了〜step 8 review 開始）に candidate が外部プロセスにより変更された場合、以下が起きる。

- verification binding: pre-verify=S6、post-verify=S6（drift なし、record の candidateDigest=S6）
- review binding: pre-review=S8（≠S6）、post-review=S8（drift なし、record の candidateDigest=S8）

両フェーズ単独の drift チェックはパスするが、S6≠S8 のまま artifact が finalize される。TC-026「manifest の candidate digest が verification record と review record の candidate digest と一致する」を想定するが、一致を強制する機構が spec に存在しない。D5 の layout 設計は SpecRunner 自身が step 間に candidate を書かないことを保証しているが、外部プロセスによる変更は防げておらず、spec に明示的な cross-phase チェックがない。

**修正案**: T-09 の step 9 artifact finalize 前（または step 8 review binding 後）に「verification bound digest と review bound digest を照合し、不一致の場合は `revision-drift` として halt する」手順を追加する。あるいは D10 の Requirement 文に「review binding の frozen digest は verification binding の frozen digest と等しいことを finalize 前に確認する」と明示する。

---

### F-3（LOW・fixable）: D8 が削除 binary ファイルの patch 分類を未定義にしている

**所在**: `design.md` > D8 patch 表現可能性テーブル

**内容**: D8 は `omitted:binary`（NUL byte を含む / UTF-8 decode 不可、payload に candidate bytes を収録）と `not-applicable`（削除を含む、manifest に metadata 記録）を別分類として定義している。binary ファイルが削除された場合、この entry は両方の条件を満たす。

- `omitted:binary` として処理すると：payload に「candidate bytes」を収録するが、削除されたファイルには candidate 側が存在しないため収録できない
- `not-applicable` として処理し削除 hunk を生成しようとすると：unified diff に binary 内容を含めることになり、標準 unified diff として無効なケースが生じる

どちらの分類を適用するか、あるいは削除 binary 専用の処理（例: `omitted:binary` かつ payload 欄は absent と明示）が必要かが spec に記載されていない。

**修正案**: D8 テーブルに「binary file が削除された場合：`omitted:binary` を適用し、payload は absent（削除のため candidate 内容なし）と明示。`changes.patch` への hunk は含まない」という行または注記を追加する。

---

### F-4（LOW・fixable）: T-05 が pr-create 以外の pipeline step と capability のマッピングを設計文書で規定していない

**所在**: `tasks.md` > T-05、`design.md` > D12

**内容**: T-05 は「step → require する capability のテーブルを同 module に data として置く（`if` の散在を作らない）」と記述しているが、design.md D12 では `UNSUPPORTED_OPERATIONS` の列挙（push / PR create / merge 等 6 種）のみが定義されており、それぞれの操作が具体的にどの pipeline step（design / implementer / verification / code-review / conformance / adr-gen 等）に紐付くかの complete mapping が設計文書に存在しない。

T-05 AC が検証するのは「pr-create step が artifact-output profile で unsupported になる」と「git-pr profile で全既存 pipeline が unsupported 0 件」の 2 点のみ。他の step（例：`code-review` が `git-commit-attribution` を要求するかどうか、`conformance` が `changed-files` を要求するかどうか等）のマッピング誤りは AC で検出されない。誤ったマッピングは preflight の fail-open（本来 unsupported な step が supported と判定される）につながる。

**修正案**: D12 の capability ID テーブルを拡張し、各 pipeline step が require する capability ID の一覧を設計文書（または T-05 の仕様部分）に掲載する。最低限「git-commit-attribution / branch-borne-state / git-remote-publish を require するとした場合に unsupported になる step の一覧」を明示する。

---

### 観察事項（finding ではない）

- **TC-077 のフォーマット**: TC-001〜TC-041 の Scenario 由来 TC は「GWT 省略・Source 参照のみ」の規約があるが、TC-077 は同グループに挿入されながら GWT を明示している。機能的問題はないが、test-cases.md のフォーマット一貫性の観点で TC-077 を TC-078 と同じ非 Scenario 由来グループ（TC-042〜TC-076 相当）に移すか、GWT を省略する整形を将来 iteration で検討できる。
