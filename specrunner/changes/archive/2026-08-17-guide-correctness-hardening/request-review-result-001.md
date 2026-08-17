# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション照合

| アサーション | 場所 | 結果 |
|---|---|---|
| `review topic` が "request.md でなく起点 issue の正典を canon とする" を含む | `guide.ts:377-378` | ✅ 確認 |
| `audit topic` が "起点 issue の正典と照合する" を含む | `guide.ts:184` | ✅ 確認 |
| escalation topic が `specrunner job cancel <slug>` を案内している | `guide.ts:313` | ✅ 確認（バグ） |
| `VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/` が定義されている | `command-registry.ts:52` | ✅ 確認 |
| `job cancel` の args が `{ name: "jobId" }` である | `command-registry.ts:929` | ✅ 確認 |
| `job cancel` の handler が jobId 形式を検証する | `command-registry.ts:938` | ✅ 確認 |
| `buildWorktreePath` が `jobId.slice(0, 8)` を使う | `manager.ts:65` | ✅ 確認 |
| merge topic が `<slug>-<jobId>` を案内している | `guide.ts:112` | ✅ 確認（バグ） |
| setup topic 見出しが "init — 2 層 config scaffold" | `guide.ts:199` | ✅ 確認 |
| jobs topic が "state 登録に数秒ラグあり。job ls で確認してから" を含む | `guide.ts:42` | ✅ 確認（陳腐化） |
| runner.ts halt 出力に `specrunner guide escalation` 導線が無い | `runner.ts:450-451` | ✅ 確認（欠落） |
| `formatEscalation` が `specrunner guide escalation` 導線を持つ | `escalation.ts:29` | ✅ 確認 |
| `buildCanonEscalationReason` が `specrunner guide escalation` 導線を持つ | `canon-escalation.ts:151` | ✅ 確認 |
| TC-013 が inline backtick のみ抽出し triple-backtick block を対象外とする | `guide.test.ts:509-534` | ✅ 確認 |
| `acceptance-and-issue-audit/SKILL.md` に `parallel-request-workflow` 言及がある | `SKILL.md:6` | ✅ 確認（残骸） |
| `parallel-request-workflow` ディレクトリが存在しない（完全削除） | `.claude/skills/` 配下 Glob | ✅ 確認 |
| ADR が "tombstone を置いて実質削除する" と記している（実状態は directory 削除） | `adr/2026-08-17-cli-operational-knowledge-registry.md:49` | ✅ 確認（不一致） |
| `runInit` が user-global config と per-repo scaffold のみ作成し `.specrunner/config.json` は scaffold しない | `init.ts:143-165` | ✅ 確認 |
| `job show` コマンドが `<jobId\|slug>` を受理する | `command-registry.ts:883-897` | ✅ 確認 |

### Step 2: 要件と受け入れ基準の整合性確認

- 要件 1〜8 はすべて具体的なコード箇所を指す
- 各受け入れ基準はテストで固定する形式で記述されており、機械検証可能
- AC 5 が「検証ロジック自体の meta-test」を要求している点は適切（歯が効くことの証明）
- スコープ外が明示されており、`job cancel <jobId|slug>` CLI 拡張や `job show` への Worktree パス表示追加は除外済み
- architect 評価済み設計判断に cancel 修正を guide 側で行う理由（CLI 入力拡張はスコープ外設計変更）が明記されている

## 検証できなかった項目

- PR #981 (detach 親プロセス exit 0 が登録完了を保証する設計変更) のマージ済み状態 — 外部 PR なので直接確認不可。ただし変更理由として要件 6 が陳腐化手順の削除を求めることの妥当性に影響しない
- PR #959 (issue 起点 run の fidelity gate、request.md を正典として確定する設計) のマージ済み状態 — 同上

## Findings 詳細

指摘なし。全コードアサーションが実コードと一致し、バグ・陳腐化・残骸の存在も確認済み。
request type は "bug-fix" だが要件 4（invocation contract テスト）は既存テスト動作の変更を伴う。
既存テスト(TC-013 系)が修正対象の文言 pin を除き無変更で green であることを AC 11 が明示しているため、
実装者が範囲を把握して進める十分な制約がある。
