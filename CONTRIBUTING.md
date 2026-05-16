# Contributing to mddg

Thank you for considering contributing to mddg!

## Getting Started

```bash
# Fork and clone the repo
git clone https://github.com/vinodnal/mddg.git
cd mddg

# Install dependencies (requires pnpm ≥ 9)
pnpm install

# Verify everything works
node bin/mdoc.js --version
```

## Development Workflow

```bash
# Lint
pnpm run lint
pnpm run lint:fix   # auto-fix

# Build an example project (no PDF)
pnpm run build:example
```

## Code Style

- CommonJS (`"use strict"`, `require`/`module.exports`)
- 2-space indentation (enforced by `.editorconfig`)
- ESLint v9 flat config (`eslint.config.js`) — run `pnpm lint` before committing
- No TypeScript — plain Node.js ≥ 18

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for landscape sections
fix: prevent NaN dimensions for zero-size images
docs: update CLI help text
chore: upgrade docx to v9.7
```

## Pull Requests

1. One logical change per PR
2. Pass `pnpm lint` locally before pushing
3. Update `CHANGELOG.md` under `[Unreleased]`
4. Keep the `projects/` directory out of PRs (it is git-ignored)

## Reporting Issues

Open an issue at <https://github.com/vinodnal/mddg/issues>.  
Include your Node.js version (`node -v`), OS, and the error output.

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
