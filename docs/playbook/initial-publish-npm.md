# 初回の npm 公開

npm にまだない `hacksh` を、手元から一度だけ公開する。2 回目以降は Release ワークフローが公開する。

# 守ること

- `npm publish` は使わない。`package.json` の `devEngines` が pnpm を指定しているため、npm は `EBADDEVENGINES` で止まる。`pnpm publish`（`vp pm publish` と同じ）を使う。
- `NPM_TOKEN` を作らない。`.npmrc` にトークンを書かない。
- 初回はログインで公開するため、`--provenance` を付けない。provenance は GitHub Actions からの公開でだけ付く。
- 初回の版は `0.0.0` のままにする。release-please は `0.0.0` を未公開とみなし、最初のリリースを `initial-version` の `0.1.0` にする。

npm の類似名チェックは、`--dry-run` では分からない。既存パッケージと似た名前は、公開時に `403` で拒否されることがある。

# 1. （人）npm にログインする

```sh
pnpm whoami
```

`kentrino` と表示されなければ `pnpm login` を実行する。ブラウザで認証する URL が表示される。`401 Unauthorized` は、`~/.npmrc` のトークンが期限切れになっている状態である。

npm の CLI で確認する場合は、`devEngines` の影響を受けないようにリポジトリの外で実行する。

```sh
npm whoami --prefix /tmp
```

# 2. （人）公開前に中身を確かめる

`pnpm publish` は、作業ツリーに未コミットの変更があるか、`main` 以外のブランチにいると止まる。`dist` は自動でビルドされないので、先に `vp run ready` を実行する。

```sh
git status --short
vp run ready
pnpm pack --dry-run
```

`pnpm pack --dry-run` の出力で、次を確かめる。

- tarball に `dist/index.js`、`dist/index.d.ts`、`package.json`、`README.md`、`LICENSE` が含まれる。
- `src`、テスト、`docs` が含まれない。
- パッケージ名が `hacksh` である。

`LICENSE` が含まれない場合は、公開しない（`docs/issues/closed/0011-license-file`）。

# 3. （人）公開する

```sh
pnpm publish --access public
```

2 要素認証を有効にしている場合は、ブラウザでの認証か OTP を求められる。

公開されたことを確かめる。

```sh
npm view hacksh name version --prefix /tmp
```

`0.0.0` は一度公開すると、unpublish しても再利用できない。やり直す場合は版を上げる。

# このあとに行うこと

- `configure-github-repository.md`
- `add-bot-secrets.md`
- `configure-npm-trusted-publishing.md`
