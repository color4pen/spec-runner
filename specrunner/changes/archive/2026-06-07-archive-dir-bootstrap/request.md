# job finish の初回アーカイブで archive ディレクトリ不在により git mv が失敗する

## Meta

- **type**: bug-fix
- **slug**: archive-dir-bootstrap
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

一度も `job finish` していないリポジトリで `specrunner job finish <slug>` を実行すると、archive phase の `git mv` が exit 128 で失敗する。

```
Failed Step:    archive-change-folder
Detected State: git mv specrunner/changes/<slug> → specrunner/changes/archive/<date>-<slug> failed (exit 128)
                fatal: renaming '...' failed: No such file or directory
```

原因は `git mv` の移動先の親ディレクトリ `specrunner/changes/archive/` が存在しないこと。`specrunner init` は `specrunner/{drafts,changes}/` を作るが `changes/archive/` は作らない。一度 archive 済みなら存在するため踏まないが、**初回 finish では必ず失敗する**。

該当箇所: `src/core/finish/archive-change-folder.ts` の `git mv` 実行（親ディレクトリの存在を前提にしている）。

## 要件

1. `archive-change-folder` step が `git mv` を実行する前に、移動先の親ディレクトリ `specrunner/changes/archive/` が存在しなければ作成する。
2. 一度も archive していない新規リポジトリで初回 `job finish` が `archive-change-folder` で失敗せず完走する。

## スコープ外

- 既に `archive/` が存在するリポジトリでの挙動（変更しない）。

## 受け入れ基準

- [ ] 一度も archive していないリポジトリで初回 `job finish` が `archive-change-folder` を通過し archive が成功する
- [ ] `archive/` が既に存在するリポジトリでの archive 挙動が変わらない
- [ ] `archive/` 不在時にディレクトリが作成されてから `git mv` が成功することを検証するユニットテストを、既存の `tests/unit/core/finish/archive-change-folder.test.ts` に追加する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- ディレクトリ保証は `archive-change-folder` step 実行時に行う（init 時の `.gitkeep` 生成ではない）。実行時保証なら旧バージョンの init で作られた既存リポジトリも初回 finish で同じ経路を通り、保証が漏れない。idempotent なため archive 済みリポジトリでも無害。
