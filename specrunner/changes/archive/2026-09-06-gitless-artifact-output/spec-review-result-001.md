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
| `request.md` | 背景・目的・ユーザーストーリー・設計要求・最小実測スコープ・Non-goals・AC・Stop Conditions |
| `design.md` | 決定 D1〜D16（execution profile / workspace isolation / snapshot identity / fail-closed / artifact contract / lifecycle / documentation / measurement） |
| `spec.md` | 全 Requirement（12 件）と Scenario 群（GWT 形式）|
| `tasks.md` | T-01〜T-12（実装順序・AC・共通遵守事項）|
| `test-cases.md` | TC-001〜TC-076 の category / priority / Source / GWT |
| `src/core/pipeline/runtime-capability-gate.ts` | 既存 preflight gate（T-05 との非干渉確認）|
| `src/state/profile.ts` | 既存 assurance profile（D1 の「別軸」確認）|

### 検証したポイント

- **内部整合性**: request.md AC ↔ spec.md Requirement ↔ tasks.md AC ↔ test-cases.md の4文書対応
- **フェーズ順序**: T-09 の 9 step が request.md の最小実測スコープ 1〜9 と design D10・D13 と整合するか
- **snapshot digest の再現性**: D3・T-02 の streaming hash 仕様が機械非依存の保証を満たすか
- **fail-closed 経路**: D4・T-03・T-04 の "変更なし" への fail-open 排除が spec/TC 全体で担保されているか
- **revision 束縛**: D10・T-08・TC-026・TC-027 が verification と review の双方を対称に扱うか
- **artifact atomic finalize**: D9・T-07 の staging→rename が正しく仕様化されているか
- **既存 profile 非干渉**: T-05・T-11 の逆方向 import 検査・RUN_JOB_FLAGS 不変・runtime-capability-gate.ts 非変更
- **profile 軸分離**: D1・D12 の execution profile が `src/state/profile.ts` の assurance profile と別軸であることの確認
- **セキュリティ観点**: symlink escape（D3・D5・T-03・T-06）・path traversal（T-03 正規化）・source 不変性（D6・T-06）・git 拒否 guard（D11・T-06）・atomic rename のファイルシステム境界
- **ドキュメント導出**: D15・T-12 の capability テーブルから guide topic body を生成して drift を禁止する契約

---

## 検証できなかった項目

- **実装ファイルの存在確認**: `src/core/artifact-output/`・`src/core/snapshot/` は本 change で新設予定であり、worktree には未存在。実装の正誤は検証対象外
- **既存テスト suite の green**: `bun run test` の実行環境がないため、既存 test の regression は確認不可
- **D16 の実測値**: T-10 規模ケースの metrics 実測値は「assert しない」仕様のため spec review では評価対象外
- **OQ-2 / OQ-3 〜 OQ-6**: Open Questions として明示的に未確定の事項

---

## Findings 詳細

### F-1（HIGH・fixable）: T-09 step 7 のカテゴリ snapshot 再利用が未規定 — manifest 候補 digest と verification bound digest の一致が構造で担保されない

**所在**: `tasks.md` > T-09 > 実行順 step 6・7

T-09 の step 6 は「verification（T-08 の revision 束縛で実行）」であり、`runBoundToCandidateRevision` が candidate の "before" snapshot を採取してから verification を実行し、"after" snapshot と照合する。step 7 は「変更集合と patch の導出（T-04 / T-07）」であり、`deriveChangeSet(baseline, candidate)` に candidate snapshot を渡す必要がある。

**問題**: step 7 が使う candidate snapshot が「step 6 の revision binding が採取した frozen snapshot（"before"）を再利用する」のか「新規に candidate を再走査する」のかが T-09 の記述に明示されていない。

- **新規走査を使う場合**: manifest に記録される candidate digest と verification record に束縛された frozen digest が、step 6 終了〜step 7 走査の間に第三者プロセスが candidate を変更した場合に乖離する。D6・D10 は source の変更を検出するが、candidate への第三者書き込みは step 6〜7 間のウィンドウで検出されない。
- **frozen snapshot を再利用する場合**: 上記ウィンドウが存在しないため manifest の candidate digest と verification record の bound digest が構造上一致する。TC-026 の「manifest の candidate digest が verification record と review record の candidate digest と一致する」を **構造で** 担保できる。

T-09 の AC「run module が GitHub client を型としても受け取らない」等は記述されているが、この snapshot 再利用の明示がない。実装者が新規走査を選ぶと TC-026 がフレーキー（競合ウィンドウがほぼ発生しない）なまま通過し、設計意図が失われる。

**修正案**: T-09 の step 7 に「step 6 の revision binding が返した frozen candidate snapshot を再利用して `deriveChangeSet` を呼ぶ。step 7 で candidate を再走査しない」と明記する。T-09 の AC に「change set 導出に使った candidate digest が verification record の bound digest と等しい」を追加する。

---

### F-2（MEDIUM・fixable）: D3・T-02 のストリーミング hash 形式でディレクトリエントリの `contentDigest` 欠落時の byte 表現が未規定

**所在**: `design.md` > D3、`tasks.md` > T-02

D3 は snapshot digest の streaming hash フォーマットを `kind \0 path \0 mode \0 contentDigest \n` と定義し、dir エントリは "content digest なし" と記述している。T-02 も同形式を採用している。

**問題**: `contentDigest` が absent なディレクトリエントリについて、`\0 contentDigest` フィールドが「空文字列（＝`\0\n`）」なのか「フィールド自体を省略（＝`\n`）」なのかが指定されていない。この2解釈は異なる byte 列を生成するため、異なる実装間（または将来の再実装）でディレクトリを含む tree の digest が一致しない。「再計算可能・machine 非依存」という D3 の保証が崩れる。

**修正案**: D3 と T-02 に「dir エントリの hash 入力は `dir\0<path>\040000\0\n`（contentDigest フィールドは空文字列、\0 区切りを保持する）」と明示する（あるいは「省略形式を採用し `dir\0<path>\040000\n`」と明示する）。どちらでもよいが **一意に** 規定することが必須。

---

### F-3（MEDIUM・fixable）: reviewer 実行時の revision drift シナリオが spec.md に欠落

**所在**: `spec.md` > Requirement: Verification and review records shall be bound to the candidate revision they evaluated

D10 は「verification と review は次の順で実行する: candidate snapshot → digest 確定 → 実行 → 再 snapshot → digest 照合」と、verification **と** review の双方に同等の revision binding を要求している。

しかし spec.md のシナリオ群は以下の非対称性を持つ:
- **Verification drift**: 「Candidate mutation during verification halts the run」（TC-027）が存在する
- **Review drift**: 対称するシナリオが存在しない

このまま実装すると、「review step では revision binding を行わず、実行後に candidate digest を記録するだけ」という実装が spec の全シナリオを通過する。D10 の要求（review も binding する）は design 文書にのみ存在し、spec の機械的な充足性チェックから抜け落ちる。

**修正案**: spec.md に以下のシナリオを追加する:
```
Scenario: Candidate mutation during review halts the run

Given an artifact-output run whose review step mutates the candidate workspace
When the post-review snapshot is compared with the frozen digest
Then the run halts with a `revision-drift` outcome
And no finalized artifact directory exists
```
test-cases.md にも対応する TC（category: integration, priority: must）を追加する。

---

### F-4（MEDIUM・fixable）: エージェントが candidate に escape symlink を追加するケースのテストカバレッジが欠落

**所在**: `tasks.md` > T-10、`test-cases.md` > TC-013 との対称性

TC-013 は **source** ディレクトリに escape symlink があると baseline snapshot が unavailable になることを検証する。しかし、エージェントが step 5 で **candidate** に escape symlink を追加した場合のカバレッジが T-10 および test-cases.md に存在しない。

fail-closed 挙動は設計的に担保されている（step 6 の revision binding が candidate を snapshot する際に `symlink-escape` failure が発生 → `unavailable` → run halt）。ただし、明示的なテストがないため regression が検出されない。

また、`materializeCandidate`（T-06）が baseline snapshot の normalized paths を使って candidate を構築する際、path が candidate root を超えないことの明示的な AC が T-06 に存在しない。T-03 の path 正規化が `..` を排除することが前提だが、T-06 の AC に「snapshot paths を candidate root に join した全パスが候補 root の外を指さない」旨の assertion がない。

**修正案**:
1. T-10 の success ケースまたは fail-closed ケースに「fake agent が candidate に escape symlink を追加 → run が halt し artifact が存在しない」シナリオを追加する
2. T-06 の AC に「materialize 後の candidate に candidate root 外を指すパスが存在しない」を追加する
3. test-cases.md に対応 TC（category: integration, priority: should）を追加する

---

### F-5（LOW・fixable）: T-10 の AC が変更削除エントリの changes.patch 出力検証を明示していない

**所在**: `tasks.md` > T-10、`test-cases.md` > TC-021

TC-021 は category "integration" で「削除が patch と manifest の両方に現れる」を要求している。T-07 の unit test AC が「削除 entry が manifest と patch の両方に現れる」をカバーするが、T-10（縦断 integration test）の AC に changes.patch への削除 hunk の存在確認が明記されていない。

T-10 の fake agent は「削除」を実施するが、AC は「manifest に added / modified / deleted がすべて出力される」までで、changes.patch の内容確認が未記述。TC-021（integration）を T-10 で充足させる場合、T-10 の AC に追記が必要。

**修正案**: T-10 の AC に「fake agent が削除した text ファイルのパスが changes.patch 内の削除 hunk に含まれる」を追加する。

