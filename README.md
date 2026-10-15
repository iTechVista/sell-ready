# sell-ready

Check that a project folder is ready to sell or share, before a stranger downloads it.

It catches the mistakes that are embarrassing at best and expensive at worst: a live API key left in a config file, a `.env` with real credentials, `node_modules` or `.git` zipped up with the code, or a package with no README or licence.

Zero dependencies. Read-only: it never changes or deletes anything.

## Run it

```sh
npx github:iTechVista/sell-ready ./my-project
```

Or clone it and run it directly with Node 18 or newer:

```sh
node bin/sell-ready.mjs ./my-project
```

Example output:

```
Checked 42 files (0.3 MB) in /home/me/my-project

  ✗ node_modules/ should not be shipped; buyers install or generate it themselves
  ✗ possible Stripe live secret key in src/config.js:12
  ! add a .env.example listing each setting with a blank value, so buyers know what to configure

Not ready: 2 problems to fix first.
```

Exit codes: `0` ready, `1` problems found, `2` bad usage. That makes it easy to run in CI before a release.

## What it checks

**Stops a sale (errors)**

- Folders a buyer should never receive: `node_modules`, `.git`, virtual environments, framework caches and the like
- `.env` files (`.env.example`, `.env.sample` and `.env.template` are fine)
- Private keys and certificate stores (`id_rsa`, `*.pem`, `*.p12`, `*.key` and similar)
- Credentials in text files, by shape: Stripe, OpenAI, Anthropic, GitHub, AWS, Shopify, Slack and Google keys, private key blocks and JWTs, reported with file and line
- No README or no licence at the top level

**Worth a look (warnings)**

- Build output such as `dist` or `build` (fine if it is the product)
- No dependency manifest (`package.json`, `requirements.txt`, `go.mod` and so on)
- A `.env` without a matching `.env.example`
- `TODO` and `FIXME` markers left in source
- Files over 25 MB

Secret detection matches the shape of real keys, so it will not catch a password written in plain words. Treat a pass as "nothing obvious", not as a guarantee.

## Use it in code

```js
import { checkFolder } from 'sell-ready';

const { ok, errors, warnings } = checkFolder('./my-project');
```

## Selling your code?

Once it passes, you can list it for free on the [iTechVista Code Marketplace](https://code.itechvista.com/sell), where every package is reviewed before it goes on sale. Our guide on [how to sell your code online](https://code.itechvista.com/guides/how-to-sell-your-code) covers getting a project ready, pricing it and choosing where to sell.

## Licence

MIT, by [iTechVista](https://code.itechvista.com).
