# 09-web-form (customer onboarding form)

## Provenance

- Source: the owner's own A360 test bot `onboarding.json` (Automation Anywhere Community Edition),
  built against the public "Customer Onboarding" practice form. Received 2026-10-31.
- Original: 237760 bytes, SHA-256 `87c9b5096ce06481edc16bc9deea26dcc4507c1b3bdc650c0feaef8feaa47bb7`
  (not stored in the repo).
- **This file is a sanitized, trimmed copy, not byte-exact** (unlike corpus 01–08):
  - the practice page address is replaced with `https://example.com/customer-onboarding.html`;
  - the local CSV path under the Windows user profile is replaced with `file:///C:/RosettaTest/`;
  - the 13 Recorder `uiObject.blob` values (base64 copies of the captured page context, about
    170 KB) are removed. `criteria`, `controlType`, `technologyType` and `browserType` are kept,
    and they hold every selector property A360 matches on.
  - Everything else (nodes, attributes, variables, packages, order) is unchanged.
- File: `bot.json`, 68143 bytes, SHA-256 `f5873848297ecfcf04e251a3a751856cad817a0accd0278f4e597cce43713edf`
- Made with a script that fails if the page address, the user path or a blob is left.
- Corpus scan: clean

## Packages and versions (from `packages`)

Browser 4.4.4; CsvTxt 2.15.1; If 3.8.0-20241115-115929; Loop 3.10.0-20251030-061555;
Recorder 5.11.0-20260916-081602 (settings: native fallback on, GenAI fallbacks off); Step 2.7.0;
String 5.12.6

## What the bot does

1. Step "open Exel and red data": CSV/TXT Open (`OpenCSVTXT`, header, comma, trim spaces, UTF-8);
   Browser Open (`Browser/openbrowser`, NEW_WIN, CHROME, page URL, timeout 240).
2. Step "loop and insert data": Loop with iterator `iterators.csvtxt` (CsvTxt) into RECORD `CsvTxtRow`:
   - Recorder `capture` Set text (`textboxAction` SETTEXT) for Company Name, Customer ID, Primary
     Contact, Street Address, City, Zip, Email Address;
   - Recorder `capture` Select item by text (`comboboxAction` SELECTITEMBYTEXT) for State;
   - If `Offers Discounts` = YES: click radio "Yes" (`radioAction` CLICK), else select radio "No"
     (`radioAction` SELECT);
   - If `Non-Disclosure On File` = YES: check the NDA box (`checkboxAction` CHECK); its Else is
     **disabled** and holds a capture with no action attribute;
   - click the Register button (`buttonAction` CLICK).
3. Step "close csv file": `CsvTxt/CloseCsvTxt`.

## Findings (format)

- Recorder: `commandName` `capture`, attribute `uiObject` = `{ type: UIOBJECT, uiObject: { blob, controlType, technologyType, browserType, criteria, capture } }`
  plus `uiObjectWindow` (`$Browser1$`). `criteria` maps property names (`HTML ID`, `DOMXPath`,
  `CSS Selector`, `HTML Name`, `Path`, …) to `{ enabled, value }`. The action is a separate
  attribute named by control type: `textboxAction`, `comboboxAction`, `radioAction`,
  `checkboxAction`, `buttonAction`. Waits: `advancedWait` BASIC, `wait` 15 (seconds).
- WINDOW variable `Browser1`: `{ type: WINDOW, window: { name, windowType: BROWSER_CHROME, browserTabUrl, … } }`, read-only.
- Record columns with spaces are quoted in expressions: `$CsvTxtRow{"Company Name"}$`; without
  spaces they are not: `$CsvTxtRow{State}$`.
- File URIs are percent-encoded (`%20` for spaces).
- `disabled` can be set on an If's Else branch itself.

## Run result

Not run in A360 or IBM RPA yet.
