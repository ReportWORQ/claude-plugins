# ReportWORQ Claude plugins

## rw-env

Brings your ReportWORQ environment variables into each Claude session, so you don't have to set them up on your computer. You need to be on the ReportWORQ tailnet and have a ReportWORQ Google account. This repository holds no keys: they stay on the lab until your signed-in computer asks for them.

**Install, in Claude Desktop:** click **+** next to the prompt box, then **Plugins**, then **Add marketplace**, and enter `ReportWORQ/claude-plugins`. Then **Add plugin** and choose **rw-env**.

In a terminal session instead:

```
/plugin install rw-env --marketplace ReportWORQ/claude-plugins
```

**Then** start a new session. Claude gives you a link: open it, sign in with Google and press Allow. Then ask Claude to refresh your keys, and they are there from its next command on. Later changes arrive at each new session, or whenever you ask for a refresh.

**Your own keys** go on the lab's Environment page, under My keys. Ask Claude "what keys do I have?" to see the list.

This repository is a published copy; the source and tests are in ReportWORQ/infra under `lab/env/plugin`.
