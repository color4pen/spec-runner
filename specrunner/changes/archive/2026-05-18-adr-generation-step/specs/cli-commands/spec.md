# Delta Spec: cli-commands

## ADDED Requirements

### Requirement: `specrunner request template` が scaffold に `adr` フィールドと判断基準コメントを出力する

以下を新規 Requirement として定義する:

---

`specrunner request template` が出力する scaffold の Meta セクションに `- **adr**: false` を `base-branch` の直後に含める。

scaffold には ADR 判断基準を HTML コメントとして含める:

```
<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
```

#### Scenario: scaffold に adr フィールドが含まれる

- **WHEN** `specrunner request template` を実行する
- **THEN** stdout に `- **adr**: false` が出力される
- **AND** `base-branch` 行の直後に出力される

#### Scenario: scaffold に ADR 判断基準コメントが含まれる

- **WHEN** `specrunner request template` を実行する
- **THEN** stdout に `<!-- adr 判断基準:` で始まる HTML コメントが出力される
