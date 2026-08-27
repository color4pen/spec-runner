# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照したファイル

- `specrunner/changes/split-reopen-from-resume/request.md` — 問題定義・要件・受け入れ基準
- `specrunner/changes/split-reopen-from-resume/design.md` — 設計決定 D1–D6
- `specrunner/changes/split-reopen-from-resume/tasks.md` — 実装タスク T-01–T-07
- `specrunner/changes/split-reopen-from-resume/spec.md` — 正式仕様（シナリオ 19 件）
- `specrunner/changes/split-reopen-from-resume/test-cases.md` — TC-001–TC-030（30 件）

### 照合したソースファイル（現状把握用）

- `src/core/command/reopen.ts` — 変更前実装
- `src/state/lifecycle.ts` — `REOPEN_TRANSITIONS` 現状
- `src/core/command/__tests__/reopen-command.test.ts` — 変更前テスト
- `src/state/__tests__/lifecycle-reopen.test.ts` — 変更前テスト（TC-002/016/017）
- `src/cli/reopen.ts` — CLI エントリポイント現状
- `src/cli/command-registry.ts` — コマンド登録現状
- `src/store/event-journal.ts` — `OperatorEventRecord.fromStep` 現状
- `.github/workflows/specrunner-dispatch.yml` — Actions ワークフロー現状
- `src/core/command/guide.ts` — guide escalation セクション現状
- `architecture/conformance.md` — B-17 行現状
- `tests/unit/architecture/core-invariants.test.ts` — B-17 アーキテクチャテスト現状

### 検証項目

1. **request.md ↔ spec.md ↔ test-cases.md の要件網羅性**
   - request.md の受け入れ基準 8 項目を spec.md のシナリオおよび test-cases.md の TC と対照した。
   - 全受け入れ基準に対応するシナリオ・TC が存在する。

2. **design.md 決定 D1–D6 の整合性**
   - D1（CommandRunner 分離）→ spec.md の "ReopenCommand SHALL NOT have CommandRunner inheritance"（TC-020, TC-021）へ反映済み。
   - D2（REOPEN_TRANSITIONS ターゲット変更 running → awaiting-resume）→ tasks.md T-01 / TC-016 更新指示へ反映済み。ただし **TC-002-c に矛盾あり（後述）**。
   - D3（--from 廃止）→ spec.md "reopen SHALL NOT accept --from"（TC-012）へ反映済み。
   - D4（fromStep? 省略可）→ tasks.md T-02 / TC-022, TC-023 へ反映済み。
   - D5（Actions: 中間 push 不要）→ spec.md シナリオ "Actions reopen dispatches two CLI commands"（TC-019）へ反映済み。
   - D6（B-17 invariant 維持）→ tasks.md T-05 / architecture/conformance.md 更新指示へ反映済み。

3. **tasks.md タスク T-01–T-07 の完全性チェック**
   - T-01: `lifecycle.ts` + `lifecycle-reopen.test.ts` の更新内容を精査。
   - T-02: `reopen.ts` の完全書き換え手順と acceptance criteria を精査。
   - T-03: `cli/reopen.ts` + `command-registry.ts` の更新内容を精査。
   - T-04: Actions ワークフローの 2 コマンド化手順を精査。
   - T-05: `guide.ts` + `conformance.md` の更新内容を精査。
   - T-06: テストファイル 3 種の更新内容を精査。TC 番号の整合性を各ファイルで追跡した。
   - T-07: typecheck + test green の gate 条件を確認。

4. **セキュリティ観点**
   - PR ゲートが fail-closed（token なし → 拒否）であること確認済み。
   - ワークツリーガードが worktree 内実行を拒否すること確認済み。
   - `--reason` の入力がジャーナルに記録されるが、length 制約なし。
   - 新規 HTTP エンドポイント・データストア追加なし。OWASP Top 10 の新規リスクは生じない。

5. **test-cases.md の Summary 整合性**
   - Total 30、automated 26、manual 2 の内訳を個別に数えて確認（gate 2 件を含む）。✓

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行（実装はこの PR でまだ行われていないため、型エラー・テスト失敗の実機確認は不能）。
- `fold()` 関数が `fromStep?: string` を missing field として graceful に処理するかの実機確認（コード精査で推測可能だが、動的挙動の完全検証は実装後）。

---

## Findings 詳細

### Finding 1 (HIGH): tasks.md T-01 が TC-002 を「変更不要」と明示しているが、TC-002-c は D2 変更後に失敗する

**対象**: `tasks.md` T-01 / `src/state/__tests__/lifecycle-reopen.test.ts`

tasks.md T-01 は「TC-002 and TC-017 assertions（`awaiting-archive → running` is forbidden）are unchanged — do not modify them」と明記している。

しかし `lifecycle-reopen.test.ts` の TC-002-c は：

```typescript
it("TC-002-c: REOPEN_TRANSITIONS export exists with awaiting-archive → running edge", async () => {
  const targets = (table as Map<string, Set<string>>).get("awaiting-archive");
  expect(targets!.has("running")).toBe(true);  // ← D2 後は false になる
});
```

D2 変更（`REOPEN_TRANSITIONS["awaiting-archive"] = new Set(["awaiting-resume"])`）を適用すると、`targets.has("running")` は `false` を返すため **TC-002-c は必ず失敗する**。つまり T-07 の acceptance criteria「bun run test exits 0」が満たせない。

tasks.md T-01 の「TC-002 is unchanged」はサブテスト TC-002-a/b（一般ガードが `running` を拒否）については正しいが、TC-002-c（REOPEN_TRANSITIONS の内容検証）については誤りである。

**必要な修正**: tasks.md T-01 に「TC-002-c は `has("running")` を `has("awaiting-resume")` に変更する」旨を追記すること。

---

### Finding 2 (HIGH): tasks.md T-06 の TC 番号が test-cases.md の TC 番号と体系的に乖離している

**対象**: `tasks.md` T-06 / `test-cases.md`

tasks.md T-06 は既存テストファイルの旧 TC 番号を参照しているが、test-cases.md は全体を新番号で再定義している。以下の TC で意味が完全に異なる：

| tasks.md T-06 の参照 | tasks.md が意図する内容 | test-cases.md 同番号の内容 |
|---|---|---|
| TC-013, TC-014, TC-015 | reopen rejection tests（no-PR / CLOSED / query-fail → exit 1） | resume の挙動テスト（resume executes / adopt-commits / awaiting-archive 拒否） |
| TC-018 (worktree guard) | worktree 内実行 → exit 2 | FSM guard: awaiting-archive → running 禁止 |
| TC-019 (replace with --from rejected) | `--from` を渡すと ARG_ERROR になるテスト | Actions workflow 2 コマンド integration test |
| TC-020 (patch fields) | patch の pid が null であることの確認 | ReopenCommand が CommandRunner を継承していないことの確認 |
| TC-021 (operator event before persist) | fromStep がイベント記録に含まれないことの確認 | コンストラクタが (slug, options) のみ受け取ることの確認 |

実装者が tasks.md T-06 の「TC-018 (worktree guard): call `cmd.execute()`; assert return 2」という指示に従って test-cases.md TC-018 を参照すると、「FSM guard forbids awaiting-archive → running」という無関係な内容にたどり着く。括弧内の説明文で意図は読み取れるが、TC 番号の不一致は実装ミスのリスクを高める。

**対応が必要な TC 対応表（正しいマッピング）**:
- tasks.md が「TC-013」と呼ぶもの → 新 TC-007（PR state unavailable → exit 1）または TC-030（no PR number）
- tasks.md が「TC-018 (worktree guard)」と呼ぶもの → 新 TC-029
- tasks.md が「TC-019 replace with --from rejected」と呼ぶもの → 新 TC-012
- tasks.md が「TC-020 (patch fields)」と呼ぶもの → 新 TC-009
- tasks.md が「TC-021 (operator event before persist)」と呼ぶもの → 新 TC-010

---

### Finding 3 (MEDIUM): TC-019（Actions integration test、must）に対する実装指示がない

**対象**: `test-cases.md` TC-019 / `tasks.md` T-04 / T-06

test-cases.md TC-019 は "Actions reopen dispatches two CLI commands in sequence" を must/integration として定義している（TC 合計 30 件のうちの 1 件）。

tasks.md T-04 は Actions YAML の更新手順を記述しているが、この変更を確認する automated test の実装指示がどのタスクにも存在しない。tasks.md T-06 がカバーするテストファイルは `reopen-command.test.ts`、`event-journal-operator-event.test.ts`、`command-registry-reopen.test.ts` の 3 ファイルのみで、Actions YAML を読み取るテストファイルへの言及がない。

TC-019 が integration/automated（category: integration）と分類されているため、何らかの自動検証が期待されるが、その実装方法が未定義である。

---

### Finding 4 (MEDIUM): TC-017「general guard forbids awaiting-archive → awaiting-resume」の実装指示が欠如

**対象**: `test-cases.md` TC-017 / `tasks.md` T-01

spec.md は「`canTransition("awaiting-archive", "awaiting-resume")` without opt-in returns false」を明示的なシナリオとして定義し、TC-017 はそれを must 優先度でカバーしている。

しかし tasks.md T-01 は「TC-016: 呼び出しターゲットを awaiting-resume に変更」と「TC-016-b: `{ allowReopen: false }` では throw する」のみを指示し、`canTransition("awaiting-archive", "awaiting-resume")` が `false` を返すことを明示的にアサートするテストの追加を指示していない。

既存の TC-017 は `awaiting-archive → running` を対象とした 3 つのサブテストで構成されており、`→ awaiting-resume` のガード挙動を直接検証するアサーションが存在しない。REOPEN_TRANSITIONS に `awaiting-resume` が追加されても `VALID_TRANSITIONS["awaiting-archive"]` は変更されないため `canTransition` は変わらず `false` を返すが、これを確認するテストの実装指示が tasks.md に存在しない。

---

### Finding 5 (LOW): core-invariants.test.ts の prose コメントが D2 後に不正確になる

**対象**: `tests/unit/architecture/core-invariants.test.ts` 行 1193–1195 / `tasks.md` T-05

B-17 アーキテクチャテストのコメントは「awaiting-archive → **running** transition」と記述されているが（`{ allowReopen: true }` が unlocks する遷移として）、D2 後は「awaiting-archive → **awaiting-resume** transition」が正しい。

tasks.md T-05 は `architecture/conformance.md` の更新のみを指示し、`core-invariants.test.ts` の prose コメント更新を含めていない。テストロジック自体は不変（`allowReopen: true` リテラルのコールサイト確認）なので test は green のままだが、コメントが誤解を招く。

---

### Finding 6 (LOW): `--reason` の入力長に関する仕様上の制約なし

**対象**: `spec.md` / `tasks.md` T-02

`--reason` で指定されたテキストは `events.jsonl`（append-only journal）に記録される。spec.md および tasks.md には文字数・内容の制限が定義されていない。CLI ツールのため XSS などのリスクはないが、極端に長い reason 文字列は journal を肥大化させる可能性がある。実装時に長さ制限（例: 2000 文字）を加えるかどうかを確認することを推奨する。
