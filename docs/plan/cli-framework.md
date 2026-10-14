# zitty: zod で引数を定義する CLI フレームワーク

zitty は、引数を [zod](https://zod.dev/) 4 の `z.object` で定義する CLI フレームワーク。1 つのスキーマから、引数のパース、バリデーション、`run` に渡す値の型推論、ヘルプ生成を行う。

最初のリリースは機能を絞る。`/Users/dev/misc/chezmoi/dot_local/bin` 以下の CLI スクリプトを zitty で書けることを目標にし、それに必要な機能だけを実装する。

## 方針

- **zod 4 に依存する**。Standard Schema だけではスキーマの中身を調べられず、値を取るオプションかフラグか、必須かどうかを読み取れないため。
- **引数は `z.object` で定義する**。各キーに名前を付け、`positional` に指定したキーを位置引数、それ以外を名前付きオプションとして扱う。
- **positional は固定長に限る**。`positional` にスキーマのキーを順番に並べる。定義した数を超える位置引数は `extraArgs` に入る。可変長の positional は扱わない。
- **alias と positional のキー・順序は `defineCommand` のオプションで指定する**。zod の meta や registry には載せない。キーは `args` のスキーマのキーで型チェックする。
- **スキーマから読み取る情報は 4 つに限る**。値を取るか（`z.boolean()` か、それ以外か）、必須かどうか、デフォルト値、説明文。positional も各キーのスキーマから読み取る。zod の内部構造に依存する箇所を、この読み取り層に閉じ込める。
- **サブコマンドの扱いは citty をもとにする**。ただし、サブコマンド名は親のスキーマを見て探し、サブコマンドを実行したときは親の `run` を呼ばない。

## API のイメージ

```ts
import { z } from "zod";
import { defineCommand, runMain } from "zitty";

const main = defineCommand({
  name: "gh-pr-commits",
  version: "0.0.1",
  description: "List commits in a GitHub pull request",
  args: z.object({
    pr: z.coerce
      .number()
      .int()
      .optional()
      .describe("Pull request number (defaults to PR for current branch)"),
    repo: z.string().optional().describe("Repository in OWNER/REPO format"),
  }),
  alias: { repo: "R" },
  positional: ["pr"],
  async run({ args }) {
    args.pr; // number | undefined
    args.repo; // string | undefined
  },
});

runMain(main);
```

`run` が受け取る `args` の型は `z.output<typeof schema>`。

### スキーマからの読み取り規則

各キーのスキーマについて、`optional` / `default` / `nullable` / `pipe` などのラッパーを剥がしながら次の情報を集める。位置引数と名前付きオプションに同じ規則を使う。

| 読み取る情報 | 規則                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| 値を取るか   | 中身が `z.boolean()` ならフラグ（値を取らない）。それ以外は値を取るオプションとして扱う   |
| 必須かどうか | `optional` / `default` が付いていなければ必須（ヘルプの `(Required)` 表示に使う）         |
| デフォルト値 | `default` の値（ヘルプの `(Default: x)` 表示に使う）                                      |
| 説明文       | `.describe()` / `.meta({ description })` の値。ラッパーの外側と内側のどちらに付いても拾う |

実際の必須チェックとデフォルト値の適用は zod に任せる。パーサは CLI の文字列を `string | boolean | undefined` に変換するだけで、数値などへの変換はスキーマ側（`z.coerce.number()` など）で行う。

## 機能一覧

CLI フレームワークとして考えられる機能の候補。チェックは最初のリリースの対象。多くは chezmoi のスクリプトを書くのに必要な機能で、一部はインターフェースの一貫性のために入れている。「暗黙」は、コード上の記述はないが利用者の操作や挙動として必要になる機能。

調べたのは、chezmoi の CLI ライブラリを使っている 17 本のスクリプト。

`c`, `cdx`, `cp-preserve-directory`, `create-branch`, `externalize-kentrino`, `falsify`, `g-auth`, `gcm`, `gh-pr-commits`, `gh-transfer-repos`, `git-worktree`, `kenpoch`, `npm-workspace-packages`, `rebase`, `safe-rm`, `sanitize-branch`, `apply-timestamp-to-dirname`

`node:util` の `parseArgs` を直接使うスクリプト（`move-files`, `clean-empty-directory` など）は対象外とする。

### API

- [x] `defineCommand`: コマンドを定義する
- [x] `runMain`: `process.argv` からコマンドを実行し、ヘルプとエラーを処理して終了する
- [x] `runMain` の `onError`: 例外の表示を差し替える。chezmoi の複数のスクリプトが `runMain(main).catch(...)` で独自の表示をしようとしている
- [x] `runCommand`: 引数の配列を渡してコマンドを実行する。`git-worktree` が、対話選択したサブコマンドを引数なしで実行するのに使う
- [x] `runCommand` が `run` の戻り値を返す
- [ ] `runMain` への引数配列の注入と、ヘルプ表示関数の差し替え
- [ ] `createMain`: `runMain` を呼ぶ関数を作る
- [ ] `runCommand` に任意のデータを渡す
- [ ] `parseArgs` の単体公開
- [ ] `renderUsage` / `showUsage` の単体公開
- [ ] `definePlugin`: 複数のコマンドで共有する前処理と後処理

### コマンド定義

- [x] `name` / `version` / `description`: `cdx` は複数行の説明文を持つ
- [x] サブコマンドの `name` の省略（暗黙）: `subCommands` のキーを名前として使う
- [ ] `hidden`: ヘルプに出さないサブコマンド
- [ ] `commandAliases`: サブコマンドの別名
- [x] 静的な `subCommands`: `git-worktree`
- [ ] `subCommands` の遅延読み込み
- [ ] コマンドの情報 / `args` / `subCommands` を関数や Promise で渡す
- [ ] デフォルトのサブコマンド
- [x] `run`
- [ ] `setup` / `cleanup`
- [x] サブコマンドがないときの親の `run` 実行（暗黙）: `git-worktree` は、サブコマンドなしで起動されると対話メニューを出す
- [x] サブコマンドを実行したら親の `run` を呼ばない: `git-worktree` は親の `run` の先頭で、サブコマンドが実行済みなら何もせず抜けようとしている

### `run` のコンテキスト

- [x] `args`
- [x] `rawArgs`
- [x] `passthrough`（`--` 以降）: `cdx` が Codex に渡す
- [x] `extraArgs`（未知のオプションと、定義した数を超える位置引数）: `cdx` が Codex に渡す
- [ ] `cmd`（実行中のコマンド定義）
- [ ] 任意のデータ

### 引数

- [x] 値を取る名前付きオプション
- [x] フラグ（boolean）
- [x] positional（1 個）
- [x] 固定個数の複数 positional（キーの配列）
- [ ] 可変長の positional
- [ ] 列挙値のオプションと、ヘルプへの選択肢の表示
- [x] 説明文、必須、デフォルト値
- [x] 1 文字の alias: `-a`, `-b`, `-p`, `-R`
- [x] 複数の alias
- [x] キーから生成する positional の表示名（`pr` → `<PR>`）
- [ ] positional の任意の表示名
- [ ] ヘルプでのオプションの値の表示名（`--name=<host>`）
- [ ] 否定フラグの説明文

### パース

- [x] `--no-<name>` によるフラグの否定: `sanitize-branch` の `remove-empty` / `remove-coauthor` は既定で有効で、無効にするには `--no-` を付ける
- [x] kebab-case での指定: `create-branch` / `rebase` はキー `dryRun` を `--dry-run` で受け付ける。`sanitize-branch` はキー `"remove-empty"` を `args.removeEmpty` で読む
- [x] パース結果への代入: `git-worktree` が `args.name = name` と書き換える
- [x] 未知のオプションを許容する（暗黙）: `cdx` が `extraArgs` から拾って Codex に渡す
- [x] `--` 以降を `passthrough` に入れる: `cdx`
- [x] `--name=value` 形式: ヘルプの表記（`--repo=<repo>`）と揃える
- [x] 値を取るオプションに値がないときの検証エラー（`--repo: requires a value`）
- [ ] フラグの `--flag=false` を `false` として扱う

### ヘルプとエラー

- [x] 組み込みの `--help` / `-h`（暗黙）
- [x] 組み込みの `--version` / `-v`（暗黙、ほとんどの既存スクリプトがバージョンを定義している）
- [x] 組み込みの短縮形（`-h` / `-v`）を利用者の alias で上書きする
- [x] ヘルプの自動生成（暗黙）
- [x] サブコマンドの一覧と、`<command> --help`: `git-worktree` で暗黙に使う
- [x] 検証エラーのときに usage を表示して exit 1（暗黙）
- [x] 未知のサブコマンドのエラー
- [ ] `NO_COLOR` / `CI` による色の無効化

## 最初のリリースの範囲

- `defineCommand` / `runMain`（`onError`）/ `runCommand`（`run` の戻り値を返す）
- トップレベルの `name` / `version` / `description`。値だけを受け付ける。サブコマンドの `name` はキーで補う
- 静的な `subCommands`。親の値を取るオプションの値を飛ばしてサブコマンド名を探し、サブコマンドがなければ親の `run` を実行し、あれば親の `run` は呼ばない。未知のサブコマンドはエラー
- `run({ args, rawArgs, passthrough, extraArgs })`。`args` は `z.output` の型
- `z.object` による引数定義。positional はスキーマのキーを順番に並べた配列
- スキーマからの読み取り（値を取るか、必須、デフォルト値、説明文）
- `defineCommand` の `alias`（1 文字、複数可）と `positional`（位置引数にするキーとその順序）
- `--no-` によるフラグの否定、kebab-case での指定、`--name=value`、未知オプションの許容、`--` の扱い、値の欠落のエラー
- `--help` / `--version`、ヘルプ生成（サブコマンドの一覧を含む）
- zod の検証エラーを引数名に対応付けて表示し、usage を表示して exit 1

対象外: 列挙値の選択肢表示（`z.enum` は値を取るオプションとして検証だけ効く）, 可変長の positional, positional の任意の表示名, `setup` / `cleanup` / `definePlugin`, 遅延読み込み, デフォルトのサブコマンド, `commandAliases` / `hidden`, オプションの値の表示名と否定フラグの説明文, `createMain` / `parseArgs` / `renderUsage` / `showUsage` の公開, 任意データ, 配列やオブジェクトを値に持つオプション

## 決定事項

### positional の形と表示名

`args` の各フィールドに名前を付け、`positional` に位置引数にするキーを順番に並べる。1 個でも配列で指定する。省略した場合はすべて名前付きオプションになる。

- `positional` に指定したキーは位置引数専用。名前付きオプションや alias としては受け付けない。
- 存在しないキーや重複したキーは `defineCommand` の時点でエラーにする。キーの存在は型でもチェックする。
- 省略できる引数（`optional` / `default`）は末尾にだけ置ける。省略できる引数の後に必須の引数があれば `defineCommand` の時点でエラーにする。
- パーサは位置引数の文字列を対応するキーに割り当てる。足りない分は `undefined` として zod に渡し、必須チェックやデフォルト値の適用を任せる。
- 定義した数を超える位置引数は `extraArgs` に入れる。

ヘルプの表示名はキーを大文字にして生成する（`pr` → `<PR>`、`src` → `<SRC>`）。任意の表示名の指定は最初のリリースでは扱わない。`run` では `args.pr` や `args.src` のように名前で読む。

### 未知のオプションと位置引数

未知のオプションは値を取らないものとして扱う。`cdx --model o3` の `o3` は位置引数になる。未知のオプションに値を渡したいときは、`--model=o3` と書くか、`--` の後に書いてもらう。

`extraArgs` には、未知のオプション（`--model` や `--model=o3` のような元の文字列）と、定義した数を超える位置引数を、元の順序で入れる。

### 値の欠落

値を取るオプションに値がない（`cmd --repo` で終わる、または次の引数がオプション）ときは、`--repo: requires a value` という検証エラーにする。

### 組み込みの `-h` / `-v` と alias の衝突

利用者の alias を優先し、衝突した組み込みの短縮形を無効にする。`--help` / `--version` は常に使える。

### サブコマンド

citty をもとに、サブコマンド名の探し方を親の定義に合わせて変える。

1. rawArgs を先頭から走査し、最初の位置引数をサブコマンド名とする。このとき、親の値を取るオプション（alias を含む）の直後の引数は、その値として飛ばす。`--` に達したらサブコマンド名はないものとする
2. サブコマンド名より前の引数で、親の `args` をパースして検証する。サブコマンド名がなければ rawArgs 全体を使う
3. サブコマンド名が `subCommands` になければ `ZittyUsageError` を投げる
4. サブコマンドがあれば、その名前より後の引数を rawArgs としてサブコマンドを実行する。親の `run` は呼ばない
5. サブコマンド名がなければ親の `run` を実行する。親に `run` がなければ `ZittyUsageError` を投げる

```sh
git-worktree --repo x new --name foo
# サブコマンド名は new（x は --repo の値）
# 親は ["--repo", "x"]、new は ["--name", "foo"] をパースする
```

citty は `-` で始まらない最初の引数をサブコマンド名とし、親を rawArgs 全体でパースする。この方法だと、`--repo x new` の `x` がサブコマンド名とみなされる。また、サブコマンドのオプションが親のオプションと同じ名前だと、親の検証にも使われてしまう。zitty はスキーマから値を取るオプションが分かるので、この 2 つを避けられる。

未知のオプションは値を取らないものとして扱う（「未知のオプションと位置引数」と同じ規則）ので、`--unknown x new` の `x` はサブコマンド名になる。

`--help` / `-h` は、サブコマンドを辿りきった先のコマンドの usage を表示する。親の usage にはサブコマンドの一覧を出す。`--version` / `-v` は最上位のコマンドだけで処理する。

### `runMain` と `runCommand` の役割

- `runCommand` は `--help` / `--version` を処理して（標準出力に表示して）戻る。それ以外の場合は `run` の戻り値を返す。エラーは例外として投げ、`process.exit` は呼ばない。
- `runMain` は `runCommand` を呼び、例外を処理して終了する。既定では、`ZittyUsageError` ならエラーと該当コマンドの usage を表示し、それ以外の例外は `Error: <message>` を表示して、どちらも exit 1 にする。`onError` を渡すと、既定の表示の代わりにそれを呼んでから exit 1 にする。

### camelCase / kebab-case の扱い

chezmoi には、camelCase のキーを kebab-case で指定するケース（`create-branch` / `rebase`）と、kebab-case のキーを camelCase で読むケース（`sanitize-branch`）の両方がある。

名前付きオプションは、スキーマのキーそのものと kebab-case の両方を受け付ける（キー `dryRun` なら `--dryRun` と `--dry-run`）。`args` はスキーマのキーだけで読み、Proxy などで別名を生やさない。型と実体を一致させるためで、`sanitize-branch` はキーを `removeEmpty` にすれば済む。

### `no` で始まるキーと否定の衝突

`--no-<name>` を否定として扱うと、`no-focus` のような名前のフラグとの区別がつかない。`--no-focus` が「`no-focus` を有効にする」のか「`focus` を無効にする」のかが曖昧になる。chezmoi の `cdx` は `no-focus` というフラグを定義している。

名前付きオプションのうち、`/^no[-A-Z]/` に当たるキーは `defineCommand` の時点でエラーにする。`cdx` は `focus: z.boolean().default(true)` にして、`--no-focus` で無効にする。

### positional に使えるスキーマ

positional の値は常に文字列なので、指定したフィールドの中身が `z.boolean()` なら `defineCommand` の時点でエラーにする。それ以外は値を取るオプションと同じ扱いにする。

### 親の positional とサブコマンド名の衝突

サブコマンド名は親の最初の位置引数なので、親に positional があると、位置引数をサブコマンド名とフィールドのどちらに割り当てるかが決まらない。

`subCommands` と空でない `positional` を両方持つコマンドは `defineCommand` の時点でエラーにする。

### zod と zod/mini の両対応

zod 4 には、通常の `zod` と、メソッドチェーンを使わない `zod/mini` がある。読み取り層を `zod/v4/core` の共通構造（`_zod.def`）だけで書けば両方で動く。ただし `.describe()` の説明文は `globalRegistry` に入るため、zod が二重にインストールされていると読めない可能性がある。

読み取り層と公開する型は `zod/v4/core` だけに依存させる。`zod` は peerDependency（`^4`）にする。

## 気になるところ

- **ラッパーの剥がし方**: `optional` / `default` / `nullable` / `pipe`（`transform` を含む）/ `catch` などを剥がして中身を判定する。`z.union([z.boolean(), z.string()])` のように判定できない形は、値を取るオプションとして扱う。対応表はテストで固める。
- **バリデーションは非同期にする**: `refine` に async 関数を使えるように、`safeParseAsync` で検証する。
- **エラーの表示**: zod の issue の path を `--repo` や `<PR>` に対応付けて表示する。位置引数も `["pr"]` のようなフィールド名の path を使い、キーから生成した表示名に対応付ける。issue が複数あるときは全部表示する。
- **未知のキー**: `z.object` は定義にないキーを出力から落とすので、未知オプションを許容しても `args` には入らない。残りの引数は `extraArgs` から読む。
- **値の付け忘れ**: `git-worktree --repo new` のように親のオプションの値を書き忘れると、`new` が `--repo` の値になり、サブコマンドなしで親の `run` が実行される。値を取るオプションが次の引数を値として取る以上、避けられない。
- **パース結果への代入**: `args` は zod の出力をそのまま渡すので、書き換えはできる。readonly にはしない。
- **`process.exit` とテストのしやすさ**: `process.exit` は `runMain` の最外周だけに置き、`runCommand` は例外を投げるだけにしてテストの対象にする。
- **実行環境**: chezmoi のスクリプトは Deno から `npm:` 指定で読み込む。ESM と `node:util` だけで動くようにしておく。

## 進め方

1. スキーマの読み取り層（ラッパーの剥がし、4 つの情報の取得）を実装し、zod と zod/mini の両方でテストする
2. パーサ（`node:util` の `parseArgs` ベース、kebab-case、`--no-`、`--name=value`、alias、値の欠落、`extraArgs` / `passthrough` への振り分け）と、`safeParseAsync` による検証、エラー表示を実装する
3. `defineCommand` / `runCommand` / `runMain`、サブコマンド名の探索、ヘルプ生成を実装する
4. chezmoi の `sanitize-branch`, `cdx`, `git-worktree`, `gh-pr-commits` 相当のケースと、複数の名前付き positional、`--repo x new` のサブコマンド名をテストにする

# Features

各機能のキーインターフェース。型は設計段階の案で、`S` は引数の `z.object` スキーマを表す。最初のリリースの対象外の機能には「対象外」と付けている。

## defineCommand

```ts
import type { $ZodObject, output } from "zod/v4/core";

type ArgsSchema = $ZodObject;
type EmptyArgs = $ZodObject<{}>;
type ShapeOf<S extends ArgsSchema> = S["_zod"]["def"]["shape"];
type ArgKey<S extends ArgsSchema> = Extract<keyof ShapeOf<S>, string>;

interface CommandDef<S extends ArgsSchema = EmptyArgs> {
  name?: string;
  version?: string;
  description?: string;
  args?: S;
  alias?: AliasMap<S>;
  positional?: readonly ArgKey<S>[];
  subCommands?: Record<string, CommandDef<any>>;
  run?: (context: CommandContext<S>) => unknown | Promise<unknown>;
}

declare function defineCommand<S extends ArgsSchema = EmptyArgs>(def: CommandDef<S>): CommandDef<S>;
```

`args` を省略すると `S` は `EmptyArgs` になり、`run` の `args` は `{}` になる。

## コマンドの情報

`name` / `version` / `description` は `defineCommand` のトップレベルに指定する。いずれも省略可。サブコマンドの `name` を省略した場合は `subCommands` のキーを使う。

## 引数の定義（名前付きオプション）

```ts
defineCommand({
  args: z.object({
    target: z.string().describe("Target directory"),
    prefix: z.string().default("").describe("Prefix to add to the directory name"),
    depth: z.coerce.number().int().optional(),
  }),
});
```

```ts
type CommandArgs<S extends ArgsSchema> = output<S>;
```

```sh
cmd --target ./out
cmd --target=./out   # 同じ
cmd --target         # Invalid arguments: --target: requires a value
```

## フラグと否定

```ts
args: z.object({
  execute: z.boolean().default(false).describe("Execute the changes"),
  removeEmpty: z.boolean().default(true).describe("Remove empty commits"),
});
```

```sh
cmd --execute
cmd --no-remove-empty
```

## positional

1 個のとき:

```ts
defineCommand({
  args: z.object({
    message: z.string().describe("The commit message"),
  }),
  positional: ["message"],
});
```

```sh
cmd "fix: typo"   # args.message === "fix: typo"
```

複数のとき:

```ts
defineCommand({
  args: z.object({
    src: z.string().describe("Source path"),
    dest: z.string().optional().describe("Destination path"),
  }),
  positional: ["src", "dest"],
});
```

```sh
cmd a        # args.src === "a"、args.dest === undefined
cmd a b      # args.src === "a"、args.dest === "b"
cmd a b c    # args.src === "a"、args.dest === "b"、extraArgs ≡ ["c"]
```

```text
USAGE cmd [OPTIONS] <SRC> [DEST]
```

## 必須・デフォルト値・説明文

```ts
z.string(); // 必須
z.string().optional(); // 任意
z.string().default("."); // 任意、ヘルプに (Default: .)
z.string().describe("..."); // ヘルプの説明文
```

## alias

```ts
type AliasMap<S extends ArgsSchema> = Partial<
  Record<ArgKey<S>, string | readonly string[]>
>;

defineCommand({
  args: z.object({
    repo: z.string().optional(),
    verbose: z.boolean().default(false),
  }),
  alias: { repo: "R", verbose: ["v", "V"] },
});
```

```sh
cmd -R owner/repo
cmd -v           # verbose。組み込みの -v（version）は無効になり、--version は使える
```

alias のキーは `args` のキーで型チェックする。positional に指定したキーへの alias は `defineCommand` の時点でエラーにする。alias は 1 文字に限る。2 文字以上や、同じ文字を複数のキーに割り当てたときは `defineCommand` の時点でエラーにする。

## camelCase / kebab-case

```ts
args: z.object({ dryRun: z.boolean().default(false) });
```

```sh
cmd --dry-run   # args.dryRun === true
cmd --dryRun    # 同じ
```

## run のコンテキスト

```ts
interface CommandContext<S extends ArgsSchema> {
  args: output<S>;
  rawArgs: string[]; // このコマンドに渡された引数。サブコマンドではサブコマンド名より後
  passthrough: string[]; // 最初の `--` より後
  extraArgs: string[]; // 未知のオプションと、定義した数を超える位置引数
}
```

## passthrough と extraArgs

```ts
defineCommand({
  args: z.object({ path: z.string().optional() }),
  run({ passthrough, extraArgs }) {
    const codexArgs = [...extraArgs, ...passthrough];
  },
});
```

```sh
cdx --path . --model=o3 -- --sandbox
# rawArgs     ≡ ["--path", ".", "--model=o3", "--", "--sandbox"]
# extraArgs   ≡ ["--model=o3"]
# passthrough ≡ ["--sandbox"]

cdx --model o3
# extraArgs ≡ ["--model", "o3"]（o3 は定義した数を超える位置引数）
```

## subCommands

```ts
const main = defineCommand({
  name: "git-worktree",
  subCommands: { new: newCommand, select: selectCommand },
  async run() {
    // サブコマンドが指定されなかったときだけ呼ばれる
  },
});
```

```sh
git-worktree new --help   # new の usage
git-worktree --help       # git-worktree の usage とサブコマンドの一覧
git-worktree foo          # Unknown command `foo` と usage を表示して exit 1
```

## runMain

```ts
interface RunMainOptions {
  onError?: (error: unknown) => void | Promise<void>;
}

declare function runMain<S extends ArgsSchema>(
  cmd: CommandDef<S>,
  options?: RunMainOptions,
): Promise<void>;
```

`process.argv.slice(2)` を引数として `runCommand` を実行する。例外の処理は「`runMain` と `runCommand` の役割」のとおり。

```ts
runMain(main, {
  onError(error) {
    console.error(`gh-pr-commits: ${error instanceof Error ? error.message : error}`);
  },
});
```

## runCommand

```ts
declare function runCommand<S extends ArgsSchema>(
  cmd: CommandDef<S>,
  argv: string[],
): Promise<unknown>;
```

第2引数に引数配列を直接渡す（`runCommand(cmd, ["--repo", "owner/repo"])`）。`--help` / `--version` を処理して `undefined` を返す。それ以外は実行した `run` の戻り値を返す。`process.exit` を呼ばず、エラーは例外として投げる。

## ヘルプと version

```sh
cmd --help      # cmd -h
cmd --version   # cmd -v、version を表示
```

```text
List commits in a GitHub pull request (gh-pr-commits v0.0.1)

USAGE gh-pr-commits [OPTIONS] [PR]

ARGUMENTS

  PR  Pull request number (defaults to PR for current branch)

OPTIONS

  -R, --repo=<repo>  Repository in OWNER/REPO format
```

## エラー

```ts
import type { $ZodIssue } from "zod/v4/core";

// usage を表示すべきエラー（未知のサブコマンド、サブコマンドも run もない）
class ZittyUsageError extends Error {
  readonly command: CommandDef<any>;
}

class ZittyValidationError extends ZittyUsageError {
  readonly issues: ReadonlyArray<ZittyIssue>;
}

interface ZittyIssue {
  arg: string; // "--repo" や "<PR>"
  message: string;
  issue?: $ZodIssue; // パーサ由来のエラー（値の欠落など）では undefined
}
```

`command` は失敗したコマンド（サブコマンドならそのサブコマンド）で、`runMain` はその usage を表示する。

```text
Invalid arguments:
  --repo: Invalid string: must match pattern /^[^/]+\/[^/]+$/
  <PR>: Invalid input: expected number, received NaN
```

## setup / cleanup（対象外）

```ts
interface CommandDef<S extends ArgsSchema> {
  setup?: (context: CommandContext<S>) => unknown | Promise<unknown>;
  cleanup?: (context: CommandContext<S>) => unknown | Promise<unknown>;
}
```

## definePlugin（対象外）

```ts
interface Plugin {
  name: string;
  setup?: (context: CommandContext<any>) => void | Promise<void>;
  cleanup?: (context: CommandContext<any>) => void | Promise<void>;
}

declare function definePlugin(plugin: Plugin): Plugin;
```

## 遅延読み込み（対象外）

```ts
type Lazy<T> = T | Promise<T> | (() => T | Promise<T>);

subCommands: {
  sub: () => import("./sub.ts").then((m) => m.default),
}
```

## デフォルトのサブコマンド（対象外）

```ts
interface CommandDef<S extends ArgsSchema> {
  default?: string;
}
```

## サブコマンドの別名と非表示（対象外）

```ts
interface CommandDef<S extends ArgsSchema> {
  commandAliases?: string[];
  hidden?: boolean;
}
```

## 列挙値の選択肢表示（対象外）

```ts
args: z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
```

```text
--level=<debug|info|warn|error>
```

## createMain（対象外）

```ts
declare function createMain<S extends ArgsSchema>(cmd: CommandDef<S>): () => Promise<void>;
```

## parseArgs / renderUsage の公開（対象外）

```ts
declare function parseArgs<S extends ArgsSchema>(
  rawArgs: string[],
  cmd: CommandDef<S>,
): Promise<output<S>>;

declare function renderUsage<S extends ArgsSchema>(cmd: CommandDef<S>): string;
```
