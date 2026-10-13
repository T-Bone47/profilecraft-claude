# Contributing to ProfileCraft

Thanks for helping improve ProfileCraft. Contributions should make professional writing clearer without reducing truthfulness, privacy or user control.

## Before opening an issue or pull request

- Search existing issues to avoid duplicates.
- Use fictional or public sample information only; never include someone's private resume, email, profile URL, employer data or unreleased project details.
- Describe the problem, expected behavior and a reproducible example.

## Development

- Node.js 20 or newer is supported.
- Run `npm test` and `npm run validate:examples`.
- Keep the validator dependency-free unless a dependency is clearly justified.
- Add regression tests for bug fixes and update the README/CHANGELOG when behavior changes.
- Keep skill frontmatter portable (`name` and `description`) and keep shared safety rules consistent across skills.
- All sample people, employers, schools, projects and metrics must be fictional.

## Scope and safety

ProfileCraft is a manual-first profile-writing tool. Do not add code that logs into LinkedIn, scrapes its pages, controls a LinkedIn browser session, handles cookies or MFA, or writes profile changes automatically. Do not implement evasion or anti-detection techniques. Skills must not invent professional claims.

## Pull requests

Use a focused branch and a clear commit message. Explain user impact, tests run and any documentation changes. The maintainer may request changes before merging.
