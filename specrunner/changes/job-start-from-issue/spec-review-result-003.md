# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

| finding | 解消状況 |
|---------|---------|
| TC-007 priority should→must | **解消済み** — TC-007 は `**Priority**: must` になった |
| F-002 fetch 失敗 TC 不在（medium） | **解消済み** — TC-019（integration/must）が追加された |
| F-004 detach 子プロセス再 fetch 失敗 TC（low, decision-needed） | **解消済み** — TC-020（manual/could）が追加された |

### spec.md

- 全 8 Requirement を確認。全て `SHALL` / `MUST` / `MUST NOT` の normative keyword を含む ✓
- 全 10 Scenario の Given/When/Then 形式を確認 ✓
- request.md の要求 1〜6 との対応を突合:
  - 要求1 (`--from-issue` flag): "job start SHALL accept --from-issue..." ✓
  - 要求2 (inbox 経路統合): "issue → draft → start の連鎖は単一の core 関数に統合されなければならない" ✓
  - 要求3 (base-branch guard): "base-branch guard を適用しなければならない" ✓
  - 要求4 (flag 排他): "--from-issue と positional / --issue は排他でなければならない" ✓
  - 要求5 (inboxOrigin 再利用): fidelity comparator skip Requirement で観測挙動を表現、schema 変更なし ✓
  - 要求6 (ヘルプ・guide 追随): spec.md に Requirement なし。tasks.md T-05 と TC-016/017（should）でカバー（観察のみ、finding なし）

### test-cases.md

- Summary と Result YAML のカウントを全 TC と突合:
  - Total: 20 ✓（unit 5 + integration 12 + gate 2 + manual 1 = 20）
  - Automated: 17 ✓（unit 5 + integration 12）
  - Manual: 1 ✓（TC-020）
  - must: 17 ✓（TC-001〜015 の 15 + TC-018 + TC-019）
  - should: 2 ✓（TC-016, TC-017）
  - could: 1 ✓（TC-020）
- Scenario 由来 TC のフォーマット確認: TC-001〜010, TC-019 が Source に `spec.md > Requirement: ... > Scenario: ...` を持つ
  - TC-001〜010: GWT なし（Source 参照のみ）✓
  - **TC-019: GWT あり**（format 要件違反。詳細は Findings 参照）
- 非 Scenario 由来 TC（TC-011〜014, TC-016〜017, TC-020）: GWT あり ✓
- gate TC（TC-015, TC-018）: GWT なし、verification 名を記述 ✓
- spec.md の全 Scenario に対応する TC が存在することを確認 ✓

### design.md

- D1〜D7 の設計決定と spec.md Requirements の整合を確認 ✓
- Risks / Trade-offs セクション: 3 つのリスクが spec / tasks / TC の該当箇所と整合 ✓
- **stale spec-fixer-deferred コメント**: 底部に 3 件の HTML コメントが残存。これらが指示するタスク（TC-007 priority 修正・TC-019 追加・TC-020 追加）はすべて完了済みだが、コメントが削除されていない（詳細は Findings 参照）

### tasks.md

- T-01〜T-06 の Acceptance Criteria が spec.md Requirements と整合 ✓
- T-01 の core 関数統合、T-04 の getCurrentBranch helper、T-02 の positional optional 化・排他検査が design.md の D1〜D4 と対応 ✓

### セキュリティ確認

- issue number: CLI parser が `integer, min: 1` で型検証、injection リスクなし ✓
- issue body（外部データ）: `parseRequestMdContent` が必須 Meta の構造検証を行う ✓
- slug: SLUG_REGEX（前周確認済み）でパストラバーサルを防止 ✓
- GitHub token: 既存の `resolveGitHubToken` 経路と同一（inbox と同じ） ✓
- git コマンド: `symbolic-ref --short -q HEAD` は read-only、ユーザー入力なし ✓

## 検証できなかった項目

- `detachSelf` の子プロセス argv 再入挙動の完全トレース（未実装のため）。設計根拠は design.md D3 に記述されており論理的には妥当

## Findings 詳細

### F-1: TC-019 が Scenario 由来でありながら GWT を記述している（フォーマット違反）

test-cases.md の FORMAT REQUIREMENTS に「Scenario 由来 TC: GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。」とある。TC-019 の Source は `spec.md > Requirement: GitHub API fetch 失敗... > Scenario: fetch 失敗時に draft も job state も生成されない` という Scenario 形式だが、本文に GIVEN/WHEN/THEN が書かれている。

内容は spec Scenario と一致しており矛盾はないが、形式上 GWT を削除すべき。

### F-2: design.md 底部の spec-fixer-deferred コメントが完了済みのまま残存

TC-007 priority 修正・TC-019（F-002）追加・TC-020（F-004）追加は test-cases.md で完了しているが、design.md 底部の 3 件の HTML コメント（`<!-- spec-fixer-deferred: ... -->`）はそのまま残っている。実装者が design.md を参照した際に「まだ未実施タスクがある」と誤読するリスクがある。コメントを削除すべき。
