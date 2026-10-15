---
title: 配列やオブジェクトを名前付きオプションで受け取れない
theme: ai-native
---

# Problem

`defineCommand` は名前付きオプションに配列スキーマを指定しても拒否しないが、どの入力でも検証に失敗する。

```text
--tag a           → --tag: Invalid input: expected array, received string
--tag a --tag b   → --tag: Invalid input: expected array, received string
--tag a,b         → --tag: Invalid input: expected array, received string
```

配列やオブジェクトを渡したい利用者は、`z.string().transform(JSON.parse)` などで文字列から自分で変換するしかなく、その形式はヘルプに現れない。

解決後は、配列やオブジェクトを受け取る名前付きオプションを定義でき、その入力形式がヘルプとエラーから分かる。

# Rules

- カンマ分割や JSON 解釈を、通常の文字列オプションへ暗黙に加えない。

# Open Decisions

- CLI 上の表現（反復指定、区切り文字、JSON、キー付き指定）。
- 解決までの間、名前付きの配列オプションを `defineCommand` で拒否するか。

# Related Files

- `src/command.ts` — `defineCommand` の検査
- `src/parser.ts` — 名前付きオプションの解析
- `src/schema.ts` — `isArrayInput`
