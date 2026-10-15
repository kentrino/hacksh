# npm の Trusted Publishing を設定する

最初のリリース PR をマージする前に行う。リリース PR がマージされると、`.github/workflows/release.yml` がすぐに npm への公開を試みる。

このリポジトリは `NPM_TOKEN` を使わずに公開する。npm は OpenID Connect（OIDC）で GitHub Actions のワークフローを認可する。

前提:

- `hacksh` が npm に公開済みである（`initial-publish-npm.md`）。
- `add-bot-secrets.md` を終えている。

# 1. （AI）パッケージのメタデータを確かめる

公開される `package.json` は、Trusted Publisher と同じ GitHub リポジトリを示している必要がある。`package.json` に次があることを確かめる。

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/kentrino/hacksh.git"
}
```

この変更は、リリース PR をマージする前に `main` に入れる。リリース PR がすでにある場合は、release-please が PR を更新するのを待ち、リリースされる版の `package.json` にこの値が残っていることを確かめる。

# 2. （人）npm に Trusted Publisher を登録する

パッケージの owner である必要があり、2 要素認証を求められることがある。

1. [`hacksh` のアクセス設定](https://www.npmjs.com/package/hacksh/access)を開く。
2. **Trusted Publisher** で **GitHub Actions** を選ぶ。
3. 次の値を入れる。
   - Organization or user: `kentrino`
   - Repository: `hacksh`
   - Workflow filename: `release.yml`
   - Environment name: 空欄
4. 保存する。

Workflow filename には `.github/workflows/release.yml` ではなく `release.yml` だけを入れる。npm は保存時に値を検証せず、大文字と小文字を区別する。1 つのパッケージに登録できる Trusted Publisher は 1 つだけである。

npm の automation token は作らない。publish ジョブに `NPM_TOKEN` や `NODE_AUTH_TOKEN` を設定しない。

# 3. （人）トークンでの公開を禁止する

Trusted Publisher を保存したあとで、次を行う。

1. 同じ設定ページの **Publishing access** を開く。
2. **Require two-factor authentication and disallow tokens** を選ぶ。
3. 保存する。

この設定は従来のアクセストークンを拒否するが、登録した Trusted Publisher からの公開は許可する。手元からの `pnpm publish` も、2 要素認証を通せば引き続き使える。

# 4. （AI）ワークフローを確かめる

リリース PR をマージする前に、`release.yml` の `publish` ジョブが次を満たしていることを確かめる。

- GitHub がホストするランナー（`ubuntu-latest` など）で動く。
- `permissions` が `id-token: write` と `contents: read` である。
- `NPM_TOKEN` も `NODE_AUTH_TOKEN` も設定していない。
- `vp pm publish --access public --no-git-checks --provenance` で公開する。Trusted Publishing では provenance が自動で付くが、`--provenance` を明示してもよい。

# 5. （人）マージして確かめる

1 から 4 が終わったら、リリース PR をマージする（auto-merge が設定されていれば、CI が通った時点でマージされる）。

1. **Actions** で、マージコミットが起動した **Release** ワークフローを開く。
2. `release-please` と `publish` の両方が成功したことを確かめる。
3. 公開された版を確かめる。

   ```sh
   npm view hacksh version --prefix /tmp
   ```

4. npm のパッケージページで、その版に `kentrino/hacksh` と `release.yml` に結び付いた provenance が付いていることを確かめる。

`publish` が `ENEEDAUTH` や `E404` で失敗した場合は、まず Trusted Publisher の値を、GitHub の owner、リポジトリ名、ワークフローのファイル名と照らし合わせる。次に、公開される `package.json` の `repository.url` が `https://github.com/kentrino/hacksh` を指していることを確かめる。

詳しくは npm の [Trusted publishing のドキュメント](https://docs.npmjs.com/trusted-publishers/)を参照する。
