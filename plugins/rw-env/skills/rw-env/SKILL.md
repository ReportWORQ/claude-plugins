---
name: rw-env
description: The user's ReportWORQ environment variables and keys. Use when they ask what keys they have, which key or value source they're using, to refresh or update their keys, to add or change their own key, or when a command fails for a missing API key or token.
---

# rw-env

The user's environment variables come from the ReportWORQ lab at the start of each session.

- **Where do I see my keys?** The bar above the message box, and the panel it opens (or `/keys`): names, where each comes from and whether it works.
- **What keys do I have? Which one am I using?** Run `bash "${CLAUDE_PLUGIN_ROOT}/hooks/rw-env.sh" list`. It prints names and where each came from: `mine` is the user's own, `common` is shared with everyone, anything else is a group's name.
- **Refresh my keys.** Run `bash "${CLAUDE_PLUGIN_ROOT}/hooks/rw-env.sh" refresh` and relay what it says. New values are in place from this session's next command on; nothing needs restarting.
- **Add or change my own key.** Send them to https://lab.reportworq.com/env/#key=NAME (that key's row, ready to type), or https://lab.reportworq.com/env/#add for a new one. Never ask them to paste a key into this chat, and if they do, tell them it is now in the transcript and they should replace that key.
- **A key is missing.** Say which name is missing, and that an admin can assign it, or they can add their own on that page.

Never print the value of one of these variables: not with `env`, `printenv` or `echo`, and not while debugging. To check whether one is set, use `[ -n "${NAME:-}" ] && echo set || echo missing`.
