# Design: findingRef 検証の EISDIR 誤判定修正

## Context

`verifyFindingRefs` は judge/request-review ステップ完了後に、finding が参照するパスが実在するかを検証する幻覚ガードである。存在しないパスを引用した finding が verdict に影響する場合、verdict を escalation に強制する。

不在系の finding（「テストファイルが存在しない」等）に対して、reviewer は自然な参照先として実在するディレクトリパスを引用する。Local runtime の `verifyFindingRefs`（`src/core/runtime/local.ts:614-634`）は `fs.readFile()` の成否で存在判定しているが、ディレクトリに対して `fs.readFile()` は `EISDIR` を投げ、`ENOENT` と同じ catch ブロックに落ちる。結果として実在ディレクトリが非存在扱いされ、verdict が escalation に強制される。

Managed runtime（`src/core/runtime/managed.ts:330-355`）は `getRawFile()`（`Accept: application/vnd.github.v3.raw`）を使用する。GitHub Contents API はディレクトリパスに対して JSON 配列を 200 で返すため、`content !== null` となり、no-line のケースは偶発的に正しく動作する。ただし `dir + line` のケースは JSON 配列の行数で line check が走り、結果が不定になる。

## Goals / Non-Goals

**Goals**:
- Local runtime で実在ディレクトリが nonExistent 扱いされないよう修正する
- Managed runtime でディレクトリを明示的に検出し、local と対称な挙動にする
- `dir + line` 指定を不正 ref として両 runtime で一致させる
- 幻覚ガード本来の目的（存在しないパスの引用を escalation に強制）を維持する

**Non-Goals**:
- 不在系 finding の reviewer prompt 強化（ディレクトリでなくファイルを引くよう誘導する）
- `verifyFindingRefs` の対象 finding の範囲変更（verdict 影響 findings のみという方針は不変）

## Decisions

### D1: local runtime — `fs.readFile` → `fs.stat` + 条件付き `readFile`

`fs.stat(absPath)` でパスの存在と種別を判定する。

- `stat` が throw（ENOENT 等）→ nonExistent
- `stat` 成功 + `isDirectory()` → existent（line なし）または nonExistent（line あり、不正 ref）
- `stat` 成功 + ファイル → line check のみ従来通り `readFile` で実施

**Rationale**: `fs.stat` は EISDIR を投げず、存在判定とファイル種別判定を明確に分離できる。`fs.access` も選択肢だが種別が取れないため不適。

**Alternatives**:
- `fs.readFile` のエラーコードを判別（`err.code === "EISDIR"` で分岐）: catch ブロックで型アサーションが必要で脆い。エラー識別より stat で種別を取る方が意図が明確。

### D2: managed runtime — JSON 配列ヒューリスティックでディレクトリ検出

`getRawFile` の返却値を `JSON.parse` し、Array かどうかで directory を判定する。GitHub Contents API はディレクトリに対して必ず JSON 配列を返す。

- `content === null` → nonExistent
- `content` が JSON 配列にパース可能 → directory 扱い（line あり → nonExistent、line なし → existent）
- それ以外 → ファイル扱いで従来通り line check

**Rationale**: 新規 API メソッドを `GitHubClient` インターフェースに追加せずに済み、既存の `getRawFile` 呼び出し 1 回で完結する。GitHub Contents API の仕様として、ディレクトリへの raw リクエストに対する JSON 配列返却は安定した動作である。

**Alternatives**:
- `GitHubClient` に `getPathType(owner, repo, branch, path): Promise<"file" | "dir" | null>` を追加: 明示的で堅牢だが、kernel インターフェース・adapter 実装・全 mock の変更が必要でバグ修正のスコープとして過大。
- `EISDIR` 相当のエラーコード識別を managed にも適用: managed は HTTP API 経由で EISDIR が発生しないため非対称。

### D3: `dir + line` は不正 ref として nonExistent 扱い

ディレクトリパスに行番号を指定することは意味を持たない。両 runtime でこれを nonExistent として扱い、幻覚ガードを発動させる。

**Rationale**: ディレクトリに行番号を指定した finding はレビュアーの引用ミスである可能性が高く、escalation させることが安全側の判断として適切。

## Risks / Trade-offs

[Risk] JSON 配列ヒューリスティック（D2）が JSON 配列コンテンツのファイルを誤ってディレクトリと判定する可能性がある。
→ Mitigation: Finding の `file` フィールドとして参照されるようなソースコードファイルが純粋な JSON 配列である（かつ `line` も指定されている）ケースは実務上ほぼ発生しない。誤判定しても `line` なしであれば existent のまま、`line` ありでも escalation（保守的）になるのみで、幻覚ガードの方向性と一致する。

[Risk] managed runtime でディレクトリの `getRawFile` が将来 JSON 配列を返さなくなる（GitHub API 変更）。
→ Mitigation: テストで mock を使って挙動を固定しており、API 変更時にテストが失敗する。その時点で対処すればよい。

## Open Questions

なし（managed runtime のディレクトリ検出については D2 の方針で確定）
