# QC App Walkthrough


Now that the application is running via Docker Compose, follow these steps to verify functionality and complete the setup.

## 1. Access the Application

- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
    - Click "Sign In" (Default credentials are pre-filled).
- **Backend Health**: [http://localhost:3001/health](http://localhost:3001/health)
- **n8n Automation**: [http://localhost:5678](http://localhost:5678)
- **Database**: Port `5432` is exposed.

## 2. Critical Setup: n8n Workflows

The workflows are defined in JSON files but need to be imported into the running n8n instance.

1.  **Open n8n**: Go to [http://localhost:5678](http://localhost:5678).
    - Setup the owner account if prompted (or use details from `.env` logic if Basic Auth caught it, though initial setup usually asks for Owner account).
2.  **Setup Postgres Credentials**:
    - In n8n, go to **Credentials** > **Create New**.
    - Search for **Postgres**.
    - **Host**: `postgres` (internal docker name)
    - **User**: `postgres`
    - **Password**: `postgres` (or as defined in your `.env`)
    - **Database**: `qc_app`
    - **Save**.
3.  **Import Workflows**:
    - Go to **Workflows**.
    - Click **Add workflow** > **Import from File**.
    - Select the JSON files located in `qc-app/n8n/workflows/`:
        - `01_Create_Task.json`
        - `02_Update_Task.json`
        - `03_Generate_Report.json`
    - **Activate** each workflow (toggle the switch to Active).

## 3. Verify Functionality

### Test Task Creation
1. Go to the **Dashboard** ([localhost:3000](http://localhost:3000)).
2. Click **New Task**.
3. Fill in details and **Save**.
4. **Verification**:
   - The task appears in the list.
   - **n8n Check**: Check the Executions tab in n8n for "Create Task Workflow". It should show a successful run checking the validation logic.
   - **DB Check**: An entry should exist in `audit_logs` table (created by API) AND `audit_logs` (created by n8n if validation passed).

### Test Report Generation
1. Click **Generate Report** on the Dashboard.
2. **n8n Check**: Check Executions for "Generate Report Workflow".
3. It should fetch tasks from Postgres and generate an Excel binary (in a real scenario, this would email it or upload it; currently it just logs the success).

## 4. Backend Verification (Phase 1)
To verify the backend API improvements (Zod validation, new Schema, n8n triggers):

1. **Ensure API is running**:
   ```powershell
   docker compose -f docker/docker-compose.local.yml ps
   ```

2. **Run the Verification Script**:
   We have included a PowerShell script to test the full flow (Create Project -> Create Resource -> Create Task).
   ```powershell
   ./verify_api.ps1
   ```
   *Expected Output*: You should see green "Success" messages for Project, Resource, and Task creation.

3. **Check n8n Triggers**:
   If you have n8n workflows imported, check the n8n execution log. The API now attempts to trigger workflows for `project-created` and `task-created`.

> [!NOTE]
> We applied a schema migration `002_schema_alignment.sql`. If you reset your database volumes, this will be applied automatically. If you keep existing volumes, we've already applied it for you manually.

## Troubleshooting

- **n8n Connection Refused**: Ensure the API container can reach `http://n8n:5678`.
- **Database Errors**: Check `docker logs qc-app-postgres-1`.
- **Workflow not triggering**: Check if the webhook URLs in the API code (`http://n8n:5678/webhook/...`) match the active workflow webhook nodes.

## Next Steps for Production

- Update `docker/docker-compose.prod.yml` with real domains.
- Secure `JWT_SECRET` and DB passwords in `.env`.
- Configure SSL with Let's Encrypt (using Nginx or host-level proxy).
