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
| TC-019 が Scenario 由来でありながら GWT を記述している（フォーマット違反） | **解消済み** — 現在の TC-019 は Category: gate、Source: tasks.md T-01 / T-06 で GWT なし。verification phase 行のみ記述されており正しい形式 |
| spec-fixer-deferred HTML コメントが完了済みのまま残存 | **未解消** — design.md 末尾に 1 件残存（詳細は Findings 参照） |

### spec.md

- 全 8 Requirement を確認。`SHALL` / `MUST` / `MUST NOT` の normative keyword を全 Requirement で確認 ✓
- 全 Requirement が `### Requirement:` ヘッダーを持つ ✓
- 各 Requirement に 1 件以上の Scenario を確認 ✓
- request.md 要求 1〜6 との対応突合:
  - 要求1（`--from-issue` flag + issue 取得→parse→draft→start）: "job start SHALL accept --from-issue..." ✓
  - 要求2（inbox 経路統合）: "issue → draft → start の連鎖は単一の core 関数に統合されなければならない" ✓
  - 要求3（base-branch guard）: "--from-issue はコマンド起動時に base-branch guard を適用しなければならない" ✓
  - 要求4（flag 排他と直交）: "--from-issue と positional / --issue は排他でなければならない"（detach 直交は Scenario で表現）✓
  - 要求5（inboxOrigin 再利用）: fidelity comparator skip Requirement で `inboxOrigin=true` の観測挙動を表現 ✓
  - 要求6（ヘルプ・guide 追随）: spec.md に専用 Requirement なし。tasks.md T-05 / TC-015・TC-016（manual/should）でカバー。前周レビューと同様に観察のみ、finding なし
- GitHub API fetch 失敗 Requirement: 副作用ゼロ・非ゼロ exit を SHALL で表現 ✓
- parse 失敗 Requirement: draft・job state 生成なし・エラー終了 MUST ✓
- slug 占有 Requirement: 既存 SlugOccupiedError 経路への乗り上げ MUST ✓

### test-cases.md

Summary と Result YAML のカウントを全 TC と突合:

| 項目 | Summary/YAML 値 | 実カウント |
|------|----------------|-----------|
| Total | 19 | 19 ✓ |
| Automated (unit/integration) | 14 | unit 11 + integration 3 = 14 ✓ |
| Manual | 2 | TC-015, TC-016 = 2 ✓ |
| Gate | （非掲示）| TC-017, TC-018, TC-019 = 3（計 19 整合 ✓） |
| must | 13 | TC-001〜006, 008, 009, 011, 012, 017, 018, 019 = 13 ✓ |
| should | 6 | TC-007, 010, 013, 014, 015, 016 = 6 ✓ |

- Scenario 由来 TC（TC-001〜TC-011）: GWT なし・Source 参照のみ ✓
- 非 Scenario 由来 TC（TC-012〜TC-016）: GWT あり ✓
- gate TC（TC-017〜TC-019）: GWT なし・verification phase 行あり ✓
- TC-019 の現状: Category: gate、Source: tasks.md T-01 / T-06、`verification phase: test (...)` 形式 — 前周 finding が解消された状態 ✓
- spec.md の全 Scenario に対応する TC の存在を確認 ✓

### design.md

- D1〜D7 の設計決定と spec.md Requirements の整合を確認 ✓
- D4 の `git symbolic-ref --short -q HEAD` 選択理由（detached で null → 不一致扱い）の妥当性確認 ✓
- D7 "ADR 具体 path を書かない" 規律を遵守していることを確認 ✓
- Risks / Trade-offs セクション: 3 件のリスクと Mitigation が spec / tasks の方針と整合 ✓
- **残存 spec-fixer-deferred コメント**: 末尾 1 件（TC-019 GWT 削除指示）が残存。現在 TC-019 は gate TC で GWT が存在しないため、コメントの前提（"TC-019 は Scenario 由来 TC"・"GWT 3行を削除"）が事実と一致しない。stale かつ誤記 ✓（詳細は Findings 参照）

### tasks.md

- T-01〜T-06 の Acceptance Criteria が spec.md Requirements と整合 ✓
- T-02 の positional optional 化・排他検査 3 系が design.md D1 と一対一対応 ✓
- T-04 の `BASE_BRANCH_MISMATCH` エラーコードが `EXIT_CODE.ARG_ERROR` へ mapping される設計を確認。errors.ts の `EXIT_CODE_MAP` でリストされていないコードは `GENERAL_ERROR` にフォールバックするため、T-04 で明示追加が必要であることを tasks.md が正しく記述 ✓

### セキュリティ確認（フル）

- **issue 番号**: `--from-issue` は `{ type: "integer", min: 1 }` flag — 非整数・ゼロ・負値を拒否。GitHub API URL の path segment として使用するため injection リスクなし ✓
- **issue body（外部入力の境界）**: `parseRequestMdContent()` を通す → `createRequestMdRegistry()` が slug / base-branch を `SLUG_REGEX` / `BASE_BRANCH_REGEX` で構造検証。validation 失敗 → throw → draft 書き込みより前でエラー終了（副作用ゼロ） ✓
- **slug のパストラバーサル**: `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` — `/` `..` 含まず、path.join 後でも所定ディレクトリ外に出ない ✓
- **base-branch の比較**: `BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/` — shell メタ文字を含まない形式のみ許可。guard は `current !== baseBranch` の純粋な文字列比較でシェル実行なし ✓
- **GitHub token**: `resolveGitHubToken` 経由（inbox と同一経路）。環境変数から取得、ハードコードなし ✓
- **git コマンド**: `symbolic-ref --short -q HEAD` は read-only・引数はリテラル定数・ユーザー入力なし ✓
- **OWASP A01（アクセス制御）**: GitHub token 必須。既存 `resolveGitHubToken` に委譲、権限昇格なし ✓
- **OWASP A03（インジェクション）**: slug / base-branch は正規表現 validated 後にファイルシステム操作。issue 番号は整数型 ✓
- **OWASP A10（SSRF）**: API URL は origin info（git remote 解決）と整数 issue 番号から構成。ユーザーが任意 URL を注入できる経路なし ✓

## 検証できなかった項目

- `detachSelf` 子プロセス argv 再入の完全トレース（from-issue の実装が未存在）。設計根拠は design.md D3 に記述されており論理的妥当性を確認済み。実装後は TC-007 integration テストで担保される。

## Findings 詳細

### F-1: design.md 末尾の spec-fixer-deferred コメントが stale かつ誤記のまま残存

**ファイル**: `specrunner/changes/job-start-from-issue/design.md`（末尾、コメント 1 件）

spec-fixer が test-cases.md への書き込みを断念した際に追記した HTML コメント（`<!-- spec-fixer-deferred: TC-019 GWT 削除 ... -->`）が削除されずに残っている。現在の test-cases.md では TC-019 が Category: gate / Source: tasks.md T-01 / T-06 として定義されており、GWT は存在しない。コメントの前提「TC-019 は Scenario 由来 TC のため GWT 3行を削除すること」は事実と一致しない。

- 実害: 実装者が design.md を参照した際に「TC-019 に対して未実施の修正がある」と誤読するリスクがある。
- 修正: コメント 1 行を削除する（TC-019 の形式は現在正しいためタスク自体が消滅している）。
