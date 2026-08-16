# Code Review Feedback — operator-guide — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認 (25 files, +3177/-443)
- `src/core/command/guide.ts` — GUIDE_TOPICS 9 件 / 純粋 builder / handler 全読み
- `src/core/command/__tests__/guide.test.ts` — 21 TC 全件読み
- `src/cli/command-registry.ts` — guide 登録箇所 (line 1485-1498) / groupOrder / generateTopLevelUsage 読み
- `src/core/finish/escalation.ts` — formatEscalation に `specrunner guide escalation` 導線確認
- `src/core/step/canon-escalation.ts` — leaf 制約 / guide.ts import 不在 / 導線確認
- `src/cli/init.ts` — `buildClaudeMdSnippet()` 呼び出し + stdout 出力確認
- `.claude/skills/job-run-monitor/SKILL.md` — 5 非空行、guide jobs 誘導確認
- `.claude/skills/rebase-finish/SKILL.md` — 5 非空行、guide merge 誘導確認
- `.claude/skills/acceptance-and-issue-audit/SKILL.md` — 5 非空行、guide audit 誘導確認
- `.claude/skills/parallel-request-workflow/SKILL.md` — DEPRECATED tombstone 確認
- `specrunner/changes/operator-guide/verification-result.md` — iter 3 passed 確認 (786 test files, 11667 tests)
- guide body 全 9 topic × コマンド行を command-registry と手動照合

## 検証できなかった項目

None

## Findings 詳細

### Finding 1 — AC-8 coverage gap: 5/9 topics の TC-013 対象コマンドがゼロ (medium/fixable)

TC-013 は guide 本文中の `\`specrunner <tokens>\`` (single backtick inline) のみを抽出して
`resolveCommand` で実在確認する。tasks.md T-01 に「機械検証対象のコマンドは少なくとも 1 回は
完全形 backtick 囲みで記載する」と明記されているが、以下 5 topic は全コマンドをコードブロック
(triple backtick) 内に入れており、inline backtick がゼロのため TC-013 での抽出が 1 件も発生しない:

| topic | 代表コマンド (コードブロック内) |
|-------|-------------------------------|
| merge | `specrunner job ls`, `specrunner job archive --with-merge` |
| audit | `specrunner job ls --all` |
| setup | `specrunner init`, `specrunner doctor`, `specrunner credentials set` |
| request | `specrunner request template --type bug-fix`, `specrunner request validate` |
| inject | `specrunner rules new`, `specrunner reviewers new`, `specrunner config effective` |

これらコマンドは手動で command-registry を確認し、すべて実在・flag も正確と確認済み。
現時点での案内ミスはないが、将来コマンド面が変わったときに TC-013 が検出できない。

**修正案**: 各 topic body に少なくとも 1 件 inline backtick (`\`specrunner ...\``) を追加する。
または TC-013 とは別に、これら topic の主要コマンドを直接
`resolveCommand(["job", "archive"])` 等で assert する test case を追加する。

---

### Finding 2 — help summary line の topic 一覧が GUIDE_TOPICS 非依存 (low/fixable)

`src/cli/command-registry.ts` line 1493:

```ts
summary: "  guide [topic]                   運用ガイドを表示 (topics: jobs merge audit setup escalation request review inject inbox)",
```

この topic 列挙は手書きであり `GUIDE_TOPICS` から導出していない。AC-2 が定める三面
(guide 引数なし一覧 / 未知 topic 候補 / init snippet) はすべて registry 導出かつテスト済みだが、
この --help summary 行は第四の面として手書き列挙を残している。topic 追加・改名時に
この行だけ取り残されても検出するテストがない。

**修正案**:
(a) topic 一覧の表示を削除して "詳細は `specrunner guide`" 誘導だけにする  
(b) または TC-008 に各 `topic.name` が USAGE に含まれることを assert して drift を噛む

---

### Finding 3 — TC-009 は runInit 統合ではなく builder 単体のみ検証 (low/fixable)

AC-5「init の完了出力に CLAUDE.md 用 snippet が含まれることをテストで固定する」と
tasks.md T-06「runInit の標準出力が buildClaudeMdSnippet() の内容を含む」に対して、
TC-009 の実装は `buildClaudeMdSnippet()` を直接呼ぶ builder 単体テストのみ。

`init.ts` が `stdoutWrite(buildClaudeMdSnippet())` を呼んでいることは目視で確認済み。
統合 (runInit → stdout) はテストで固定されていない。

**修正案**: `runInit` を呼び出して stdout をキャプチャし `buildClaudeMdSnippet()` の内容を
`toContain` する統合テストを TC-009 に追加する。

---

### Finding 4 — parallel-request-workflow が DEPRECATED tombstone として残存 (low/decision-needed)

AC-7「`.claude/skills/parallel-request-workflow/` が存在しないこと」に対して、
spec.md は "SHALL not exist" と記述するが、tasks.md T-05 はサンドボックス制約によりディレクトリ削除不可と認め tombstone で対応している。TC-012 は「存在しない OR DEPRECATED tombstone 在り」条件で緩和済みのため green。ただし spec の SHALL とは乖離している。

**選択肢**:
- **A. 現状維持**: tombstone のまま。spec 記述と実態の乖離は容認。TC-012 は緩和済みで問題なし。
- **B. ディレクトリを削除**: CI 環境または sandbox 外から削除して commit。TC-012 は両条件対応済みのため test 変更不要。

---

## AC 充足サマリー

| AC | 充足 | 備考 |
|----|------|------|
| guide 全 9 topic + 未知エラー | ✅ | TC-001/002/004 |
| 単一 registry 導出 (3 面) | ✅ | TC-005 |
| escalation 導線 | ✅ | TC-006/007 |
| --help guide 案内 | ✅ | TC-008 |
| init snippet | ✅ (builder のみ) | TC-009 — Finding 3 参照 |
| escalation body 必須要素 | ✅ | TC-010/016 |
| skill ダイエット + 廃止コマンド排除 | ✅ (tombstone) | TC-011/012 — Finding 4 参照 |
| guide コマンド実在 | △ (5/9 topic 未対象) | TC-013 — Finding 1 参照 |
| typecheck && test green | ✅ | iter 3 verification: passed |
