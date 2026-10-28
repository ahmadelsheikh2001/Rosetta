# Assumptions Register

Every assumption about a file format or platform behaviour is tracked here (ADR-017).
Nothing marked **Open** may be relied on in code or in the mapping registry.

- **Status:** Open, Verified, Refuted
- **Blocks:** the earliest phase that cannot finish without an answer
- **Evidence:** corpus path or probe-script result that settles it

## A360 export (source)

| ID   | Assumption / question                                                                                                                 | Blocks  | Status | Evidence |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | -------- |
| A-01 | The export is a zip; its folder layout and file naming (does it contain a `manifest.json`? do bot files have an extension?) are known | Phase 1 | Open   |          |
| A-02 | Bot files are JSON; the top-level structure (nodes, variables, packages, triggers?) is known                                          | Phase 1 | Open   |          |
| A-03 | Node fields: command name, package name, attributes, children, branches, disabled flag, unique id. Exact names to confirm             | Phase 1 | Open   |          |
| A-04 | How If / Else If / Else, loops and Try / Catch / Finally are represented (children vs branches vs sibling nodes)                      | Phase 1 | Open   |          |
| A-05 | Shape of an attribute value (typed wrapper? string vs number vs expression vs variable reference)                                     | Phase 1 | Open   |          |
| A-06 | Variable declarations: type names, subtypes, input/output flags, default values, sensitive flag                                       | Phase 1 | Open   |          |
| A-07 | Expression syntax: `$var$`, list index, dictionary key, system variables, inline functions, escaping                                  | Phase 1 | Open   |          |
| A-08 | Package name and version are recorded per bot (where, and in what form)                                                               | Phase 1 | Open   |          |
| A-09 | Attribute names can differ between package versions of the same command                                                               | Phase 1 | Open   |          |
| A-10 | Credential Vault references: shape (locker / credential / attribute) and where they appear                                            | Phase 1 | Open   |          |
| A-11 | Recorder (Universal Recorder) captures: technology, property list, enabled flags, window info                                         | Phase 3 | Open   |          |
| A-12 | Excel Basic vs Excel Advanced packages, and how session names link commands together                                                  | Phase 3 | Open   |          |
| A-13 | _Run Task Bot_: the called bot is referenced by path or by id; inputs/outputs mapping shape                                           | Phase 1 | Open   |          |
| A-14 | Dependent bots and files are included in the export when selected                                                                     | Phase 1 | Open   |          |
| A-15 | Exports can be password-protected or encrypted (and if so, how we handle them)                                                        | Phase 1 | Open   |          |
| A-16 | Steps and comments are nodes in the tree, and their labels and text are stored on them                                                | Phase 1 | Open   |          |
| A-17 | File encoding (UTF-8? BOM?) and any non-JSON files in the export                                                                      | Phase 1 | Open   |          |

## IBM RPA Studio 30.0.2 / WAL (target)

To be answered by the probe script and the gold standard WAL. **No WAL command name is assumed until verified.**

| ID   | Assumption / question                                                                                 | Blocks  | Status | Evidence |
| ---- | ----------------------------------------------------------------------------------------------------- | ------- | ------ | -------- |
| W-01 | A `.wal` file is plain text that Studio opens directly (not a packaged or compressed format)          | Phase 2 | Open   |          |
| W-02 | File header / metadata lines (Studio version etc.) and encoding                                       | Phase 2 | Open   |          |
| W-03 | Variable declaration syntax, type names (incl. list / table types), script input/output parameters    | Phase 2 | Open   |          |
| W-04 | Variable reference syntax inside arguments; quoting and escaping rules                                | Phase 2 | Open   |          |
| W-05 | Control flow: if / else-if / else, loops (count, while, for-each), break / continue, condition syntax | Phase 2 | Open   |          |
| W-06 | Subroutines vs calling another script with parameters                                                 | Phase 2 | Open   |          |
| W-07 | Variable scoping inside subroutines                                                                   | Phase 2 | Open   |          |
| W-08 | Error handling constructs and their exact semantics                                                   | Phase 2 | Open   |          |
| W-09 | Rethrow inside a catch block (needed for transparent wrappers, ADR-008)                               | Phase 2 | Open   |          |
| W-10 | Logging command(s) and their destination                                                              | Phase 2 | Open   |          |
| W-11 | Screenshot command                                                                                    | Phase 2 | Open   |          |
| W-12 | Vault / credential access                                                                             | Phase 2 | Open   |          |
| W-13 | Config options: config file, script parameters, server/tenant parameters                              | Phase 2 | Open   |          |
| W-14 | Explicit waits and timeouts                                                                           | Phase 2 | Open   |          |
| W-15 | Comment syntax; any grouping/region construct visible in Studio                                       | Phase 2 | Open   |          |
| W-16 | How Studio reacts to unknown commands or parameters (rejects the file, or ignores them)               | Phase 2 | Open   |          |
| W-17 | Business-exception signalling style used in company bots                                              | Phase 2 | Open   |          |

## Brand (ADR-018)

| ID   | Assumption / question                                                                                           | Blocks  | Status                                | Evidence                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------- | --------------------------------------------------------------- |
| B-01 | Full logo usage rules                                                                                           | Phase 1 | Verified                              | Brief of 2026-10-28, recorded in ADR-018                        |
| B-02 | Status colours: auto Dodger Blue, review Spanish Orange, blocked Rust, info Bice Blue; always with icon + label | Phase 1 | Verified (pending marketing approval) | Brief of 2026-10-28, ADR-018                                    |
| B-03 | Pure white `#FFFFFF` is allowed for page background and cards                                                   | Phase 1 | Verified                              | Brief of 2026-10-28 (guidebook places logo/letterhead on white) |
| B-04 | Two colour versions: white logo on Black/Oxford Blue, dark logo on white/Anti-Flash White/Bice Blue             | Phase 1 | Verified                              | Brief of 2026-10-28, ADR-018                                    |
| B-05 | Official SVG files (primary, icon, secondary; dark and white) received from marketing                           | Phase 1 | Open                                  |                                                                 |
