---
summary: "Form template schema with LLM context fields, validation rules, image type, and logo"
read_when:
  - You are implementing or modifying the Form Builder UI
  - A field is not rendering correctly or not being filled by the LLM
  - You need to understand the FormTemplate or FieldDefinition data shape
title: "Form Builder & Template Schema"
---

# Form Builder & Template Schema

## FormTemplate Shape

```json
{
  "id": "uuid-v4",
  "name": "Human-readable form name",
  "logo": "data:image/png;base64,…",
  "sections": [
    {
      "title": "Section heading",
      "fields": [ FieldDefinition ]
    }
  ]
}
```

`logo` is optional. Stored as a base64 data URL. Shown in the Form Runner header and in print output.

Templates are stored in `localStorage` under `formfillingtool.forms` as an array.

## FieldDefinition

```json
{
  "id": "fullName",
  "label": "Full Name",
  "type": "text",
  "width": "full",
  "required": true,

  "extractionHint": "The full legal name of the applicant",
  "outputFormat": "Last name, First name",
  "examples": ["Müller, Hans", "Schmidt, Maria"],

  "placeholder": "e.g. John Smith",

  "minLength": 2,
  "maxLength": 100,
  "pattern": "",

  "min": 0,
  "max": 999,
  "step": 1,

  "minDate": "",
  "maxDate": "",

  "options": ["Option A", "Option B"],

  "src": "data:image/png;base64,…",
  "alt": "Company Logo"
}
```

## Field Types and Their Properties

| Type | LLM extraction | Validation fields | Image properties |
|------|---------------|-------------------|-----------------|
| `text` | ✅ | minLength, maxLength, pattern | — |
| `textarea` | ✅ | minLength, maxLength | — |
| `number` | ✅ | min, max, step (1 = integer) | — |
| `date` | ✅ | minDate, maxDate | — |
| `select` | ✅ | options[] | — |
| `image` | ❌ static | — | src, alt |

## LLM Context Fields

For all types except `image`, three fields feed into the LLM prompt:

| Field | Required | Purpose |
|-------|----------|---------|
| `extractionHint` | **Yes** | Primary instruction: what to look for in the document |
| `outputFormat` | No | Exact format the LLM should return (e.g. "DD.MM.YYYY") |
| `examples` | No | One or more example values (array of strings) |

`llm.js` combines them into a single prompt block per field:

```
- fullName: The full legal name of the applicant.
  Format: Last name, First name
  Examples: "Müller, Hans", "Schmidt, Maria"
```

## Writing Good extractionHints

The `extractionHint` is the LLM's only instruction for this field.

Good:
- "The full legal name of the patient or applicant"
- "The contract start date in YYYY-MM-DD format"
- "Classify as one of: NDA, Service Agreement, Employment, Other"

Bad (too vague):
- "Name" / "Date" / "Type"

## Layout

Fields use a two-column CSS grid. `width: "full"` spans both columns; `width: "half"` occupies one.
Sections are rendered as visually separated groups with a heading.
The same layout applies to screen and `window.print()` output.

## Field ID Generation

IDs are auto-generated from the label: `"Full Name"` → `"full_name"`.
The ID is used as the HTML `name` attribute and as the JSON key in the LLM response.
IDs are not shown to the user.
