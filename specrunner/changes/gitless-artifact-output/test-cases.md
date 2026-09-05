# Test Cases: Git非依存 artifact-output profile

## Summary

- **Total**: 76 cases
- **Automated** (unit/integration/gate): 75
- **Manual**: 1
- **Priority**: must: 60, should: 15, could: 1

---

<!-- ============================================================
  TC-001 〜 TC-041: Scenario 由来（spec.md）
  GWT 省略、Source 参照のみ
  ============================================================ -->

### TC-001: 最小縦断で git コマンドが spawn されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact-output profile shall not invoke git or GitHub from SpecRunner itself > Scenario: The minimal vertical run spawns no git command

### TC-002: guarded seam を通じた git 呼び出しが fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The artifact-output profile shall not invoke git or GitHub from SpecRunner itself > Scenario: A git invocation attempted through the guarded seam fails closed

### TC-003: source に .git ディレクトリが存在しても authority として参照されない

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: The artifact-output profile shall not invoke git or GitHub from SpecRunner itself > Scenario: A .git directory in the source is not consulted as authority

### TC-004: 成功した run の後で source が変更されていない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The run shall leave the source directory unchanged on success and on failure > Scenario: Source is unchanged after a successful run

### TC-005: 失敗した run の後で source が変更されていない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The run shall leave the source directory unchanged on success and on failure > Scenario: Source is unchanged after a failed run

### TC-006: run 中に source が変更されると検出される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The run shall leave the source directory unchanged on success and on failure > Scenario: Source mutated during the run is detected

### TC-007: 同一 tree の 2 つのスナップショットが同じ digest を生成する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Revision identity shall be a recomputable, machine-independent snapshot digest > Scenario: Two independent snapshots of identical trees produce identical digests

### TC-008: 実行 bit の変化で digest が変わる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Revision identity shall be a recomputable, machine-independent snapshot digest > Scenario: An executable bit change alters the digest

### TC-009: 空ディレクトリが identity の一部になる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Revision identity shall be a recomputable, machine-independent snapshot digest > Scenario: An empty directory is part of the identity

### TC-010: symlink はターゲット文字列で識別され、ターゲットの内容ではない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Revision identity shall be a recomputable, machine-independent snapshot digest > Scenario: Symlinks are identified by their target, not by the target's content

### TC-011: 読み取れないファイルがあるとスナップショットが unavailable になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Snapshot and comparison failures shall never be reported as "no change" > Scenario: An unreadable file makes the snapshot unavailable

### TC-012: 非対応の entry kind があるとスナップショットが unavailable になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Snapshot and comparison failures shall never be reported as "no change" > Scenario: An unsupported entry kind makes the snapshot unavailable

### TC-013: source root 外を指す symlink があるとスナップショットが unavailable になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Snapshot and comparison failures shall never be reported as "no change" > Scenario: A symlink escaping the source root makes the snapshot unavailable

### TC-014: 変更集合が unavailable のとき空配列にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Snapshot and comparison failures shall never be reported as "no change" > Scenario: An unavailable change set does not become an empty change set

### TC-015: 追加・変更・削除がすべて正しく導出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The change set shall be derived from snapshot comparison and shall cover non-text changes > Scenario: Added, modified, and deleted files are all derived

### TC-016: バイナリ変更が変更集合に現れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The change set shall be derived from snapshot comparison and shall cover non-text changes > Scenario: A binary change appears in the change set

### TC-017: mode のみの変更が modified として現れ、両 mode が記録される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The change set shall be derived from snapshot comparison and shall cover non-text changes > Scenario: A mode-only change appears as modified

### TC-018: ファイル移動が delete + add として表現され rename entry が生成されない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The change set shall be derived from snapshot comparison and shall cover non-text changes > Scenario: A moved file is represented as delete plus add

### TC-019: バイナリ変更が patch から除外され payload に含まれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Changes not representable as a text patch shall not be dropped from the artifact > Scenario: A binary change is omitted from the patch but present in the payload

### TC-020: symlink 変更が manifest に kind と target 付きで記録される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Changes not representable as a text patch shall not be dropped from the artifact > Scenario: A symlink change is recorded in the manifest

### TC-021: 削除が patch と manifest の両方に現れる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Changes not representable as a text patch shall not be dropped from the artifact > Scenario: A deletion is present in both patch and manifest

### TC-022: 表現不能な entry がある場合に finalize が失敗する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Changes not representable as a text patch shall not be dropped from the artifact > Scenario: An unrepresentable entry prevents finalization

### TC-023: 成功した run で artifact 一式が揃う

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact shall be a single output unit finalized atomically and never auto-applied > Scenario: A successful run produces the complete artifact set

### TC-024: finalize 前の失敗で artifact ディレクトリが存在しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact shall be a single output unit finalized atomically and never auto-applied > Scenario: A failure before finalization leaves no artifact directory

### TC-025: 適用手順が baseline digest 一致を前提として宣言する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact shall be a single output unit finalized atomically and never auto-applied > Scenario: Apply instructions declare the baseline-digest precondition

### TC-026: verification record と review record が candidate digest を保持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Verification and review records shall be bound to the candidate revision they evaluated > Scenario: Verification and review records carry the candidate digest

### TC-027: verification 中の candidate 変更で run が revision-drift として halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Verification and review records shall be bound to the candidate revision they evaluated > Scenario: Candidate mutation during verification halts the run

### TC-028: 非対応ステップが実行前に列挙される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Git-dependent operations shall be enumerated by preflight before execution starts > Scenario: Unsupported steps are listed before execution

### TC-029: 実行不能な pipeline がワークスペース作成前に停止する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Git-dependent operations shall be enumerated by preflight before execution starts > Scenario: A non-executable pipeline stops before any workspace is created

### TC-030: Issue 起点の entry が preflight で拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Git-dependent operations shall be enumerated by preflight before execution starts > Scenario: Issue-originated entry is rejected by preflight

### TC-031: git-pr profile で既存 pipeline の unsupported が 0 件になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Git-dependent operations shall be enumerated by preflight before execution starts > Scenario: The existing git profile reports no unsupported steps

### TC-032: run record が resume を non-supported と宣言する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact-output profile shall declare its lifecycle limits instead of implying parity > Scenario: Run record declares resume as unsupported

### TC-033: halt した run が terminal status と evidence を記録する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact-output profile shall declare its lifecycle limits instead of implying parity > Scenario: A halted run records its terminal state and evidence

### TC-034: run evidence が agent 書き込み可能領域のみに存在しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The artifact-output profile shall declare its lifecycle limits instead of implying parity > Scenario: Run evidence is not stored only in the agent-writable area

### TC-035: reviewer context が candidate revision と変更サマリーを保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Agent and reviewer context shall be derived from snapshots instead of git history > Scenario: Reviewer context carries the candidate revision and change summary

### TC-036: 履歴が存在しないことが空文字ではなく明示文言で表現される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Agent and reviewer context shall be derived from snapshots instead of git history > Scenario: Missing history is stated, not blank

### TC-037: guide topic が capability テーブルのすべての unsupported operation を列挙する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The profile's guarantees and unsupported operations shall be documented in the CLI and README > Scenario: The guide topic lists every unsupported operation from the capability table

### TC-038: guide topic が profile と --no-worktree の違いを区別して説明する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The profile's guarantees and unsupported operations shall be documented in the CLI and README > Scenario: The guide topic distinguishes the profile from --no-worktree

### TC-039: README が profile と preview 状態を説明する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The profile's guarantees and unsupported operations shall be documented in the CLI and README > Scenario: README documents the profile and its preview status

### TC-040: 既存の runtime モジュールが新規 profile モジュールを import しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: Existing git profiles shall be unaffected by this change > Scenario: Existing runtime modules do not import the new profile modules

`tests/unit/architecture/artifact-output-git-free.test.ts` の逆方向 import grep 検査が充足する（`bun run test`）。

### TC-041: デフォルトの job start フラグ集合が変更されていない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: Existing git profiles shall be unaffected by this change > Scenario: The default job start path is unchanged

`tests/unit/architecture/artifact-output-git-free.test.ts` の `RUN_JOB_FLAGS` 不変 assertion が充足する（`bun run test`）。

---

<!-- ============================================================
  TC-042 〜 TC-076: 非 Scenario 由来（design.md / tasks.md）
  GWT 必須
  ============================================================ -->

### TC-042: classifyContent がバイナリバイトを正しく判定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** NUL バイトを含む `Uint8Array` と、有効な UTF-8 テキストのみの `Uint8Array` がある
**WHEN** 各配列に対して `classifyContent` を呼ぶ
**THEN** NUL を含む入力は `"binary"` を返し、UTF-8 テキストのみの入力は `"text"` を返す

### TC-043: buildUnifiedDiff が追加のみ・削除のみ・空ファイル・末尾改行差分を処理できる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** 4 つのテストケース: (1) 空文字列 old + 非空 new、(2) 非空 old + 空文字列 new、(3) 両側空文字列、(4) 末尾改行あり old と末尾改行なし new
**WHEN** 各ケースで `buildUnifiedDiff` を呼ぶ
**THEN** (1) は追加 hunk のみ含む diff を返す; (2) は削除 hunk のみ含む diff を返す; (3) は空文字列を返す; (4) は `\ No newline at end of file` マーカーを含む diff を返す

### TC-044: unified-diff.ts が import 文を 1 つも持たない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01

`src/util/__tests__/unified-diff.test.ts` が `unified-diff.ts` の import 数を assert する（`bun run test`）。または `bun run lint` の import-ratchet ルールが充足する。

### TC-045: buildUnifiedDiff が生成した hunk header が parseUnifiedDiffChangedLines で解析できる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** テキスト変更を持つ old / new のペア
**WHEN** `buildUnifiedDiff` で diff を生成し、結果を `parseUnifiedDiffChangedLines` へ渡す
**THEN** 例外なく解析でき、変更行番号が元の入力と一致する

### TC-046: snapshot digest が `sha256:` プレフィックス + 64 桁の hex 文字列である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 任意の有効な entry 配列と exclusion 配列
**WHEN** `computeSnapshotDigest` を呼ぶ
**THEN** 返り値は正規表現 `^sha256:[0-9a-f]{64}$` に一致する

### TC-047: digest.ts が fs および child_process を import しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-02

`tests/unit/architecture/artifact-output-git-free.test.ts` の import grep 検査が充足する（`bun run test`）。

### TC-048: exclusion の変更が snapshot digest を変化させる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** 同一の entry 配列で exclusion が `[".git/"]` のスナップショット digest を計算する
**WHEN** exclusion を `[]` に変えて同じ entry 配列で再計算する
**THEN** 2 つの digest が異なる

### TC-049: `.git/` がデフォルト exclusion として適用され `snapshot.exclusions` に記録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `.git/` サブディレクトリを含む一時ディレクトリ
**WHEN** exclusions を指定せずに `collectSnapshot` を呼ぶ
**THEN** 結果の `snapshot.exclusions` に `".git/"` が含まれ、`.git/` 配下のエントリが snapshot entries に存在しない

### TC-050: collectSnapshot が entries を path byte 昇順で返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** 名前の byte 順がランダムになるよう命名された複数ファイルを持つ一時ディレクトリ
**WHEN** `collectSnapshot` を呼ぶ
**THEN** 結果の entries は path を UTF-8 byte 昇順で並べた配列と一致する

### TC-051: exclusion が異なる 2 つの snapshot の比較が unavailable を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** exclusion が `[".git/"]` の baseline snapshot と exclusion が `[]` の candidate snapshot
**WHEN** `deriveChangeSet` を呼ぶ
**THEN** 結果は `{ kind: "unavailable" }` である

### TC-052: compare.ts が fs および child_process を import しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04

`tests/unit/architecture/artifact-output-git-free.test.ts` の import grep 検査が充足する（`bun run test`）。

### TC-053: preflight.ts が fs および child_process を import しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05

`tests/unit/architecture/artifact-output-git-free.test.ts` の import grep 検査が充足する（`bun run test`）。

### TC-054: 既存の runtime-capability-gate.ts に変更がない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05

`tests/unit/architecture/artifact-output-git-free.test.ts` が `runtime-capability-gate.ts` の変更なしを assert する（`bun run test`）。あるいは `git diff` での diff が 0 行であることを CI が確認する。

### TC-055: materializeCandidate 後の candidate snapshot digest が baseline digest と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** テキスト・バイナリ・symlink・実行 bit 付きファイル・空ディレクトリを含む source ディレクトリのスナップショット（baseline）
**WHEN** `materializeCandidate(sourceRoot, candidateRoot, snapshot)` を呼ぶ
**THEN** candidate に対して `collectSnapshot` を実行した結果の digest が baseline digest と等しい

### TC-056: materializeCandidate が symlink を追跡せず symlink として再作成する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** source 内にターゲットファイルへの symlink が存在する
**WHEN** `materializeCandidate` を呼ぶ
**THEN** candidate 内の対応パスが symlink であり、通常ファイルになっていない; lstat の `isSymbolicLink()` が true を返す

### TC-057: guarded spawn が git・gh 以外のコマンドを inner spawn へ委譲する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** 呼び出しを記録する spy 関数を inner として `createGitDenyingSpawn` で生成した guarded spawn
**WHEN** `"node"` コマンドで guarded spawn を呼ぶ
**THEN** inner spy が 1 回呼ばれ、同じ引数が渡される; エラーは発生しない

### TC-058: guarded spawn のエラーメッセージが agent subprocess 境界の説明を含む

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-06 / design.md > D11

**GIVEN** `createGitDenyingSpawn` で生成した guarded spawn
**WHEN** `"git"` コマンドで guarded spawn を呼ぶ
**THEN** 投げられたエラーのメッセージが `"agent subprocess"` または同等の文言を含む

### TC-059: size 上限超過の text ファイルが `omitted:size` に分類されパッチに含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D8

**GIVEN** patch.ts の size 上限定数を超えるサイズの text ファイルが変更された変更集合
**WHEN** `buildPatch` 相当の関数を呼ぶ
**THEN** そのエントリの patch 分類は `"omitted:size"` であり `changes.patch` にそのパスの hunk が含まれない; payload には candidate bytes が含まれる

### TC-060: manifest の patch coverage フィールドに size 上限定数が記録される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D9

**GIVEN** `buildManifest` の入力に patch coverage と size 上限を提供する
**WHEN** `buildManifest` を呼んで `manifest.json` を生成する
**THEN** `manifest.patchCoverage.maxFileSizeBytes`（または同等フィールド）に数値が記録される

### TC-061: APPLY.md が「自動適用しない」と「baseline digest 一致が前提」を明記している

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / design.md > D9

**GIVEN** `finalizeArtifact` が正常完了した artifact ディレクトリ
**WHEN** `APPLY.md` の内容を読む
**THEN** 「自動適用しない」または "not applied automatically" の文言が存在し、かつ baseline digest 一致を適用の前提とする旨が含まれる

### TC-062: artifact.staging → artifact/ のリネームが atomic であり、途中失敗で artifact/ が残らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / design.md > D9

**GIVEN** `finalizeArtifact` が `manifest.json` を書いた直後にエラーを投げるよう fake した状況
**WHEN** `finalizeArtifact` を呼ぶ
**THEN** `artifact/` ディレクトリが存在しない; `artifact.staging/` の残骸は存在してよいが `artifact/` へのリネームは完了していない

### TC-063: context の履歴セクションが空文字でなく明示文言である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D14

**GIVEN** baseline digest・candidate digest・変更集合を持つ入力
**WHEN** `buildSnapshotContext` を呼ぶ
**THEN** 返り値の history セクション相当の文字列が空文字でなく、"no revision history" または同等の明示的な文言を含む

### TC-064: revision binding が snapshot 不能のとき `bound` を返さない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D10

**GIVEN** 実行前の snapshot が `{ kind: "unavailable" }` を返す fake を持つ `runBoundToCandidateRevision`
**WHEN** `runBoundToCandidateRevision` を呼ぶ
**THEN** 返り値が `{ kind: "unavailable" }` であり `{ kind: "bound" }` にならない

### TC-065: ArtifactOutputRun が全 phase の metrics を収集する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09 / design.md > D16

**GIVEN** すべての seam を注入した `runArtifactOutput` の呼び出し（成功ケース）
**WHEN** run が完了する
**THEN** 返り値の metrics に duration・entry 数・走査 byte 数・artifact 容量・payload 容量・patch 行数の全フィールドが欠落なく含まれる; `run.json` にも同フィールドが記録される

### TC-066: run.ts が GitHub client を型としても import しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09 / design.md > D2

`tests/unit/architecture/artifact-output-git-free.test.ts` の import grep 検査（github-client への型 import も対象）が充足する（`bun run test`）。

### TC-067: 1000 ファイル規模の fixture で縦断が完走し metrics が揃う

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-10 / design.md > D16

**GIVEN** 小ファイルを約 1000 件持つ一時ディレクトリを source とした `runArtifactOutput` の呼び出し
**WHEN** run が完了する
**THEN** 結果の kind が `"completed"` であり、metrics の全フィールドが数値として存在する; 実測値そのものは assert しない

### TC-068: 縦断実行中に SpecRunner 自身が発行した spawn に git・gh が 0 件

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-11 / design.md > D11

**GIVEN** 記録用 spawn 関数を注入した `runArtifactOutput` の縦断呼び出し
**WHEN** run が完了する
**THEN** 記録された spawn calls の command basename 一覧に `"git"` も `"gh"` も含まれない

### TC-069: 新規モジュール tree が git-exec / worktree / github value import を持たない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 / design.md > D11

`tests/unit/architecture/artifact-output-git-free.test.ts` の grep 検査（`util/git-exec`・`core/worktree/`・`adapter/github/`・`kernel/github-client`・`src/git/` への value import が 0 件）が充足する（`bun run test`）。

### TC-070: 新規モジュール tree が process.cwd() の呼び出しを持たない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 / design.md > D11

`tests/unit/architecture/artifact-output-git-free.test.ts` の grep 検査（`process.cwd()` が 0 件）が充足する（`bun run test`）。

### TC-071: 既存の runtime / pipeline / step ディレクトリが新規モジュールを import しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 / spec.md > Requirement: Existing git profiles shall be unaffected by this change

`tests/unit/architecture/artifact-output-git-free.test.ts` の逆方向 import grep 検査（`core/artifact-output` / `core/snapshot` への import が 0 件）が充足する（`bun run test`）。

### TC-072: RUN_JOB_FLAGS が本 change の前後で不変である

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11

`tests/unit/architecture/artifact-output-git-free.test.ts` が `RUN_JOB_FLAGS` の要素集合を snapshot assert する（`bun run test`）。`--source` フラグが追加されていないことを含む。

### TC-073: run.json に `resume.supported === false` が記録される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 / design.md > D13

**GIVEN** 成功した `runArtifactOutput` の実行
**WHEN** run root の `run.json` を読む
**THEN** `resume.supported` フィールドが `false` であり、resume 非対応の旨が記録されている

### TC-074: guide.ts に artifact-output topic を追加すると topic 件数が 1 増える

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** 本 change を適用した `src/core/command/guide.ts`
**WHEN** `src/core/command/__tests__/guide.test.ts` の topic 件数 assertion を見る
**THEN** 件数が（本 change 前の値 + 1）であり、テストが green である

### TC-075: guide topic body に UNSUPPORTED_OPERATIONS の全項目が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12 / design.md > D15

**GIVEN** `UNSUPPORTED_OPERATIONS` テーブルに宣言された operation の id または表示名の一覧
**WHEN** artifact-output guide topic の body 文字列と照合する
**THEN** テーブルの全項目が body に存在し、手書き文字列との乖離がテストで禁止されている

### TC-076: docs/artifact-output-profile.md が必須セクションをすべて含む

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-12 / design.md > D16

`docs/artifact-output-profile.md` を開き、以下が揃っていることを確認する:
- profile 契約の要約（authority / revision identity / lifecycle / 保証差分）
- Git 責務の分類表（snapshot で置換 / profile 固有 / 初期 unsupported）
- Git 前提で停止した call site の一覧
- 置換できた保証 / 置換できない保証
- 新しい runtime / profile 境界
- 実測結果（時間・容量・支配的コスト）の記録
- 続行 / scope 縮小 / 中止の判断と根拠
- 次段階の分割 Issue 案

---

## Result

```yaml
result: completed
total: 76
automated: 75
manual: 1
must: 60
should: 15
could: 1
blocked_reasons: []
```
