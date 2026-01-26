# Test Results Excel Template

## Template Format

Create an Excel file (`.xlsx` or `.csv`) with the following columns:

### Required Columns

| Column Name | Type | Description | Example |
|------------|------|-------------|---------|
| `test_case_id` | Text | Unique identifier for the test case | TC-001, TEST-LOGIN, AUTH-01 |
| `status` | Text | Test result status (case-insensitive) | passed, failed, not_run, blocked, rejected |

### Optional Columns

| Column Name | Type | Description | Example |
|------------|------|-------------|---------|
| `test_case_title` | Text | Description of the test case | Login with valid credentials |
| `executed_at` | Date | Date when test was executed (defaults to today) | 2026-01-21, 21/01/2026 |
| `notes` | Text | Additional notes or failure reasons | Response time exceeded threshold |
| `tester_name` | Text | Name of person who executed the test | John Doe |

## Status Values

The `status` column accepts the following values (case-insensitive):

- **passed** - Test executed successfully with expected results
- **failed** - Test executed but did not produce expected results
- **not_run** - Test was not executed
- **blocked** - Test could not be executed due to blocker
- **rejected** - Test rejected or invalidated

## Sample Excel Format

```
test_case_id | status    | test_case_title                  | executed_at | notes                    | tester_name
-------------|-----------|----------------------------------|-------------|--------------------------|-------------
TC-001       | passed    | Login with valid credentials     | 2026-01-21  | All checks passed        | John Doe
TC-002       | failed    | Dashboard load performance       | 2026-01-21  | Load time > 3 seconds    | John Doe
TC-003       | passed    | User logout functionality        | 2026-01-21  |                          | Jane Smith
TC-004       | blocked   | API security test                | 2026-01-21  | Waiting for env setup    | Jane Smith
TC-005       | not_run   | Payment gateway integration      | 2026-01-21  | Deferred to next sprint  | John Doe
```

## CSV Format Example

```csv
test_case_id,status,test_case_title,executed_at,notes,tester_name
TC-001,passed,Login with valid credentials,2026-01-21,All checks passed,John Doe
TC-002,failed,Dashboard load performance,2026-01-21,Load time > 3 seconds,John Doe
TC-003,passed,User logout functionality,2026-01-21,,Jane Smith
TC-004,blocked,API security test,2026-01-21,Waiting for env setup,Jane Smith
TC-005,not_run,Payment gateway integration,2026-01-21,Deferred to next sprint,John Doe
```

## Important Notes

1. **Column Headers**: Must match exactly (case-insensitive)
2. **Test Case IDs**: Can be any format - the system will use your IDs as-is
3. **Duplicates**: If you upload the same test_case_id for the same date, it will update the existing result
4. **Date Format**: Supports multiple formats (YYYY-MM-DD, DD/MM/YYYY, etc.)
5. **Bulk Upload**: You can upload hundreds or thousands of results at once

## How to Use

1. Download or create an Excel/CSV file with the columns above
2. Fill in your test results
3. Go to the "Upload Test Results" page in the QC Management Tool
4. Select your project
5. Upload your Excel/CSV file
6. Review the import summary (success/updated/errors)
7. View metrics and charts automatically updated

## After Upload

Once uploaded, you can:

- View project quality metrics (pass rate, fail rate, etc.)
- See execution trends over time with charts
- Filter results by test case ID, status, or date
- View individual test case history
- Generate quality reports

## Example Downloads

### Minimal Template (Required Columns Only)

```csv
test_case_id,status
TC-001,passed
TC-002,failed
TC-003,not_run
```

### Full Template (All Columns)

```csv
test_case_id,status,test_case_title,executed_at,notes,tester_name
TC-001,passed,Test case 1 title,2026-01-21,Optional notes,Tester name
```

## Tips

- Use consistent test_case_id formats within your project
- Add notes for failed tests to track failure reasons
- Include tester_name for accountability
- Use the executed_at date to track historical results
- Upload regularly to keep metrics current
