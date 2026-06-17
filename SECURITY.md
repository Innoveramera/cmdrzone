# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email **fredrik@innoveramera.se**
with details and steps to reproduce. You'll get an acknowledgement as soon as possible.

## Scope & data handling

Second Brain runs local AI agents that can execute commands in your projects. It:

- spawns terminals using your login shell, scoped to each project's working directory;
- reads project files (and writes files you edit in the editor);
- stores **metadata only** (project list, preferences, window state) in a local SQLite database in
  the app's userData directory.

It does **not** collect telemetry, store your AI API keys, or transmit your code. `.env` files are
shown as "present" only — never rendered.
