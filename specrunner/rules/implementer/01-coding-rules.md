<!-- このファイルは specrunner rules new で生成されました。
CLI はこのファイルの中身を解釈しません。書き手の自然文で自由に書いてください。
推奨見出しは強制ではありません — 削除・追加・並べ替えは自由です。
番号 prefix (NN-) が follow-up の実行順序を決めます。
順序の方針: 重要度が高いルールを末尾に配置すると recency bias により効果的です。 -->

## やめてほしいこと

- `src/core/` から `src/adapter/` を直接 import しない。依存方向は adapter → core の一方向。逆参照が必要な場合は `src/core/port/` にインターフェースを定義する
- `executor.ts` にロジックを直接追加して肥大化させない。新規ロジックは sibling file に切り出す (`commit-push.ts`, `rules-resolve.ts` と同じパターン)
- `node:fs` を `src/core/` 内で直接 import しない。injectable な seam (`fsAdapter`, `spawnFn` 等) を経由する

## こうしてほしいこと

- 新規モジュールは free function + dependency object パターンで書く
- テストでは実 fs ではなく injectable seam を mock する
- step 定義 (`src/core/step/*.ts`) は宣言のみ、振る舞いは executor に任せる
- agent の出力にフォーマットを強制する場合は、step 定義の `followUpPrompt` で self-check を実装する（prompt に書くだけでは agent が準拠しない）

## 例外

- `src/core/step/executor.ts` と `src/util/` は既に `node:fs` を直接 import している。既存パターンと同等の用途であれば許容
