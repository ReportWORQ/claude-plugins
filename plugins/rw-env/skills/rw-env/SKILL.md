---
name: rw-env
description: The user's ReportWORQ environment variables and keys. Use when they ask what keys they have, which key or value source they're using, to refresh or update their keys, to add or change their own key, or when a command fails for a missing API key or token.
---

# rw-env

The user's environment variables come from the ReportWORQ lab at the start of each session.

- **What keys do I have? Which one am I using?** Run `bash "${CLAUDE_PLUGIN_ROOT}/hooks/rw-env.sh" list`. It prints names and where each came from: `mine` is the user's own, anything else is a shared bundle.
- **Refresh my keys.** Run `bash "${CLAUDE_PLUGIN_ROOT}/hooks/rw-env.sh" refresh` and relay what it says. New values are in place from this session's next command on; nothing needs restarting.
- **Add or change my own key.** Send them to https://lab.reportworq.com/env/ , the "My keys" section. Never ask them to paste a key into this chat, and if they do, tell them it is now in the transcript and they should replace that key.
- **A key is missing.** Say which name is missing, and that an admin can assign it, or they can add their own on that page.

Never print the value of one of these variables: not with `env`, `printenv` or `echo`, and not while debugging. To check whether one is set, use `[ -n "${NAME:-}" ] && echo set || echo missing`.
