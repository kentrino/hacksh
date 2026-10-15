# 案A: `valueName` に一本化する

`ArgOptions` から `name` を削除し、位置引数・可変長引数・名前付きオプションのすべてで `valueName` を値のラベルとして使う。

```ts
argOptions: {
  size: { valueName: "SIZE" },     // <SIZE>
  format: { valueName: "FORMAT" }, // --format=<FORMAT>
  files: { valueName: "INPUT" },   // [INPUT...]
}
```

- 位置引数の `<SIZE>` も名前付きオプションの `<FORMAT>` も「値のプレースホルダー」として一つの概念で説明できる。
- 名前付きオプションに対して、フラグ名を変えるように読める `name` を避けられる。
- clap は位置引数とオプションの両方で `value_name` を使っている。
- `name` を使っている利用者には破壊的変更になる。
