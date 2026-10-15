# 案A: `_` フィールドに `z.tuple` で宣言する

`args` のスキーマの `_` フィールドに `z.tuple` を置き、位置引数をその要素として宣言する。`positional` と `variadic` は削除する。

```ts
args: z.object({
  _: z.tuple(
    [z.coerce.number().meta({ title: "SIZE" }), z.string().optional()],
    z.string().meta({ title: "INPUT" }),
  ),
  format: z.enum(["png", "jpg"]).optional(),
});
// args._ は [number, string | undefined, ...string[]]
```

- 要素の並びが位置引数の順序、末尾の `.optional()` が任意の位置引数、rest が可変長引数に対応する。
- 解析結果の型は Zod の tuple の推論がそのまま使われる。
- ラベルは各要素の `.meta({ title })` から取る。この場合 `argOptions` の `name` は不要になる。

## 未決事項

- `title` がない要素のラベル（`ARG1` など）。
- `_` に `z.tuple` 以外（可変長引数だけの `z.array` など）を許すか。
- 値を添字（`args._[0]`）で受け取るため、引数が多いとコードが読みにくい。
- minimist や yargs の `_` は残りの位置引数の配列を指し、意味が一部異なる。
