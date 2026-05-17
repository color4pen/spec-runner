# Test Cases: implementer-self-commit-tolerance

Generated from: request.md / design.md / tasks.md

---

## Category A: executor HEAD 比較判定 (core — 主対策)

### TC-A01 staged あり + HEAD 進みなし → commit + push (既存挙動維持)

- **Priority**: must
- **Source**: 要件 1 / tasks.md Task 1-3 / 受け入れ基準「staged あり → 従来通り commit + push」

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  step 完了後に working tree に staged changes が 1 件以上ある
  AND  HEAD は step 開始時点から進んでいない
WHEN   commitAndPush() が呼ばれる
THEN   git commit が `<step>: <slug>` メッセージで実行される
  AND  git push origin <branch> が実行される
  AND  commit:push event が emit される
  AND  pipeline は halt しない
```

---

### TC-A02 staged 0 + HEAD 進みなし + requiresCommit: true → halt (既存挙動維持)

- **Priority**: must
- **Source**: 要件 1 / tasks.md Task 1-3 / 受け入れ基準「両方とも変化なし + requiresCommit: true → halt」

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  step 完了後に staged changes が 0 件
  AND  HEAD は step 開始時点から進んでいない (HEAD SHA が同一)
WHEN   commitAndPush() が呼ばれる
THEN   noCommitDetectedError が throw される
  AND  git push は実行されない
  AND  pipeline が halt する
```

---

### TC-A03 staged 0 + HEAD 進みあり + requiresCommit: true → push のみ (新規挙動)

- **Priority**: must
- **Source**: 要件 1 / tasks.md Task 1-3 / 受け入れ基準「HEAD 進みあり → push のみ実行、halt しない」

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  step 完了後に staged changes が 0 件
  AND  HEAD が step 開始時点から少なくとも 1 commit 進んでいる (agent 自主 commit 済)
WHEN   commitAndPush() が呼ばれる
THEN   git commit は実行されない
  AND  git push origin <branch> のみ実行される
  AND  commit:push event が emit される
  AND  pipeline は halt しない
  AND  noCommitDetectedError は throw されない
```

---

### TC-A04 staged あり + HEAD 進みあり → staged 分を commit + push (部分 commit 混在)

- **Priority**: must
- **Source**: 要件 1 設計判断 5 / tasks.md Task 1-3

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  step 完了後に staged changes が 1 件以上ある
  AND  HEAD が step 開始時点から進んでいる (agent が部分 commit 済)
WHEN   commitAndPush() が呼ばれる
THEN   staged 分について git commit が `<step>: <slug>` で実行される
  AND  git push origin <branch> が実行される (agent commit + staged commit を一括 push)
  AND  pipeline は halt しない
```

---

### TC-A05 staged 0 + HEAD 進みなし + requiresCommit: false → silent skip (既存挙動維持)

- **Priority**: must
- **Source**: 要件 1 / tasks.md Task 1-3 / 受け入れ基準（既存）

```
GIVEN  requiresCommit: false の AgentStep が完了している
  AND  step 完了後に staged changes が 0 件
  AND  HEAD は step 開始時点から進んでいない
WHEN   commitAndPush() が呼ばれる
THEN   git commit は実行されない
  AND  git push は実行されない
  AND  noCommitDetectedError は throw されない
  AND  pipeline は halt しない (silent skip)
```

---

### TC-A06 staged 0 + HEAD 進みあり + requiresCommit: false → silent skip (HEAD 進み無視)

- **Priority**: must
- **Source**: 要件 1「requiresCommit: false の AgentStep は staged 0 のとき HEAD 進みの有無に関わらず silent skip」/ tasks.md Task 1-3

```
GIVEN  requiresCommit: false の AgentStep が完了している
  AND  step 完了後に staged changes が 0 件
  AND  HEAD が step 開始時点から進んでいる
WHEN   commitAndPush() が呼ばれる
THEN   git push は実行されない (HEAD 進みを無視)
  AND  git commit は実行されない
  AND  pipeline は halt しない (silent skip)
```

---

## Category B: agent 自主 commit 検知ログ (可観測性)

### TC-B01 agent 自主 commit 検出時に規定ログが出力される

- **Priority**: must
- **Source**: 要件 3 / tasks.md Task 1-3 / 受け入れ基準「agent 自主 commit 検出時に pipeline ログにメッセージが出力される」

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  staged changes が 0 件
  AND  HEAD が step 開始時点から進んでいる
WHEN   commitAndPush() が呼ばれる
THEN   stderr に "Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is." が 1 行出力される
  AND  state schema への新規 field 追加はない
```

---

### TC-B02 agent 自主 commit 非検出時はログが出力されない

- **Priority**: should
- **Source**: 要件 3 (ログは検出時のみ)

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  staged changes が 1 件以上ある (通常経路)
WHEN   commitAndPush() が呼ばれる
THEN   "Detected agent-authored commit(s)..." のメッセージは stdout/stderr に出力されない
```

---

## Category C: push-only 経路の動作 (要件 2)

### TC-C01 push-only 経路で commit:push event が emit される

- **Priority**: must
- **Source**: 要件 2「event 通知: commit:push event は agent 自主 commit でも emit する」/ design.md Key Decisions 3

```
GIVEN  requiresCommit: true の AgentStep が完了している
  AND  staged 0 + HEAD 進みあり (agent 自主 commit 状態)
WHEN   commitAndPush() が呼ばれ push-only 経路が実行される
THEN   commit:push event が EventBus を通じて emit される
```

---

### TC-C02 push-only 経路で 1 回目 push 成功 → retry しない

- **Priority**: should
- **Source**: 要件 2「既存の push retry ロジック流用」/ tasks.md Task 1-4

```
GIVEN  push-only 経路が実行される
  AND  1 回目の git push が exit code 0 で成功する
WHEN   pushOnly() が実行される
THEN   push は 1 回だけ呼ばれる
  AND  5 秒スリープは発生しない
```

---

### TC-C03 push-only 経路で 1 回目 push 失敗 → 5 秒後に retry する

- **Priority**: should
- **Source**: 要件 2「既存の push retry ロジック (5 秒スリープ + 2 回目試行) は流用」/ tasks.md Task 1-4

```
GIVEN  push-only 経路が実行される
  AND  1 回目の git push が non-zero exit code で失敗する
  AND  2 回目の git push が exit code 0 で成功する
WHEN   pushOnly() が実行される
THEN   5 秒のスリープが挟まれる
  AND  2 回目の push が実行される
  AND  commit:push event が emit される
```

---

### TC-C04 push-only 経路で 2 回目も push 失敗 → pushFailedError

- **Priority**: should
- **Source**: 要件 2 / tasks.md Task 1-4 pushFailedError 参照

```
GIVEN  push-only 経路が実行される
  AND  1 回目・2 回目ともに git push が失敗する
WHEN   pushOnly() が実行される
THEN   pushFailedError が throw される
  AND  pipeline が halt する
```

---

## Category D: prompt commit-discipline fragment (副対策)

### TC-D01 commit-discipline.ts が COMMIT_DISCIPLINE_RULE を export している

- **Priority**: must
- **Source**: 要件 4-1 / tasks.md Task 2 / 受け入れ基準「src/prompts/commit-discipline.ts に COMMIT_DISCIPLINE_RULE が新規追加されている」

```
GIVEN  src/prompts/commit-discipline.ts が存在する
WHEN   COMMIT_DISCIPLINE_RULE を import する
THEN   "## git operations" を含む string が得られる
  AND  "git add" の禁止文言が含まれる
  AND  "git commit" の禁止文言が含まれる
  AND  "git push" の禁止文言が含まれる
  AND  "pipeline executor が一括で行います" の文言が含まれる
```

---

### TC-D02 implementer-system.ts に COMMIT_DISCIPLINE_RULE が embed されている

- **Priority**: must
- **Source**: 要件 4-2 / tasks.md Task 3-1 / 受け入れ基準

```
GIVEN  src/prompts/implementer-system.ts を読み込む
WHEN   IMPLEMENTER_SYSTEM_PROMPT 定数を確認する
THEN   COMMIT_DISCIPLINE_RULE の内容が文字列内に含まれている
  AND  import { COMMIT_DISCIPLINE_RULE } from "./commit-discipline.js" が存在する
```

---

### TC-D03 spec-fixer-system.ts に COMMIT_DISCIPLINE_RULE が embed されている (delta-spec-fixer も自動カバー)

- **Priority**: must
- **Source**: 要件 4-2 / tasks.md Task 3-2 / 受け入れ基準「delta-spec-fixer は spec-fixer-system.ts の共有 import 経由でカバー」

```
GIVEN  src/prompts/spec-fixer-system.ts を読み込む
WHEN   SPEC_FIXER_SYSTEM_PROMPT 定数を確認する
THEN   COMMIT_DISCIPLINE_RULE の内容が文字列内に含まれている
  AND  src/core/step/delta-spec-fixer.ts が SPEC_FIXER_SYSTEM_PROMPT を import している (共有設計維持)
```

---

### TC-D04 code-fixer-system.ts に COMMIT_DISCIPLINE_RULE が embed されている

- **Priority**: must
- **Source**: 要件 4-2 / tasks.md Task 3-3 / 受け入れ基準

```
GIVEN  src/prompts/code-fixer-system.ts を読み込む
WHEN   CODE_FIXER_SYSTEM_PROMPT 定数を確認する
THEN   COMMIT_DISCIPLINE_RULE の内容が文字列内に含まれている
```

---

### TC-D05 build-fixer-system.ts に COMMIT_DISCIPLINE_RULE が embed されている

- **Priority**: must
- **Source**: 要件 4-2 / tasks.md Task 3-4 / 受け入れ基準

```
GIVEN  src/prompts/build-fixer-system.ts を読み込む
WHEN   BUILD_FIXER_SYSTEM_PROMPT 定数を確認する
THEN   COMMIT_DISCIPLINE_RULE の内容が文字列内に含まれている
```

---

### TC-D06 delta-spec-fixer-system.ts は新規作成されていない

- **Priority**: must
- **Source**: 要件 4-2「src/prompts/delta-spec-fixer-system.ts は新規作成しない」/ 受け入れ基準

```
GIVEN  実装が完了している
WHEN   src/prompts/ ディレクトリを確認する
THEN   delta-spec-fixer-system.ts は存在しない
```

---

### TC-D07 embed パターンが PIPELINE_RULES と同一の template literal 方式である

- **Priority**: should
- **Source**: 要件 4-2「inject 経路は既存 PIPELINE_RULES と同じ template literal embed パターンに準拠」/ 受け入れ基準

```
GIVEN  各 system prompt ファイル (4 件) を確認する
WHEN   COMMIT_DISCIPLINE_RULE の embed 方法を確認する
THEN   `${COMMIT_DISCIPLINE_RULE}` の template literal 形式で埋め込まれている
  AND  pipeline-rules.ts の PIPELINE_RULES 埋め込みパターンと同一構造である
```

---

## Category E: integration / end-to-end シナリオ

### TC-E01 implementer 自主 commit → pipeline halt せず verification 以降へ進む

- **Priority**: must
- **Source**: 要件 5 integration test / 受け入れ基準「観測例 (finish-phase0-local-conflict-check) を再現する scenario test が halt せず完走する」

```
GIVEN  local runtime で pipeline が実行中である
  AND  implementer step の SpawnFn mock が:
       - step 完了時に HEAD が進んでいる (git rev-parse HEAD が異なる SHA を返す)
       - staged changes が 0 件 (git diff --cached --quiet が exit 0 を返す)
WHEN   implementer step が完了する
THEN   pipeline は noCommitDetectedError を throw しない
  AND  git push が実行される
  AND  pipeline は次のステップ (verification 等) へ進む
  AND  "Detected agent-authored commit(s)..." が stderr に出力される
```

---

### TC-E02 通常経路 (staged あり) の regression がない

- **Priority**: must
- **Source**: 受け入れ基準「既存 commit/push 関連 test が regression していない」

```
GIVEN  local runtime で pipeline が実行中である
  AND  implementer step が正常に file を編集して完了している
  AND  staged changes が存在する
WHEN   implementer step が完了する
THEN   git commit が `implementer: <slug>` で実行される
  AND  git push が実行される
  AND  pipeline は次のステップへ進む
```

---

## Category F: スコープ外・非侵害の確認

### TC-F01 managed adapter (agent-runner.ts) は変更されていない

- **Priority**: must
- **Source**: 要件 1-b / 受け入れ基準「managed adapter は対象外」

```
GIVEN  実装が完了している
WHEN   src/adapter/managed-agent/agent-runner.ts の diff を確認する
THEN   本 request による変更が存在しない
  AND  既存の HEAD SHA 比較 (getRefSha before/after) ロジックが維持されている
```

---

### TC-F02 managed runtime では commitAndPush が呼ばれない (既存設計維持)

- **Priority**: should
- **Source**: 要件 1-b「commitAndPush は local runtime 限定」

```
GIVEN  config.runtime === "managed" で pipeline が実行中
WHEN   agent step が完了する
THEN   executor.ts の commitAndPush は呼ばれない
  AND  managed adapter 側の commit/push ロジックがそのまま機能する
```

---

### TC-F03 requiresCommit: false の step で HEAD 進みがあっても push しない

- **Priority**: must
- **Source**: 要件 1「requiresCommit: false の AgentStep は HEAD 進みの有無に関わらず silent skip」

```
GIVEN  requiresCommit: false の AgentStep (design / spec-review / code-review 等) が完了している
  AND  staged 0 かつ HEAD が step 開始時から進んでいる
WHEN   commitAndPush() が呼ばれる
THEN   git push は実行されない
  AND  git commit は実行されない
  AND  noCommitDetectedError は throw されない
```

---

## Category G: spec authority への反映

### TC-G01 step-execution-architecture/spec.md に HEAD 進み判定が明文化されている

- **Priority**: must
- **Source**: 要件 6 / tasks.md Task 6 / 受け入れ基準「specrunner/specs/step-execution-architecture/spec.md が MODIFIED で更新されている」

```
GIVEN  specrunner/specs/step-execution-architecture/spec.md を確認する
WHEN   commitAndPush に関する Requirement / Scenario を読む
THEN   "staged 0 かつ HEAD が進んでいれば push のみ実行" の旨が Scenario として存在する
  AND  "両方とも変化なし + requiresCommit: true は halt" のシナリオが維持されている
  AND  "staged 0 かつ HEAD 進みあり + requiresCommit: false は silent skip" のシナリオが追加されている
```

---

## Category H: typecheck / build 健全性

### TC-H01 bun run typecheck が pass する

- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

```
GIVEN  実装が完了している
WHEN   bun run typecheck を実行する
THEN   型エラーが 0 件で終了する
```

---

### TC-H02 bun run test が pass する (全テスト green)

- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

```
GIVEN  実装が完了している
WHEN   bun run test を実行する
THEN   既存テストを含む全テストが pass する
  AND  新規追加した executor.commit.test.ts の全 TC が pass する
  AND  pipeline-integration.test.ts の新規 TC が pass する
```
