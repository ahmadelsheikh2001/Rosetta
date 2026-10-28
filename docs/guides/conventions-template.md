# Company IBM RPA conventions: fill-in template

Fill this in from our internal conventions and PDD template. Each section maps 1:1 to a section
of the standards profile ([docs/standards-profile.md](../standards-profile.md)), so your answers
become **company profile v0** with little or no interpretation.

How to answer:

- Replace each `ANSWER:` line. Keep the example if it already matches us; write "same" or delete it.
- If we have no rule for an item, write `no rule` and the built-in default stays.
- If the real answer doesn't fit the options, describe it in plain words. Don't force it.
- Paste short real snippets where it helps (sanitised, no client names).

---

## 1. Naming (`naming`)

### 1.1 Variable names

Case style. Options: `camelCase` · `PascalCase` · `snake_case` · `UPPER_SNAKE`.

> Example: `camelCase`, e.g. `invoiceNumber`

ANSWER:

### 1.2 Type prefixes on variables

Do variable names carry a prefix per type? List one per type, or `no rule`. Types: text, number,
boolean, date/time, list, dictionary, table, record, credential, handle/session.

> Example: text `str`, number `num`, boolean `bln`, date/time `dtm`, table `dt`, list `lst`
> → `strInvoiceNumber`, `dtInvoices`

ANSWER:

### 1.3 Subroutine names

Case style, and any prefix or verb rule.

> Example: `PascalCase`, verb first: `ReadInvoices`, `CloseApplications`

ANSWER:

### 1.4 Script (file) names

Pattern. Available placeholders: `{client}`, `{process}`, `{bot}`. Add others if we use them
(e.g. a sequence number).

> Example: `{client}_{process}_{bot}` → `BankX_Payments_InvoiceIntake.wal`

ANSWER:

### 1.5 Anything else about names

Parameters, constants, reserved words, maximum length, language (English only?).

> Example: script inputs start with `in`, outputs with `out`; English only; max 40 characters

ANSWER:

---

## 2. Script header (`header`)

Which fields must the header comment block of every script contain, in which order? Built-in
fields: name, description, source bot reference, conversion date, RPA Rosetta version,
inputs, outputs. Add any of ours (author, PDD reference, version history, client, ...).

> Example:
>
> ```
> name, description, PDD reference, author, version, inputs, outputs, change history
> ```

ANSWER:

Paste the header exactly as it appears in a real (sanitised) script:

```
ANSWER (paste):
```

---

## 3. Configuration (`config`)

### 3.1 Where environment-specific values live

Options: `configFile` (JSON / Excel / other file read at start) · `scriptParameters` (passed in
when the bot starts) · `serverParameters` (tenant/server-level parameters). Say which file
format if `configFile`.

> Example: `configFile`, a JSON file per environment, path given as a script parameter

ANSWER:

### 3.2 What must never be hardcoded

Tick what we extract to config: URLs · file/folder paths · email addresses · others (say which).

> Example: URLs, paths, emails, timeouts, retry counts, application titles

ANSWER:

### 3.3 Config naming

How config keys are named.

> Example: `UPPER_SNAKE`, grouped by system: `CORE_BANKING_URL`, `INPUT_FOLDER`

ANSWER:

---

## 4. Logging (`logging`)

### 4.1 Log line format

Available placeholders: `{stage}`, `{level}`, `{message}`. Add others we use (timestamp, bot
name, transaction id, ...).

> Example: `[{timestamp}] [{bot}] [{stage}] [{level}] {message}`

ANSWER:

### 4.2 What gets logged

- Start and end of every major step? (yes / no)
- Key business values? Which kind, and how sensitive values are masked?
- Every error, with what details?

> Example: yes; transaction id and amount only, account numbers masked as `****1234`; error
> message, stage, and screenshot path

ANSWER:

### 4.3 Where logs go

Built-in IBM RPA logging, a custom file, a database, or several.

> Example: built-in log plus a daily CSV in the config's log folder

ANSWER:

---

## 5. Error handling (`errors`)

### 5.1 Business vs system exceptions

How a business exception is signalled, and how it differs from a system exception (code,
message prefix, status variable, specific command...).

> Example: business exceptions set `strStatus = "BE"` and a message starting with `BE:`;
> everything else is a system exception and is retried

ANSWER:

### 5.2 Screenshot on system error

Always / only in UI steps / never. Where is it saved?

> Example: always, to the config's screenshot folder, named `{bot}_{timestamp}.png`

ANSWER:

### 5.3 Guaranteed cleanup

What must always run at the end, even after a failure (close Excel, close browsers, kill
applications, release connections), and how we structure it.

> Example: an `End` stage that closes Excel and browsers and kills listed processes; called from
> the main flow and from the error handler

ANSWER:

### 5.4 Retries

Do we retry? Where and how many times? (Rosetta only _recommends_ retries; it never adds them
silently.)

> Example: system exceptions retried up to 2 times per transaction; never retry business
> exceptions

ANSWER:

---

## 6. Script structure and stages (`stages`)

### 6.1 Stage names

Names of the standard stages, as they should appear in scripts.

> Example: `Initialization`, `Processing`, `End`

ANSWER:

### 6.2 What belongs in each stage

> Example:
>
> - Initialization: read config, read vault credentials, open applications, set defaults
> - Processing: one subroutine per business step
> - End: cleanup and final log line

ANSWER:

### 6.3 Subroutines and reusable logic

When do we split into a subroutine vs a separate script? Shared libraries?

> Example: any block reused twice or longer than ~30 lines becomes a subroutine; login logic is a
> shared script called by every bot

ANSWER:

### 6.4 Waits and delays

Our rule on fixed delays vs explicit waits, and default timeouts.

> Example: no fixed delay over 2 s; every UI wait has an explicit timeout, default 30 s

ANSWER:

---

## 7. Quality checks (`quality`)

For each check, say whether it is on and how serious a violation is: `error` · `warning` ·
`info` · `off`.

| Check                              | Default | ANSWER |
| ---------------------------------- | ------- | ------ |
| Hardcoded credentials              | error   |        |
| No error handling in the bot       | warning |        |
| Empty catch (error swallowed)      | warning |        |
| Fixed delays                       | warning |        |
| Hardcoded URLs                     | warning |        |
| Hardcoded paths                    | warning |        |
| Hardcoded emails                   | warning |        |
| Disabled code left in the bot      | info    |        |
| Nesting deeper than N levels       | warning |        |
| No comments in a bot larger than N | info    |        |
| Unused variables                   | info    |        |

- Maximum nesting depth N (default 4). ANSWER:
- Statement count above which comments are required (default 15). ANSWER:

---

## 8. Effort sizing (`sizing`)

We have no historical data yet, so these are starting estimates to calibrate on the first pilot.
What is a realistic manual-migration effort per bot size, **including testing**?

| Size | Typical bot                                        | Default hours | ANSWER |
| ---- | -------------------------------------------------- | ------------- | ------ |
| S    | Linear, a few dozen steps, one application         | 4             |        |
| M    | Branches and loops, 2–3 applications               | 12            |        |
| L    | Many steps, sub-bots, UI automation                | 32            |        |
| XL   | Long, deeply nested, many unmapped/legacy commands | 64            |        |

Anything that makes a bot much harder for us than its size suggests (mainframe screens, SAP,
document processing...)?

ANSWER:

---

## 9. Anything else

Conventions that don't fit above (comments style, version control, PDD links, approval steps).

ANSWER:
