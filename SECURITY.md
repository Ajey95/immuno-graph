# Security policy

Please report vulnerabilities through GitHub private vulnerability reporting for this repository, with reproduction steps and the affected tool or transport. Do not open a public issue for an unpatched vulnerability.

For remote HTTP deployments, set a long `IMMUNOGRAPH_API_KEY`, exact `IMMUNOGRAPH_ALLOWED_HOSTS` and `IMMUNOGRAPH_ALLOWED_ORIGINS`, terminate TLS at the ingress, and restrict network egress for optional live connectors. The server requires these settings when bound beyond loopback. The `/health` route is public; `/mcp` requires the bearer key when configured.

Never put secrets or sensitive biological data in MCP arguments, logs, fixtures, or exported research packages. Operators must review permissions and provenance before using results for research decisions.
