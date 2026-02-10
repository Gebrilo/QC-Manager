import requests
import json

BASE_URL = "http://localhost:3001"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json"
}

def validate_audit_logging_for_crud_operations():
    session = requests.Session()
    session.headers.update(HEADERS)
    
    # Helper functions
    def create_project():
        payload = {
            "name": "AuditLogTest Project",
            "description": "Project to test audit logging",
            "status": "active"
        }
        resp = session.post(f"{BASE_URL}/api/projects", json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()["id"]

    def get_project(project_id):
        resp = session.get(f"{BASE_URL}/api/projects/{project_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def update_project(project_id, updates):
        resp = session.patch(f"{BASE_URL}/api/projects/{project_id}", json=updates, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def delete_project(project_id):
        resp = session.delete(f"{BASE_URL}/api/projects/{project_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp

    def create_task(project_id):
        payload = {
            "title": "AuditLogTest Task",
            "description": "Task to test audit logging",
            "projectId": project_id,
            "status": "open"
        }
        resp = session.post(f"{BASE_URL}/api/tasks", json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()["id"]

    def get_task(task_id):
        resp = session.get(f"{BASE_URL}/api/tasks/{task_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def update_task(task_id, updates):
        resp = session.patch(f"{BASE_URL}/api/tasks/{task_id}", json=updates, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def delete_task(task_id):
        resp = session.delete(f"{BASE_URL}/api/tasks/{task_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp

    def create_resource():
        payload = {
            "name": "AuditLogTest Resource",
            "role": "tester",
            "capacity": 40
        }
        resp = session.post(f"{BASE_URL}/api/resources", json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()["id"]

    def get_resource(resource_id):
        resp = session.get(f"{BASE_URL}/api/resources/{resource_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def update_resource(resource_id, updates):
        resp = session.patch(f"{BASE_URL}/api/resources/{resource_id}", json=updates, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def delete_resource(resource_id):
        resp = session.delete(f"{BASE_URL}/api/resources/{resource_id}", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp

    def get_audit_logs(entity_type, entity_id):
        # Assuming audit logs can be retrieved by querying /api/audit-logs?entity=xxx&id=yyy
        resp = session.get(f"{BASE_URL}/api/audit-logs", params={"entity": entity_type, "id": entity_id}, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    # Start tests
    # Since the PRD does not specify audit log retrieval endpoint,
    # try the assumed endpoint /api/audit-logs?entity=&id=
    # We'll verify before and after states exist for each CRUD on projects, tasks, and resources.

    # PROJECT tests
    project_id = None
    task_id = None
    resource_id = None
    try:
        # Create project
        project_id = create_project()
        project_logs = get_audit_logs("project", project_id)
        assert isinstance(project_logs, list), "Audit logs should be a list"
        assert any("before" in log and "after" in log for log in project_logs), "Audit logs must capture before and after states on creation"

        # Update project
        project_before = get_project(project_id)
        updated_project = update_project(project_id, {"description": "Updated description for audit logging"})
        project_after = get_project(project_id)
        project_logs = get_audit_logs("project", project_id)
        # Find log entry with this update by checking difference in after states
        update_logs = [log for log in project_logs if "before" in log and "after" in log and
                       log["before"].get("description") != log["after"].get("description")]
        assert update_logs, "Audit logs must capture before and after states on update"

        # TASK tests
        task_id = create_task(project_id)
        task_logs = get_audit_logs("task", task_id)
        assert isinstance(task_logs, list), "Audit logs should be a list"
        assert any("before" in log and "after" in log for log in task_logs), "Audit logs must capture before and after states on creation"

        # Update task
        task_before = get_task(task_id)
        updated_task = update_task(task_id, {"status": "in_progress"})
        task_after = get_task(task_id)
        task_logs = get_audit_logs("task", task_id)
        update_logs = [log for log in task_logs if "before" in log and "after" in log and
                       log["before"].get("status") != log["after"].get("status")]
        assert update_logs, "Audit logs must capture before and after states on update"

        # RESOURCE tests
        resource_id = create_resource()
        resource_logs = get_audit_logs("resource", resource_id)
        assert isinstance(resource_logs, list), "Audit logs should be a list"
        assert any("before" in log and "after" in log for log in resource_logs), "Audit logs must capture before and after states on creation"

        # Update resource
        resource_before = get_resource(resource_id)
        updated_resource = update_resource(resource_id, {"capacity": resource_before.get("capacity", 0) + 10})
        resource_after = get_resource(resource_id)
        resource_logs = get_audit_logs("resource", resource_id)
        update_logs = [log for log in resource_logs if "before" in log and "after" in log and
                       log["before"].get("capacity") != log["after"].get("capacity")]
        assert update_logs, "Audit logs must capture before and after states on update"

        # DELETE operations and audit logs for them:
        # Project delete
        delete_project(project_id)
        project_logs_after_delete = get_audit_logs("project", project_id)
        delete_logs = [log for log in project_logs_after_delete if "before" in log and "after" in log and
                       log["after"].get("deleted") is True or log["after"].get("status") == "deleted"]
        assert delete_logs, "Audit logs must capture before and after states on delete (soft delete) of project"
        project_id = None  # Already deleted

        # Task delete
        delete_task(task_id)
        task_logs_after_delete = get_audit_logs("task", task_id)
        delete_logs = [log for log in task_logs_after_delete if "before" in log and "after" in log and
                       log["after"].get("deleted") is True or log["after"].get("status") == "deleted"]
        assert delete_logs, "Audit logs must capture before and after states on delete (soft delete) of task"
        task_id = None

        # Resource delete
        delete_resource(resource_id)
        resource_logs_after_delete = get_audit_logs("resource", resource_id)
        delete_logs = [log for log in resource_logs_after_delete if "before" in log and "after" in log and
                       log["after"].get("deleted") is True or log["after"].get("status") == "deleted"]
        assert delete_logs, "Audit logs must capture before and after states on delete (soft delete) of resource"
        resource_id = None

    finally:
        # Cleanup if not already deleted
        if task_id is not None:
            try:
                delete_task(task_id)
            except Exception:
                pass
        if project_id is not None:
            try:
                delete_project(project_id)
            except Exception:
                pass
        if resource_id is not None:
            try:
                delete_resource(resource_id)
            except Exception:
                pass

validate_audit_logging_for_crud_operations()