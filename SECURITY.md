# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately from the repository's
[Security tab](https://github.com/tastewise/mcp-whichtool/security/advisories/new) instead.
We answer within a few working days, and credit you in the fix unless you would rather we did not.

## What to report

whichtool runs on your machine and handles your API keys and your server's source. What matters most:

- a key leaving the browser or the project's `.env` for anywhere but the model provider you chose;
- the console (`whichtool serve`) answering anything but loopback, or a web page you visit being
  able to drive it;
- `Save to source` writing outside the project it was given.

How your keys and tools are handled is described in
[Your keys and your tools](docs/guides/04-your-keys-and-your-tools.md).

## Supported versions

Fixes go into the latest release.
