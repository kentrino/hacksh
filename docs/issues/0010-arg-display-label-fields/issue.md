---
title: argDisplay の表示名が位置引数とオプションで別フィールドに分かれている
theme: natural-api
---

# Problem

`ArgDisplay` には、ヘルプ上の値のラベルを変えるフィールドが `name` と `valueName` の二つある。位置引数と可変長引数には `name` だけが効き、名前付きオプションには `valueName` だけが効く。

合わない方を指定してもエラーにならず、ヘルプに反映されない。

```ts
argDisplay: { repo: { name: "OWNER/REPO" }, pr: { valueName: "NUMBER" } }
// repo は名前付きオプション、pr は位置引数
```

```text
USAGE demo [OPTIONS] <PR>
  PR  (Required)
  --repo=<repo>  (Required)
```

利用者は、引数が位置引数か名前付きオプションかによってフィールドを使い分ける必要があり、取り違えても気付けない。また、名前付きオプションに対する `name` は、ラベルではなくフラグ名 `--repo` 自体を変えるようにも読める。

解決後は、引数の種類に関係なく、値のラベルの指定方法が一通りに定まる。または、効果のない指定に型かエラーで気付ける。

# Rules

- `argDisplay` はヘルプの表示だけを変え、スキーマのキー、解析結果、検証エラーのパスは変えない（README「Customize help arguments」）。
- `argDisplay` のキーは引数スキーマと照合される。

# Open Decisions

- フィールドを一つにまとめるか、二つのまま誤用を検出するか。
- まとめる場合の名前（`name`、`valueName`、その他）。
- 公開済みのフィールドを変更・削除するときの移行方法。
- 位置引数のラベル指定は、0011 で位置引数をどう宣言するかに依存する。

# Related Files

- `src/command.ts` — `ArgDisplay` の定義と `argDisplay` キーの検査
- `src/usage.ts` — `name` と `valueName` の参照箇所
- `README.md` — 「Customize help arguments」の説明と例
- `src/parser.test.ts` — `name` と `valueName` を併用するテスト
- `src/public-api.test.ts` — `valueName` を使うテスト
- `scripts/test-packed-consumers.mjs` — `valueName` を使う利用者コード例
- `docs/issues/0011-positional-outside-schema/issue.md` — 位置引数の宣言方法
