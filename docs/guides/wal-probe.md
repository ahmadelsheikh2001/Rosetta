# IBM RPA Studio 30.0.2 probe checklist

Goal: settle every WAL assumption (W-01 to W-17 in [assumptions.md](../assumptions.md)) before
the generator is written. One probe script (or a few small ones) built in Studio 30.0.2.

For each item, record in `corpus/ibm/probe-30.0.2/RESULTS.md`:

- **Result:** works / fails / partly
- **Exact syntax:** the script lines Studio saved, copied from the `.wal` opened in a text
  editor (not retyped)
- **Studio behaviour:** what you saw: error text, warning, silent change, runtime result
- Screenshots of Studio dialogs or errors are welcome; no client data in them

Put the probe `.wal` files next to `RESULTS.md`. Start the file with the Studio version and build
number (Help → About) and the date.

## The checklist

### W-01: File format

- [ ] Save a small script. Open the `.wal` in a plain text editor: is it readable text?
- [ ] Change one literal in the text editor, save, reopen in Studio: does Studio accept the edit?
- [ ] Create a new `.wal` **only in the text editor**, copying a few lines from a saved one. Does
      Studio open it?
- [ ] Any checksum, signature or hidden metadata that breaks when the file is edited outside Studio?
- [ ] Is a script published to the server stored in the same format as the local file?

### W-02: Header, encoding, line endings

- [ ] What are the first lines of a saved file (version, metadata)? Copy them exactly
- [ ] Encoding: UTF-8 with or without BOM? (Notepad++ shows it in the status bar)
- [ ] Line endings: CRLF or LF?
- [ ] An Arabic literal (`مرحبا`) survives save → reopen → run

### W-03: Variables and parameters

- [ ] Declare one variable of every type Studio offers; record the exact type names in the text
      (at least text, number, boolean, date/time, list, table, and any credential/secure type)
- [ ] A variable with a default value and one without
- [ ] A script **input** parameter and an **output** parameter: how they are declared
- [ ] Generic types: how a list of text or list of numbers is written

### W-04: References, quoting, escaping

- [ ] A variable used as a command argument
- [ ] Literals containing: spaces, double quotes, single quotes, `$`, `{` and `}`, a backslash
      path, a newline, `--`. Record exactly how Studio writes each in the text
- [ ] Concatenating a literal with two variables in one argument
- [ ] Accessing a list item by index, and a table cell, if supported in arguments

### W-05: Control flow

- [ ] If / else-if / else, nested two levels
- [ ] Conditions: equals, greater than, boolean, and a combined AND / OR condition
- [ ] Every loop kind Studio offers (count, while, for-each over list, over table rows, over files)
- [ ] Break and continue inside a loop, if they exist
- [ ] Record the exact start and end lines of each block

### W-06: Subroutines and calling scripts

- [ ] Define a subroutine and call it
- [ ] Call **another script** with one input and one output. How is the called script identified
      (file path, published name, version)? Does it work both locally and published?
- [ ] Can a subroutine take parameters, or does it only share variables?

### W-07: Variable scope

- [ ] A variable declared in the main flow, changed inside a subroutine: is the change visible
      after the call?
- [ ] A variable declared inside a subroutine: usable in the main flow?
- [ ] In a called script: are the caller's variables visible? (expected: no; confirm)

### W-08: Error handling

- [ ] Every error-handling construct Studio offers. Record the text of each
- [ ] Force a real error (read a missing file). Where does execution continue after the handler?
- [ ] What variables or values describe the error (message, line, command)?
- [ ] Any per-command "continue on error" or timeout option?
- [ ] Is there an equivalent of **finally** (code that runs on both paths)? If not, how do
      senior developers ensure cleanup?

### W-09: Rethrow

- [ ] Inside an error handler, log the error and then **raise it again** to an outer handler
- [ ] Does the outer handler get the original message and line, or a new error?
- [ ] If rethrow is impossible: what does the script do instead (stop, fail the bot)?

### W-10: Logging

- [ ] Every logging command available. Record the text
- [ ] Where each log ends up: Studio output, Control Center, local file
- [ ] Log levels supported (info, warning, error, ...)
- [ ] How your company bots log today (if different from built-in)

### W-11: Screenshot

- [ ] A screenshot command: syntax, where the file goes, file format
- [ ] Does it work when the bot runs unattended?

### W-12: Vault and credentials

- [ ] Read a dummy credential from the vault: syntax, how it is referenced in the text
- [ ] What must exist on the tenant or machine for it to work
- [ ] Can a credential value be logged or shown by mistake? (It helps us design the guard)

### W-13: Configuration

For each option, record whether it works locally and when published:

- [ ] Reading a JSON config file into variables
- [ ] Reading an Excel/CSV config file
- [ ] Script parameters set at run time
- [ ] Server or tenant level parameters
- [ ] Which one your company uses today

### W-14: Waits and timeouts

- [ ] Commands that wait for a window, a web element or a desktop element; their timeout
      parameter and default
- [ ] The fixed delay command, for comparison
- [ ] What happens when a wait times out (error? false result?)

### W-15: Comments and grouping

- [ ] Single-line comment syntax; multi-line comment
- [ ] Any region, group or collapsible block that shows in the designer
- [ ] Does a comment survive save → reopen unchanged?

### W-16: Unknown or invalid content

Edit a copy of the probe in the text editor, one change at a time, and open it in Studio:

- [ ] A command name that doesn't exist
- [ ] A valid command with an unknown parameter
- [ ] A parameter with a wrong-typed value (text where a number is expected)
- [ ] A missing end-of-block line

For each: rejected on open, error on run, silently dropped, or kept? Copy any error text exactly.

### W-17: Business exceptions

- [ ] How your company bots signal a business exception (error code, specific command, status
      variable, return value)
- [ ] How it is told apart from a system exception in logs and in Control Center
- [ ] Point to the place in the gold-standard WAL where this happens

## Also please note

- Anything Studio does automatically on save (reformatting, reordering, adding lines)
- Any command you'd expect a senior developer to use that isn't on this list
