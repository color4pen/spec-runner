# Tasks: findingRef 検証の EISDIR 誤判定修正

## T-01: local runtime の verifyFindingRefs を fs.stat ベースに修正

対象: `src/core/runtime/local.ts`

- [ ] `fs.readFile` による存在判定を `fs.stat` に置き換える
- [ ] `stat` が throw した場合（ENOENT 等）→ `nonExistent.push(ref)` して continue（従来通り）
- [ ] `stat.isDirectory()` が true かつ `ref.line === undefined` → continue（existent 扱い）
- [ ] `stat.isDirectory()` が true かつ `ref.line !== undefined` → `nonExistent.push(ref)` して continue（不正 ref）
- [ ] `stat.isDirectory()` が false（ファイル）→ `ref.line` が指定されている場合のみ `fs.readFile` で行数 check（従来ロジックと同じ）

**Acceptance Criteria**:
- 実在ディレクトリを `file` に持ち `line` なしの FindingRef が nonExistent に含まれない
- 実在ディレクトリを `file` に持ち `line` ありの FindingRef が nonExistent に含まれる
- 存在しないパスの FindingRef が nonExistent に含まれる（退行なし）
- 実在ファイルで `line` が行数内の FindingRef が nonExistent に含まれない（退行なし）
- 実在ファイルで `line` が行数超過の FindingRef が nonExistent に含まれる（退行なし）

## T-02: managed runtime の verifyFindingRefs にディレクトリ検出を追加

対象: `src/core/runtime/managed.ts`

- [ ] `getRawFile` 返却後、`content !== null` の場合に `JSON.parse(content)` を試みる
- [ ] parse 成功かつ `Array.isArray(parsed)` が true → ディレクトリと判定
- [ ] ディレクトリかつ `ref.line === undefined` → continue（existent 扱い）
- [ ] ディレクトリかつ `ref.line !== undefined` → `nonExistent.push(ref)` して continue（不正 ref）
- [ ] それ以外（ファイル）→ 従来の line check ロジックをそのまま適用

**Acceptance Criteria**:
- `getRawFile` が JSON 配列を返す（ディレクトリ相当）かつ `line` なしの FindingRef が nonExistent に含まれない
- `getRawFile` が JSON 配列を返すかつ `line` ありの FindingRef が nonExistent に含まれる
- `getRawFile` が null を返す FindingRef が nonExistent に含まれる（退行なし）
- `getRawFile` が通常文字列を返し `line` が行数超過の FindingRef が nonExistent に含まれる（退行なし）
- `branch === null` の場合に全 refs が nonExistent として返る（退行なし）

## T-03: テストケースを追加（verify-finding-refs.test.ts）

対象: `tests/unit/core/runtime/verify-finding-refs.test.ts`

- [ ] `TC-VFR-L-006`: local — 実在ディレクトリ（line なし）→ 返却配列が空
  - `fs.mkdir` で tempDir 配下にディレクトリを作成し `verifyFindingRefs` で参照
- [ ] `TC-VFR-L-007`: local — 実在ディレクトリ + line → 返却配列に含まれる
  - 同ディレクトリを使い `line: 5` を指定
- [ ] `TC-VFR-M-006`: managed — `getRawFile` が JSON 配列文字列を返す（line なし）→ 返却配列が空
  - `buildMockGitHubClient(async () => JSON.stringify([{name: "foo.ts", type: "file"}]))` を使用
- [ ] `TC-VFR-M-007`: managed — `getRawFile` が JSON 配列文字列を返す + line → 返却配列に含まれる
  - 同 mock に `line: 5` を指定

**Acceptance Criteria**:
- 4 つのテストケースが追加され、いずれも pass する
- ファイルヘッダーのテストケース一覧コメント（TC-VFR-L-006, TC-VFR-L-007, TC-VFR-M-006, TC-VFR-M-007）が追記される
- 既存の TC-VFR-L-001〜005 / TC-VFR-M-001〜005 が引き続き pass する

## T-04: typecheck && test の確認

- [ ] `bun run typecheck` が error なし
- [ ] `bun run test` が全 pass（新規 + 既存）

**Acceptance Criteria**:
- `bun run typecheck` exit code 0
- `bun run test` exit code 0（`verify-finding-refs.test.ts` を含む全テスト）
