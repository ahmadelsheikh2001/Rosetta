# Golden corpus

Synthetic or fully sanitised sample bots used for format discovery and golden tests.
**No real client material, ever.** Anything under a `private/` folder is git-ignored.

## Layout

```
corpus/
  a360/
    01-variables/
      export.zip        # as exported from Control Room, byte-for-byte
      expected.wal      # hand-written IBM RPA equivalent (golden output)
      NOTES.md          # what the bot does, package versions, anything unusual
    02-control-flow/
    03-strings-expressions/
    04-error-handling/
    05-excel/  06-files-folders/  07-browser/  08-subbot-credentials/  09-banking-mixed/
  ibm/
    probe-30.0.2/       # probe script for W-01..W-17 and RESULTS.md
    gold-standard/      # one sanitised WAL written to company standards (style reference)
```

What each sample must contain: [docs/guides/a360-samples.md](../docs/guides/a360-samples.md).
What the probe must test: [docs/guides/wal-probe.md](../docs/guides/wal-probe.md).

## Sanitisation checklist

Check every file, **including the contents of exported zips**, before adding it:

- [ ] No real URLs or hostnames (use `example.com`, `example.org`)
- [ ] No IP addresses (use none; if a sample needs one, use the documentation range `192.0.2.x` and allow-list it)
- [ ] No internal system, application, server or share names
- [ ] No account numbers, IBANs, card numbers, customer IDs
- [ ] No customer data: names, national IDs, phone numbers, addresses, emails (use `user@example.com`)
- [ ] No credentials: passwords, tokens, keys. Vault references point to dummy lockers/credentials only
- [ ] No screenshots or recorder captures of real client applications
- [ ] File and folder paths are generic (`C:\Rosetta\Input\`), not copied from a client machine

## Automatic check

A pre-commit hook (`scripts/scan-corpus.mjs`) scans staged corpus files, and the entries inside
zip files, for obvious patterns: IP addresses, internal-looking URLs, network share paths,
IBAN-like values and long digit sequences. It blocks the commit and lists each finding.

- Real data: remove it and re-export.
- False positive (e.g. a timestamp that looks like an account number): add it to
  [`corpus/.scanallow`](.scanallow).
- Epoch timestamps in A360 JSON: list the JSON key once as `timestamp-field:<key>` in
  `.scanallow` instead of allow-listing every value. 10- and 13-digit values under that key are
  then skipped in every export.
- Scan everything on demand: `corepack pnpm scan:corpus`.

The scan is a safety net, not a substitute for the checklist.
