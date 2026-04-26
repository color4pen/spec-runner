# Test Cases: 2026-04-25-bootstrap-detection-on-register

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration/e2e): 12
- **Manual**: 1
- **Priority**: must: 9, should: 3, could: 1

## Test Cases

### TC-001: 両ファイルが存在する場合に ready を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1, tasks.md 3.1, request.md 受け入れ基準

**GIVEN** `getFileContent('openspec/project.md')` が非 null を返し、`getDirectoryContents('requests/active/')` が 1 件以上の配列を返す
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'ready'` を返す

---

### TC-002: openspec/project.md が存在しない場合に uninitialized を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1, tasks.md 3.1, request.md 受け入れ基準

**GIVEN** `getFileContent('openspec/project.md')` が null を返し（ファイル不在）、`getDirectoryContents('requests/active/')` が 1 件以上の配列を返す
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'uninitialized'` を返す

---

### TC-003: requests/active/ が存在しない場合に uninitialized を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1, tasks.md 3.1, request.md 受け入れ基準

**GIVEN** `getFileContent('openspec/project.md')` が非 null を返し、`getDirectoryContents('requests/active/')` が空配列を返す（ディレクトリ不在）
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'uninitialized'` を返す

---

### TC-004: 両ファイルとも存在しない場合に uninitialized を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1, tasks.md 3.1

**GIVEN** `getFileContent('openspec/project.md')` が null を返し、`getDirectoryContents('requests/active/')` が空配列を返す
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'uninitialized'` を返す

---

### TC-005: getFileContent がエラーをスローした場合に uninitialized を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 1.2, request.md 受け入れ基準

**GIVEN** `getFileContent('openspec/project.md')` がネットワークエラーをスローする
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'uninitialized'` を返す（例外を再スローしない）

---

### TC-006: getDirectoryContents がエラーをスローした場合に uninitialized を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 1.2

**GIVEN** `getDirectoryContents('requests/active/')` がレートリミットエラーをスローする
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `'uninitialized'` を返す（例外を再スローしない）

---

### TC-007: 両 API 呼び出しが並列で実行される

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3, tasks.md 1.1, proposal.md

**GIVEN** `getFileContent` と `getDirectoryContents` の両関数がモックされている
**WHEN** `detectBootstrapStatus(token, owner, repo, defaultBranch)` を呼び出す
**THEN** `getFileContent('openspec/project.md')` と `getDirectoryContents('requests/active/')` が両方とも呼び出される（各 1 回、Promise.all による並列呼び出し構造）

---

### TC-008: bootstrap 済みリポジトリが ready で INSERT される

**Category**: integration
**Priority**: must
**Source**: design.md Goals, tasks.md 2.3, request.md 受け入れ基準

**GIVEN** `detectBootstrapStatus()` が `'ready'` を返す状態（openspec/project.md と requests/active/ が存在するリポジトリ）
**WHEN** `registerRepository()` を呼び出す
**THEN** DB に `bootstrap_status: 'ready'` でレコードが INSERT される

---

### TC-009: 未セットアップリポジトリが uninitialized で INSERT される

**Category**: integration
**Priority**: must
**Source**: design.md Goals, tasks.md 2.3, request.md 受け入れ基準

**GIVEN** `detectBootstrapStatus()` が `'uninitialized'` を返す状態（判定ファイルが存在しないリポジトリ）
**WHEN** `registerRepository()` を呼び出す
**THEN** DB に `bootstrap_status: 'uninitialized'` でレコードが INSERT される

---

### TC-010: GitHub API エラー時に registerRepository が登録を完了する

**Category**: integration
**Priority**: should
**Source**: design.md Decision 4, proposal.md

**GIVEN** bootstrap 判定用の GitHub API 呼び出しがエラーをスローする（ネットワーク障害等）
**WHEN** `registerRepository()` を呼び出す
**THEN** エラーをスローせずに処理が完了し、DB に `bootstrap_status: 'uninitialized'` でレコードが INSERT される

---

### TC-011: 既存の registerRepository テストが非退行である

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.3

**GIVEN** 本変更前に通過していた registerRepository の既存テストスイート
**WHEN** 本変更後のコードに対して既存テストを実行する
**THEN** 全テストが PASS する（API 契約の変更なし）

---

### TC-012: detectBootstrapStatus が指定した defaultBranch を参照してチェックする

**Category**: unit
**Priority**: should
**Source**: design.md Risks/Trade-offs（default branch のみ参照）, tasks.md 1.1

**GIVEN** `defaultBranch` に `'develop'` を指定して呼び出す
**WHEN** `detectBootstrapStatus(token, owner, repo, 'develop')` を呼び出す
**THEN** `getFileContent` と `getDirectoryContents` の両呼び出しが `'develop'` ブランチを参照するパラメータで実行される

---

### TC-013: bootstrap 済みリポジトリ登録後に bootstrap フローがスキップされる

**Category**: manual
**Priority**: could
**Source**: proposal.md（不要な bootstrap フローが発生しない）

**GIVEN** openspec-workflow セットアップ済みのリポジトリ（openspec/project.md と requests/active/ の両方が存在）を登録する
**WHEN** 登録完了後に該当リポジトリのダッシュボードや次ステップ案内を確認する
**THEN** bootstrap フローへの誘導が表示されず、即座に利用可能な状態として表示される
