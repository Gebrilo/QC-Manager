# Report Template Usage Guide

## Issue Explanation

The original `project-summary.html` template file had **Handlebars-style placeholders** like:
- `{{project_name}}`
- `{{#each tasks}}...{{/each}}`

However, the n8n workflow uses a **JavaScript Code node** that generates HTML using **JavaScript template literals** (backticks and `${}`), not a Handlebars rendering engine.

This caused a **template system mismatch** where:
1. The HTML file expected Handlebars processing
2. The n8n Code node used JavaScript string interpolation
3. They were incompatible

## Solution

The HTML template file now serves as a **CSS reference only**. The actual HTML generation happens entirely in the n8n Code node using JavaScript template literals.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  templates/project-summary.html                            │
│  - Contains CSS styles only                               │
│  - NOT used for data binding                              │
│  - Reference for styling and structure                    │
└────────────────────────────────────────────────────────────┘
                            │
                            │ (CSS reference)
                            ▼
┌────────────────────────────────────────────────────────────┐
│  n8n/render-template.js                                    │
│  - Generates complete HTML with embedded CSS              │
│  - Uses JavaScript template literals                      │
│  - Injects data directly into HTML string                 │
└────────────────────────────────────────────────────────────┘
                            │
                            │ (HTML string)
                            ▼
┌────────────────────────────────────────────────────────────┐
│  n8n Workflow: "Render HTML" Code Node                    │
│  - Calls generateProjectSummaryHTML()                     │
│  - Returns complete HTML document as string               │
└────────────────────────────────────────────────────────────┘
                            │
                            │ (HTML string)
                            ▼
┌────────────────────────────────────────────────────────────┐
│  PDF Generation Service (PDFShift)                        │
│  - Converts HTML string to PDF                            │
└────────────────────────────────────────────────────────────┘
```

## How to Use the Template System

### Option 1: Use render-template.js (Recommended)

The [n8n/render-template.js](../n8n/render-template.js) file contains the complete rendering logic:

```javascript
// In your n8n Code node:
const project = $('Query Project').first().json[0];
const stats = $input.first().json;
const generatedAt = new Date().toISOString();

// Copy the entire generateProjectSummaryHTML function from render-template.js
// Then call it:
const html = generateProjectSummaryHTML(project, stats, generatedAt);

return [{ json: { html, filename: `project-summary-${project.id}-${Date.now()}.pdf` } }];
```

### Option 2: Inline in n8n Workflow

The complete HTML generation is already embedded in [n8n/qc_generate_project_summary_pdf.json](../n8n/qc_generate_project_summary_pdf.json) in the "Render HTML" node.

Simply import this workflow JSON into n8n and it will work out of the box.

## Modifying the Template

### To Change Styles

1. Edit [templates/project-summary.html](../templates/project-summary.html) CSS section
2. Copy the updated CSS to [n8n/render-template.js](../n8n/render-template.js)
3. Update the n8n workflow Code node with the new CSS

### To Change Structure

1. Edit the HTML structure in [n8n/render-template.js](../n8n/render-template.js)
2. Ensure all data is injected using `${variable}` syntax
3. Use the `escapeHtml()` helper for user-provided data
4. Update the n8n workflow Code node

### To Add New Fields

1. Update the database query in the workflow
2. Add the field to the `project` or `stats` object
3. Inject it in the HTML template using `${project.new_field}`
4. Add corresponding CSS if needed

## Example: Adding a New Field

**Step 1:** Update the SQL query in the "Query Project" node:

```sql
SELECT
  p.id, p.name, p.owner, p.start_date, p.target_date, p.status, p.created_at,
  p.description  -- NEW FIELD
FROM project p
WHERE p.id = $1 AND p.status != 'deleted'
```

**Step 2:** Add to HTML in render-template.js:

```javascript
<div class="info-item">
  <span class="info-label">Description</span>
  <span class="info-value">${escapeHtml(project.description || '—')}</span>
</div>
```

**Step 3:** Update the n8n Code node with the modified JavaScript

## Key Points

✅ **DO:**
- Use `${variable}` for data injection in render-template.js
- Use `escapeHtml()` for all user-provided data
- Test HTML rendering before PDF conversion
- Keep CSS inline in the `<style>` tag for PDF compatibility

❌ **DON'T:**
- Use Handlebars syntax (`{{variable}}`) in the JavaScript code
- Rely on external CSS files (they won't work in PDFs)
- Use DOM manipulation (there's no browser environment)
- Forget to escape user input (XSS risk)

## Testing the Template

### Test HTML Output

```javascript
// In n8n Code node, output the HTML to verify:
console.log(html);  // View in n8n execution logs
```

### Test in Browser

Save the generated HTML to a file and open in a browser to verify styling before PDF conversion.

### Test PDF Generation

Use the full workflow with a test `project_id` and verify:
1. PDF downloads successfully
2. All data appears correctly
3. Styling renders as expected
4. No broken layouts or missing content

## Troubleshooting

| Problem | Solution |
|---------|----------|
| CSS not rendering in PDF | Ensure all CSS is inline in `<style>` tag |
| Variables showing as `${variable}` | Check you're using template literals (backticks), not regular strings |
| Missing data | Verify database query returns the expected fields |
| HTML escaping issues | Use `escapeHtml()` for all user-provided content |
| Layout breaks in PDF | Test with sample data, adjust CSS for print media |

## Related Files

- [templates/project-summary.html](../templates/project-summary.html) - CSS reference
- [n8n/render-template.js](../n8n/render-template.js) - Rendering logic
- [n8n/qc_generate_project_summary_pdf.json](../n8n/qc_generate_project_summary_pdf.json) - Complete workflow
- [docs/report-api-examples.md](../docs/report-api-examples.md) - API usage examples
