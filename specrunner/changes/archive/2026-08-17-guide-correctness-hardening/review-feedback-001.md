# Code Review Feedback — guide-correctness-hardening — iteration 1

## 検証した項目

### diff 確認
- `git diff main...HEAD --stat`: 19 ファイル変更、2403 行追加・12 行削除
- 実装対象: `guide.ts`(19 行変更)、`runner.ts`(+1 行)、`guide.test.ts`(+304 行)、`SKILL.md`(2 行変更)、`adr/...registry.md`(2 行変更)

### 受け入れ基準の検証 (全 12 項目)

**AC1: review/audit topic の正典モデル記述**
- `guide.ts:376-377`: review topic に "pipeline 開始後の規範は request.md / spec" + "issue との比較は audit topic の転記監査観点であり、review では行わない" 記述あり ✅
- `guide.ts:180-183`: audit topic に "転記監査" + "issue→request.md 転記そのものを監査する" 記述あり ✅
- "起点 issue の正典を canon とする" / "起点 issue の正典と照合する" は guide.ts に存在しない ✅

**AC2: escalation topic cancel 案内**
- `guide.ts:311-312`: `specrunner job show <slug>` → `specrunner job cancel <jobId> --restore-draft` の 2 段案内 ✅
- `job cancel <slug>` は存在しない ✅

**AC3: merge topic worktree path**
- `guide.ts:110`: `cd .git/specrunner-worktrees/<slug>-<jobIdの先頭8文字>` ✅

**AC4: invocation contract (triple-backtick + 除外リスト)**
- `INVOCATION_CONTRACT_SKIP_PATTERNS` 定数が `{ pattern, reason }` 形式で定義 ✅
- `extractSpecrunnerLinesFromCodeBlocks` が triple-backtick ブロック内の `specrunner ...` 行を抽出 ✅
- TC-032: 全 topic × コードブロック行に対して path/flag/positional 3 軸を検証 ✅

**AC5: invocation contract ネガティブテスト**
- TC-034: `job cancel <slug>` → positional-name-mismatch violation ✅
- TC-039: `job cancel <jobId>` → violations なし ✅

**AC6: runner.ts halt 出力への導線**
- `runner.ts:452`: `logInfo("詳細: specrunner guide escalation")` が halt ブロック内に追加 ✅
- TC-031 がソース内の halt ブロックを走査して検証 ✅

**AC7: jobs topic stale 手順の不在**
- "job ls で running を確認" は guide.ts に存在しない ✅

**AC8: setup topic init 記述**
- `guide.ts:197`: 見出し "## 1. init — global config + repository scaffold" ✅
- "2 層 config scaffold" は存在しない ✅

**AC9: SKILL.md**
- "parallel-request-workflow" 文字列が `.claude/skills/acceptance-and-issue-audit/SKILL.md` に存在しない ✅

**AC10: ADR 実状態整合**
- `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md:49`: "directory ごと削除する (tombstone なし)" に修正済み ✅
- "tombstone を置いて実質削除する" は存在しない ✅

**AC11: 既存テストの無変更 green**
- 全 787 test files、11721 tests pass ✅

**AC12: typecheck && test**
- verification-result.md: build/typecheck/test/lint/changed-line-coverage 全 passed ✅

### invocation contract の動作確認

コードブロック内のコマンド例を実際に追跡:

- `specrunner job resume <slug> --detach`: `job resume` args.name="slug", flags.detach ✅
- `specrunner job wait <slug>`: `job wait` args.name="slug", flags={} ✅
- `specrunner job archive <slug> --with-merge`: args.name="slug", flags.with-merge ✅
- `specrunner job show <slug>`: args.name="jobId|slug", allowed=["jobId","slug"], "slug" ∈ allowed ✅
- `specrunner job cancel <jobId> --restore-draft`: args.name="jobId", "jobId" ∈ allowed, flags.restore-draft ✅
- `specrunner job prune --force`: positionals なし ✅
- `specrunner job attach --branch <branch>`: `<branch>` は --branch flag value placeholder (lastWasFlag=true) → skip ✅
- `specrunner job reopen <slug> --from <step> ...`: args.name="slug" ✅、`<step>` flag value → skip ✅
- `specrunner rules new <step-name> <rule-slug>`: args[0].name="step-name rule-slug", split → ["step-name","rule-slug"] ✅
- `specrunner rules new implementer no-inline-comment`: positionals なし(placeholder 不使用)、resolveCommand は leaf 到達後 restArgs を許容 ✅
- `specrunner inbox run --dry-run`: flags.dry-run ✅
- `specrunner config effective --type spec-change`: flags.type ✅
- `|` / `$` / `>` 含む行: INVOCATION_CONTRACT_SKIP_PATTERNS で除外 ✅

### resolveCommand 挙動の確認

`resolveSpec` は leaf コマンドへの到達後、余分なトークン (positional 値が path regex に一致する場合) を `restArgs` として受け取り `"ok"` を返す。これにより `rules new implementer no-inline-comment` などの具体値を含む行が正しく path 解決される。

## 検証できなかった項目

None — 全受け入れ基準を直接確認。

## Findings 詳細

重大な不具合なし。
