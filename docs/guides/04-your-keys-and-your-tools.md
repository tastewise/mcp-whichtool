# Your keys and your tools

whichtool runs on your machine. There is no whichtool server: your API keys and the tools it
scans are never sent to us, and never stored anywhere but on your own computer.

In a GitHub Codespace, "your machine" is your Codespace: the cloud environment GitHub runs for your
account. What this guide says of your computer holds there, under your GitHub account's terms.

## Your Anthropic and OpenAI keys

- **Typed in the page**, a key is kept in this browser only, in its local storage. The page sends
  it with each request to the console running on your machine (`127.0.0.1`), which uses it for
  that request and what it starts, and never writes it to disk or to a log.
- **Set with `whichtool keys`**, a key is written to the `.env` file of your project, on your
  machine, readable by you only. A key in your environment (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`) is used the same way.
- **Forget the keys**, in the page's key panel, removes them from the browser.

A key leaves your machine only to call the provider it belongs to: an Anthropic key goes to
Anthropic's API, an OpenAI key to OpenAI's.

## The tools it scans

- **From a folder**, your source is read where it is. **From dropped files**, they are copied to
  `~/.whichtool/uploads/`, on your machine, so their tests have a place to live.
- **From a URL**, the console asks your server for its `tools/list`, from your machine.
- Your tests, the project file and the reports of past runs are files in your project, on your
  machine.

## What goes to the model you choose

To test routing, the model has to see your tools. When you run tests, ask AI to write them, or
ask why a test failed, the console sends the model provider you picked, with your key:

- each tool's name, description and arguments;
- the requests in the tests that run;
- for an analysis, the failed test and where its draws went.

That is all it sends, only when you ask, and only to Anthropic or OpenAI, under the terms of your
own account with them. Nothing is sent anywhere else.

## What else the page loads

The page loads its fonts from Google Fonts, and the figures in these guides from anthropic.com.
Those requests carry no key, no tool and no test.
