# Security Policy

## Supported Versions

InkShell is pre-1.0. Security fixes are applied to the latest `main` and the most
recent tagged release.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| < 0.1   | ❌        |

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Instead, report vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/your-org/inkshell/security/advisories/new)
or by email to **security@inkshell.dev**.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if possible).
- The version / commit affected.

We aim to acknowledge reports within **72 hours** and to ship a fix or mitigation
as quickly as the severity warrants. We'll credit you in the advisory unless you
prefer to remain anonymous.

## Security model

InkShell follows Electron's recommended hardening:

- **Context isolation is on** and **node integration is off** in the renderer.
- The renderer reaches the OS only through the small, typed `window.inkshell`
  bridge defined in `src/preload/index.ts` — no `ipcRenderer` or Node built-ins
  are exposed.
- A restrictive Content-Security-Policy is set on the renderer document.
- InkShell spawns the user's own `claude` binary and only ever **reads** files
  under `~/.claude/`; it does not modify Claude Code's data.

If you spot a gap in any of the above, we consider it a security issue — please
report it.
