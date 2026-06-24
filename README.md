# Company Tax Autofill New Flow Starter

This starter implements the flow:

```text
1. raw April client JSON
      ↓
2. master TurboTax→April mapping dictionary (built once)
      ↓
3. UI fields from TurboTax DOM (Playwright)
      ↓
4. resolveAprilField() — master lookup, then April phrase search fallback
      ↓
5. filler (Playwright)
      ↓
6. TurboTax autofill
```

## Install

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

## Phase 1: Build master mapping (once)

Walk through TurboTax once with a sample April JSON. For each page, the tool reads each input's **`data-binding`** attribute (stored as `domHints.turboTaxBinding`) and uses that as the **primary mapping key** to April JSON paths. Label-based matching is a fallback for older entries.

```bash
npm run build-master-mapping -- sample-data/sample-april-client.json
```

Output: [`data/mappings/april-turbotax.master.json`](data/mappings/april-turbotax.master.json)

Fields without a TurboTax `binding` attribute are skipped during the walk.

## Phase 2: Autofill every client

```bash
npm run run-client -- data/raw/client.json
```

Resolution order for each TurboTax field:

1. **TurboTax binding lookup** — match `data-binding` on the input to `domHints.turboTaxBinding` in the master file (array indices normalized, e.g. `IRSW2.0` → `IRSW2.[*]`)
2. **Label lookup (fallback)** — match normalized field label against `pageFieldKeys` for legacy entries
3. **April phrase search fallback** — score field label against all leaf paths in the client's April JSON

Only matches above `AUTOFILL_MIN_CONFIDENCE` (default 0.75) are offered for fill.

## Inspect master mapping

```bash
npm run inspect-april-mapping
npm run inspect-april-mapping -- data/mappings/april-turbotax.master.json
```

## Mapping file format

```json
{
  "id": "IRSW2.[*].EmployerEIN",
  "pageFieldKeys": ["box b employer identification number ein or federal id"],
  "aprilSourceRoot": "profile.form_staging_data.jobs[*].w2_info",
  "aprilPath": "input_form_addressing_info.issuer.tin_tax_identification_number",
  "domHints": {
    "turboTaxBinding": "returns.IRS1040.Return.ReturnData.IRSW2.[*].EmployerEIN",
    "explicitLabel": "Box b - Employer Identification Number (EIN) or Federal ID",
    "inputType": "text"
  }
}
```

For repeating documents (W2, 1099-INT):

```json
{
  "id": "w2.box1Wages",
  "pageFieldKeys": ["box 1 wages tips other compensation"],
  "aprilSourceRoot": "profile.form_staging_data.jobs[*].w2_info",
  "aprilPath": "wages"
}
```

## Pending mapping updates

After a successful autofill run, you can save matches as a pending update:

```text
data/mappings/pending/april-turbotax.<timestamp>.json
```

Review and merge into the master file.

## Test with sample data

```bash
npm run build-master-mapping -- sample-data/sample-april-client.json
npm run run-client -- sample-data/sample-april-client.json
```

## Safety

This starter is for internal comparison/testing only. It does not automate filing, payment, or submission. The safety guard stops if filing-related page text is detected.
