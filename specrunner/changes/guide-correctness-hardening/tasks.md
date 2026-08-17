# Tasks: guide 正本の正確性硬化

> **TC 番号の正本は `test-cases.md`**。本ファイルの TC 番号(TC-022〜TC-030 等)は設計上の参照用グループ番号であり、`test-cases.md` が定義する個別 TC 番号(TC-022〜TC-040)が実装・コメントの正典となる。テストコードのコメントに TC 番号を記載する場合は `test-cases.md` を参照すること。

## T-01: guide.ts content fixes (6 箇所)

File: `src/core/command/guide.ts`

- [ ] **review topic (lines 377-378)**: "起点 issue の正典を canon とする" の行を削除し、次の内容に置き換える: 「pipeline 開始後の規範は request.md / spec。issue との比較は audit topic の転記監査観点であり、review では行わない」旨の文
- [ ] **audit topic (line 184)**: "レビューは request.md ではなく起点 issue の正典と照合する" の行を削除し、「issue vs. request.md の比較は request.md 作成時の無言の要件弱体化を検出する転記監査の 1 観点」として位置づける記述に置き換える
- [ ] **escalation topic (line 313)**: `specrunner job cancel <slug> --restore-draft` を以下の 2 段コードブロックに置き換える:
  ```
  specrunner job show <slug>          # Job ID を確認
  specrunner job cancel <jobId> --restore-draft
  ```
  セクション "4. 後片付け" のコードブロック内で `job cancel` の行を置き換える。前後の `job prune` / `job attach` 行は変更しない
- [ ] **merge topic (line 112)**: `<slug>-<jobId>` を `<slug>-<jobIdの先頭8文字>` に修正する (コードブロック内の `cd .git/specrunner-worktrees/<slug>-<jobId>` の行)
- [ ] **jobs topic (line 42)**: "起動直後は state 登録に数秒ラグあり。`specrunner job ls` で running を確認してから:" の記述を削除し、"## 2. 監視 — job wait" セクションから stale な前置き手順を除去する。`specrunner job wait <slug>` コマンドブロックはそのまま残す
- [ ] **setup topic (line 199)**: 見出し "## 1. init — 2 層 config scaffold" を "## 1. init — global config + repository scaffold" に変更する

**Acceptance Criteria**:
- review topic body に "起点 issue の正典を canon とする" が存在しない
- review topic body に "request.md" または "spec" を規範として示す記述が存在する
- audit topic body に "起点 issue の正典と照合する" が存在しない
- audit topic body に issue 比較を転記監査観点として位置づける記述が存在する
- escalation topic body に `specrunner job show` と `<jobId>` を引数とする `job cancel` が含まれる
- escalation topic body に `<slug>` を引数とする `job cancel` が存在しない
- merge topic body のコードブロックに "先頭8" または "8文字" の表記がある (jobId full 表記でない)
- jobs topic body に "job ls で running を確認" が存在しない
- setup topic body に "2 層 config scaffold" の見出し文字列が存在しない

---

## T-02: runner.ts halt 出力への guide 導線追加

File: `src/core/command/runner.ts`

- [ ] `runner.ts:451` の `logInfo("Run 'specrunner resume' to continue from the halted step.")` の直後に以下の 1 行を追加する:
  ```typescript
  logInfo("詳細: specrunner guide escalation");
  ```
  `logInfo` は既に import 済みであることを確認する。追加位置は `else` ブロック内 (`drift` が falsy な場合の halt ハンドラ)

**Acceptance Criteria**:
- `runner.ts` のソースに "specrunner guide escalation" を含む `logInfo` 呼び出しが halt 出力ブロック内に存在する
- `typecheck` が green

---

## T-03: content pin tests の追加

File: `src/core/command/__tests__/guide.test.ts`

以下の describe block を既存テストの末尾に追加する。TC 番号は TC-022 から始める。

- [ ] **TC-022: review topic — issue-as-canon 記述の不在**
  ```typescript
  it("TC-022: review topic does not contain issue-as-canon language", () => {
    const topic = findTopic("review");
    expect(topic!.body).not.toContain("起点 issue の正典を canon とする");
  });
  it("TC-022: review topic contains request.md as post-pipeline normative reference", () => {
    const topic = findTopic("review");
    expect(topic!.body).toContain("request.md");
  });
  ```

- [ ] **TC-022: audit topic — issue-as-canon 記述の不在 + 転記監査観点の存在**
  ```typescript
  it("TC-022: audit topic does not contain issue-as-canon language", () => {
    const topic = findTopic("audit");
    expect(topic!.body).not.toContain("起点 issue の正典と照合する");
  });
  it("TC-022: audit topic contains transcription-audit framing", () => {
    const topic = findTopic("audit");
    // 転記監査、または issue 比較を audit 観点として位置付ける記述
    expect(topic!.body).toMatch(/転記監査|issue.*request\.md|request\.md.*issue/);
  });
  ```

- [ ] **TC-023: escalation topic — cancel 案内が jobId を使うこと**
  ```typescript
  it("TC-023: escalation topic contains job show step before cancel", () => {
    const topic = findTopic("escalation");
    const body = topic!.body;
    const showIdx = body.indexOf("specrunner job show");
    const cancelIdx = body.indexOf("specrunner job cancel");
    expect(showIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(showIdx); // show before cancel
  });
  it("TC-023: escalation topic cancel uses <jobId> argument", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).toContain("job cancel <jobId>");
  });
  it("TC-023: escalation topic cancel does not use <slug> argument", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).not.toContain("job cancel <slug>");
  });
  ```

- [ ] **TC-024: merge topic — worktree path が 8 文字 prefix 表記**
  ```typescript
  it("TC-024: merge topic worktree path uses 8-char jobId prefix notation", () => {
    const topic = findTopic("merge");
    // 先頭8文字、先頭8、8文字 のいずれかを含む
    expect(topic!.body).toMatch(/先頭8|8文字/);
  });
  it("TC-024: merge topic does not use full <jobId> notation in worktree path", () => {
    const topic = findTopic("merge");
    // <slug>-<jobId> の full 表記が残っていないこと (先頭8文字版に置き換わっていること)
    expect(topic!.body).not.toMatch(/<slug>-<jobId>/);
  });
  ```

- [ ] **TC-025: jobs topic — stale pre-check 手順の不在**
  ```typescript
  it("TC-025: jobs topic does not contain stale job ls pre-check", () => {
    const topic = findTopic("jobs");
    expect(topic!.body).not.toContain("job ls で running を確認");
  });
  ```

- [ ] **TC-026: setup topic — init 見出しが実態と一致**
  ```typescript
  it("TC-026: setup topic init heading does not say '2 層 config scaffold'", () => {
    const topic = findTopic("setup");
    expect(topic!.body).not.toContain("2 層 config scaffold");
  });
  ```

- [ ] **TC-027: runner.ts halt 出力への guide 導線**
  ```typescript
  it("TC-027: runner.ts halt output contains specrunner guide escalation link", () => {
    const runnerPath = path.join(__dirname, "../runner.ts");
    const source = fs.readFileSync(runnerPath, "utf-8");
    // halt 出力ブロック ("Pipeline halted at step") の付近に guide link が存在する
    const haltIdx = source.indexOf("Pipeline halted at step");
    expect(haltIdx).toBeGreaterThan(-1);
    const searchWindow = source.slice(haltIdx, haltIdx + 500);
    expect(searchWindow).toContain("specrunner guide escalation");
  });
  ```

**Acceptance Criteria**:
- TC-022〜TC-027 の全テストが green
- 既存 TC-001〜TC-021 が変更なしで green (T-01 で修正した本文への文言 pin は除く)

---

## T-04: invocation contract の triple-backtick 拡張

File: `src/core/command/__tests__/guide.test.ts`

既存の `extractSpecrunnerCommands` 関数はそのまま残し、以下を追加する:

- [ ] **除外パターン定数の追加** (テストファイル先頭付近、import 後に追加):
  ```typescript
  /**
   * Lines matching these patterns are excluded from invocation contract validation.
   * Each entry MUST carry a reason explaining why mechanical verification is not possible.
   */
  const INVOCATION_CONTRACT_SKIP_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
    {
      pattern: /[|$>]/,
      reason: "contains shell metacharacters (redirect / pipe / variable) — not a standalone specrunner invocation",
    },
  ];
  ```

- [ ] **コードブロック抽出関数の追加**:
  ```typescript
  /**
   * Extract `specrunner ...` lines from triple-backtick code blocks.
   * Strips trailing # comments and truncates at optional-block marker `[`.
   */
  function extractSpecrunnerLinesFromCodeBlocks(body: string): string[] {
    const lines: string[] = [];
    const codeBlockRegex = /```[^\n]*\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(body)) !== null) {
      for (const line of match[1]!.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("specrunner ")) continue;
        // Strip trailing comment
        const withoutComment = trimmed.replace(/\s+#.*$/, "");
        // Truncate at optional block
        const optIdx = withoutComment.indexOf("[");
        const cleaned = optIdx >= 0 ? withoutComment.slice(0, optIdx).trim() : withoutComment;
        lines.push(cleaned);
      }
    }
    return lines;
  }
  ```

- [ ] **パーサー関数の追加**:
  ```typescript
  interface ParsedInvocation {
    pathTokens: string[];
    positionals: string[];   // placeholder names (from <name>)
    flagNames: string[];     // flag names (from --flag)
    rawLine: string;
  }

  function parseInvocation(line: string): ParsedInvocation {
    const content = line.startsWith("specrunner ") ? line.slice("specrunner ".length) : line;
    const tokens = content.split(/\s+/).filter(Boolean);
    const pathTokens: string[] = [];
    const positionals: string[] = [];
    const flagNames: string[] = [];
    let pathDone = false;
    let lastWasFlag = false;

    for (const token of tokens) {
      if (token.startsWith("--")) {
        flagNames.push(token.slice(2));
        pathDone = true;
        lastWasFlag = true;
        continue;
      }
      if (token.startsWith("<")) {
        pathDone = true;
        if (lastWasFlag) {
          // flag value placeholder — skip
          lastWasFlag = false;
          continue;
        }
        positionals.push(token.replace(/[<>]/g, ""));
        lastWasFlag = false;
        continue;
      }
      if (!pathDone && /^[a-z][a-z0-9-]*$/.test(token)) {
        pathTokens.push(token);
      }
      lastWasFlag = false;
    }
    return { pathTokens, positionals, flagNames, rawLine: line };
  }
  ```

- [ ] **バリデーション関数の追加**:
  ```typescript
  interface InvocationViolation {
    kind: "unknown-command" | "unknown-flag" | "positional-name-mismatch";
    detail: string;
  }

  function validateInvocation(parsed: ParsedInvocation): InvocationViolation[] {
    const violations: InvocationViolation[] = [];
    const result = resolveCommand(parsed.pathTokens);
    if (result.status !== "ok") {
      violations.push({ kind: "unknown-command", detail: parsed.pathTokens.join(" ") });
      return violations; // cannot check flags/positionals without spec
    }
    const spec = result.spec;
    // (b) flag existence
    for (const flag of parsed.flagNames) {
      if (!spec.flags || !(flag in spec.flags)) {
        violations.push({ kind: "unknown-flag", detail: `--${flag} not in spec.flags for '${parsed.pathTokens.join(" ")}'` });
      }
    }
    // (c) positional name match
    const argsSpec = spec.args ?? [];
    for (let i = 0; i < parsed.positionals.length; i++) {
      const placeholder = parsed.positionals[i]!;
      const arg = argsSpec[i];
      if (!arg) continue; // extra positionals: skip (some commands accept variadic)
      const allowed = arg.name.split(/[| ]/);
      if (!allowed.includes(placeholder)) {
        violations.push({
          kind: "positional-name-mismatch",
          detail: `placeholder '<${placeholder}>' does not match args[${i}].name '${arg.name}' for '${parsed.pathTokens.join(" ")}'`,
        });
      }
    }
    return violations;
  }
  ```

- [ ] **TC-028: コードブロック invocation contract テスト** (describe block 追加):
  ```typescript
  describe("TC-028: コードブロック内 specrunner コマンドの invocation contract", () => {
    for (const topic of GUIDE_TOPICS) {
      const lines = extractSpecrunnerLinesFromCodeBlocks(topic.body);

      for (const line of lines) {
        const skipped = INVOCATION_CONTRACT_SKIP_PATTERNS.some((p) => p.pattern.test(line));
        if (skipped) continue;

        it(`TC-028: '${line}' in topic '${topic.name}' passes invocation contract`, () => {
          const parsed = parseInvocation(line);
          const violations = validateInvocation(parsed);
          expect(violations, `violations for: ${line}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
        });
      }
    }
  });
  ```

- [ ] **TC-029: skip パターンが silent でないことの確認**:
  ```typescript
  it("TC-029: INVOCATION_CONTRACT_SKIP_PATTERNS has no empty reason", () => {
    for (const entry of INVOCATION_CONTRACT_SKIP_PATTERNS) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });
  ```

- [ ] **TC-030: ネガティブテスト — job cancel \<slug\> が violation を返す**:
  ```typescript
  describe("TC-030: invocation contract が placeholder 名不一致を検出する", () => {
    it("TC-030: 'specrunner job cancel <slug> --restore-draft' produces positional-name-mismatch", () => {
      const parsed = parseInvocation("specrunner job cancel <slug> --restore-draft");
      const violations = validateInvocation(parsed);
      const mismatch = violations.filter((v) => v.kind === "positional-name-mismatch");
      expect(mismatch.length).toBeGreaterThan(0);
      expect(mismatch[0]!.detail).toContain("slug");
    });

    it("TC-030: 'specrunner job cancel <jobId> --restore-draft' produces no violations", () => {
      const parsed = parseInvocation("specrunner job cancel <jobId> --restore-draft");
      const violations = validateInvocation(parsed);
      expect(violations).toEqual([]);
    });
  });
  ```

**Acceptance Criteria**:
- `extractSpecrunnerLinesFromCodeBlocks` が triple-backtick ブロック内の `specrunner ...` 行を抽出する
- `INVOCATION_CONTRACT_SKIP_PATTERNS` が各エントリに `reason` フィールドを持つ
- TC-028 が全 topic のコードブロックコマンドについて path / flag / positional を検証する
- TC-030 で `specrunner job cancel <slug>` が `positional-name-mismatch` violation を返す
- TC-030 で `specrunner job cancel <jobId>` が violation なしを確認する
- TC-029 で除外パターンに理由なし空文字列が存在しないことを確認する

---

## T-05: acceptance-and-issue-audit SKILL.md の修正

File: `.claude/skills/acceptance-and-issue-audit/SKILL.md`

- [ ] description frontmatter の以下の行を修正する:
  - 変更前: `parallel-request-workflow / rebase-finish の前後どちらでも単独起動可能。`
  - 変更後: `rebase-finish の前後どちらでも単独起動可能。`
  - 本文 (frontmatter 以外) は変更しない

- [ ] **TC-035: SKILL.md に parallel-request-workflow が存在しないことの自動テスト** を `guide.test.ts` の末尾に追加する:
  ```typescript
  it("TC-035: acceptance-and-issue-audit SKILL.md has no parallel-request-workflow reference", () => {
    const skillPath = path.join(__dirname, "../../../../.claude/skills/acceptance-and-issue-audit/SKILL.md");
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).not.toContain("parallel-request-workflow");
  });
  ```

**Acceptance Criteria**:
- `.claude/skills/acceptance-and-issue-audit/SKILL.md` に `parallel-request-workflow` 文字列が存在しない
- TC-035 テストが green
- TC-011 の "acceptance-and-issue-audit/SKILL.md body is at most 10 non-empty lines" と "body contains guide reference" が green のまま

---

## T-06: ADR 2026-08-17-cli-operational-knowledge-registry の修正

File: `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md`

- [ ] line 49 付近の `parallel-request-workflow` 削除方針の記述を修正する:
  - 変更前: `parallel-request-workflow` は廃止済みコマンド前提のため tombstone を置いて実質削除する
  - 変更後: `parallel-request-workflow` は廃止済みコマンド前提のため directory ごと削除する (tombstone なし)
  - 同じ変更内容は "Known Limitations" 等の別箇所にも波及する可能性があるため、ファイル全体を確認して "tombstone" + "parallel-request-workflow" の組み合わせで残存する記述をすべて修正する

- [ ] **TC-036: ADR が tombstone アプローチを記述しないことの自動テスト** を `guide.test.ts` の末尾に追加する:
  ```typescript
  it("TC-036: ADR does not describe tombstone approach for parallel-request-workflow", () => {
    const adrPath = path.join(__dirname, "../../../../specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md");
    const content = fs.readFileSync(adrPath, "utf-8");
    expect(content).not.toContain("tombstone を置いて実質削除する");
  });
  ```

**Acceptance Criteria**:
- `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md` に「tombstone を置いて実質削除する」の記述が存在しない
- TC-036 テストが green
- ADR に `parallel-request-workflow` を directory 削除した旨の記述が存在する

---

## T-07: typecheck && test の green 確認

- [ ] `bun run typecheck` が 0 で完了する
- [ ] `bun run test` が 0 で完了する (TC-001〜TC-039 全 green、TC-040 gate が pass)
- [ ] TC-021 が変更なしで green であること (escalation body は `specrunner job cancel` と `--restore-draft` を依然含むため影響なし) を確認する

**Acceptance Criteria**:
- `typecheck && test` が green
- 既存 TC-001〜TC-021 が全て green (T-01 で修正した本文への文言 pin を除く)
- 新規 TC-022〜TC-039 が全て green (test-cases.md 正本の番号体系に従う)
