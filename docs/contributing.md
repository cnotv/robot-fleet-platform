# Maintaining these docs

The documentation is plain Markdown in `docs/`, built by [VitePress](https://vitepress.dev) and published to GitHub Pages automatically. Diagrams are [Mermaid](https://mermaid.js.org) code blocks, so they are text too: anyone, human or agent, can change them in the same pull request as the code.

## Workflow

```sh
cd docs
npm install
npm run dev      # live preview at http://localhost:5173/robot-fleet-platform/
npm run build    # the same check CI runs; fails on broken pages or diagrams
```

Merging to `main` publishes the site. Every page has an **Edit this page on GitHub** link.

## Layout

| Folder | What belongs there |
| --- | --- |
| `guide/` | The customer scenario and how to use the product |
| `architecture/` | How and why the system works; one page per service |
| `reference/` | Exact contracts: endpoints, payloads, schema, configuration |
| `operations/` | Deploying, securing, running and the known limits |

A new page needs a Markdown file and an entry in the `sidebar` in `docs/.vitepress/config.mts`.

## Keep docs in step with code

Update the docs in the same change as the code. This table says which page a change touches:

| When you change | Update |
| --- | --- |
| An endpoint, payload, status code or role rule | `reference/api.md` |
| `prisma/schema.prisma` or a Mongo model | `reference/data-model.md` |
| An environment variable or compose setting | `reference/configuration.md`, `.env.example`, README |
| Throttle, batch interval, persistence policy or any performance constant | `architecture/performance.md` and the service page |
| `hotel-fleet.json` or simulator behaviour | `guide/use-case.md` |
| A dashboard page, filter or report | `guide/dashboard.md`, `architecture/dashboard.md` |
| Deployment topology or scaling | `operations/deployment.md`, README |
| A shortcut marked `ponytail:` in code | `operations/limits.md` |

## Style

* Write for an engineer new to the project. Lead with what the reader needs to do or know.
* Prefer tables for contracts and diagrams for flows.
* State numbers exactly and keep them in sync with the constants in code.
* No em dash, en dash or hyphen as punctuation. Use a colon, a semicolon, brackets or two sentences.
