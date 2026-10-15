---
title: 位置引数がスキーマの外でキー名の配列として宣言されている
theme: natural-api
---

# Problem

位置引数は、`args` のスキーマとは別に、`positional` にキー名の配列で、可変長引数は `variadic` にキー名で指定する。

```ts
args: z.object({
  destination: z.string(),
  files: z.array(z.string()),
}),
positional: ["destination"],
variadic: "files",
```

スキーマを読んでも、どのフィールドが位置引数か、何番目かは分からない。位置引数の順序や可変長引数の位置といった構造が、スキーマの型ではなく文字列のキー名で表されている。

そのため `defineCommand` は、スキーマとキー名の整合を実行時に検査している。

- `positional` と `variadic` のキーがスキーマに存在すること
- `positional` 内の重複、`positional` と `variadic` の重複
- 位置引数に配列や boolean を使っていないこと、`variadic` が配列であること
- 必須の位置引数が任意の位置引数の後に来ないこと
- 位置引数に `argOptions` の `alias` を付けていないこと

利用者は、位置引数の順序や可変長引数を、スキーマとは別の場所で正しく宣言する必要があり、誤りは型検査ではなく実行時に分かる。

解決後は、位置引数の順序、任意の位置引数、可変長引数がスキーマから読み取れ、その誤りができるだけ型で分かる。

# Rules

- 任意または既定値ありの位置引数は、必須の位置引数より後に置く（README「Define and run a command」）。
- 可変長引数は常に末尾で、名前付きオプションに含まれず、値がなければ空配列になる（README）。
- 位置引数とサブコマンドは同じコマンドに定義できない（`defineCommand`）。

# Open Decisions

- スキーマ上の表現（専用フィールドの名前と型）。
- 位置引数のヘルプ上のラベルの指定方法。0010 の結論はこれに依存する。
- 解析結果での位置引数の値の受け取り方。
- `positional` と `variadic` を削除するときの移行方法。

# Related Files

- `src/command.ts` — `positional` と `variadic` の型と `defineCommand` の検査
- `src/parser.ts` — 位置引数と可変長引数の割り当て
- `src/usage.ts` — 位置引数のヘルプ表示
- `README.md` — 「Define and run a command」の位置引数と可変長引数の説明
- `docs/issues/0010-arg-display-label-fields/issue.md` — 位置引数のラベル指定
