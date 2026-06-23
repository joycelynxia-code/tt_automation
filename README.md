# Company Tax Autofill New Flow Starter

This starter implements the flow:

```text
1. raw client data
      ↓
2. canonical builder
      ↓
3. canonical index
      ↓
4. UI fields from TurboTax DOM
      ↓
5. resolveField()
      ↓
6. filler (Playwright)
      ↓
7. TurboTax autofill
```

## Install

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

## Process a client

Put anonymized April/source JSON at:

```text
data/raw/client.json
```

Then run the full conversion:

```bash
npm run process-client -- data/raw/client.json data/canonical/client
```

This writes:

```text
data/canonical/client.canonical.json
data/canonical/client.index.json
```

Or run the steps separately:

```bash
npm run build-canonical -- data/raw/client.json data/canonical/client.canonical.json
npm run build-index -- data/canonical/client.canonical.json data/index/client.index.json
npm run inspect-index -- data/index/client.index.json
```

## Run TurboTax autofill workflow

```bash
npm run run-client -- data/canonical/client.canonical.json
```

The browser opens. You log in/navigate manually. When on a page to fill, return to the terminal and press Enter.

The tool will:

1. discover visible DOM fields,
2. detect page context,
3. resolve UI fields to canonical index entries,
4. preview matches,
5. fill only matches above `AUTOFILL_MIN_CONFIDENCE`,
6. optionally save a pending reusable page mapping.

## Source mappings

Approved source mappings live in:

```text
data/mappings/source/approved/
```

Included:

```text
april.w2.v1.json
april.1099-int.v1.json
```

Unknown source sections are written to:

```text
data/mappings/source/pending/
```

Review a candidate, correct it, then move it to `approved/` so future clients use it automatically.

## Page mappings

When a page's matches look correct, choose to save a pending page mapping. It is written to:

```text
data/mappings/page/pending/
```

After review, move it to:

```text
data/mappings/page/approved/
```

Future matching on that page will use saved mappings before heuristics.

## Test with sample data

```bash
npm run process-client -- sample-data/sample-april-client.json data/canonical/sample
npm run inspect-index -- data/canonical/sample.index.json
npm run run-client -- data/canonical/sample.canonical.json
```

## Safety

This starter is for internal comparison/testing only. It does not automate filing, payment, or submission. The safety guard stops if filing-related page text is detected.
