# ReportWORQ Claude plugins

## rw-env

Brings your ReportWORQ environment variables into each Claude session, so you don't have to set them up on your computer. You need to be on the ReportWORQ tailnet and have a ReportWORQ Google account. This repository holds no keys: they stay on the lab until your signed-in computer asks for them.

**Install, in Claude Desktop:** click **+** next to the prompt box, then **Plugins**, then **Add marketplace**, and enter `ReportWORQ/claude-plugins`. Then **Add plugin** and choose **rw-env**.

In a terminal session instead:

```
/plugin install rw-env --marketplace ReportWORQ/claude-plugins
```

**Then** start a new session. The bar above the message box says **Not connected**: press **Connect**, open the sign-in page, sign in with Google and press **Allow**, then press **I pressed Allow**. Your keys are in place from that session's next command on, and every later session gets them by itself.

**Seeing your keys.** The bar shows how many keys you have, when they were saved, and anything that needs you, such as a rejected key or one to add. Press **Keys**, or type `/keys`, for the panel: each key's name, where it comes from, and whether it works, with Test, Refresh and links to change one. Values are never shown.

**Your own keys** are added and changed on the lab's Environment page, which the panel's links open at the right row.

This repository is a published copy; the source and tests are in ReportWORQ/infra under `lab/env/plugin`.
