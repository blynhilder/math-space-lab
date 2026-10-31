# Validation — 2026-10-31

- Clean npm ci --ignore-scripts installations completed for both packages.
- Browser bridge and both UI HTML files rebuilt from the maintained source using the portable script.
- Expression checks: PASS.
- Matrix regression tests: 15/15 PASS. Previously failing rounded-zero/near-singular explanations are fixed in this public snapshot.
- Matrix/crystal factory checks: 261 assertions PASS.
- Local Node MCP transport integration tests: 26/26 PASS.
- Worker build and tests: 3/3 PASS.
- Browser opened the release Worker preview; all four modes switched successfully, each with a visible nonzero-size canvas and no aria-invalid fields; desktop layout had no horizontal overflow. A surface plot was exported from the running canvas and visually inspected.
- 195 upstream dependency license/notice files are included for bundled and installed dependency provenance.

Not claimed: a new cloud deployment, a newly installed ChatGPT connector, or a fresh mobile-browser/assistive-technology acceptance pass. Existing hosted instances are unchanged.
