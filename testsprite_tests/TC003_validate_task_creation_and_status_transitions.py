import requests
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}

def test_validate_task_creation_and_status_transitions():
    unique_id = str(uuid.uuid4())[:8].upper()  # Uppercase for task_id regex
    resource_id = None
    task_id = None
    project_id = None

    try:
        # First create a project (tasks require a project_id)
        project_payload = {
            "project_id": f"PROJ-TC003-{unique_id}",
            "name": "Test Project for Tasks"
        }
        resp_proj = requests.post(f"{BASE_URL}/api/projects", json=project_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_proj.status_code == 201, f"Project creation failed: {resp_proj.status_code} {resp_proj.text}"
        project_id = resp_proj.json().get("id")
        assert project_id is not None

        # Create resource
        resource_payload = {
            "resource_name": "Test Resource for Task",
            "role": "QA Engineer",
            "weekly_capacity_hrs": 40
        }
        resp_res = requests.post(f"{BASE_URL}/api/resources", json=resource_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_res.status_code == 201, f"Resource creation failed: {resp_res.status_code} {resp_res.text}"
        resource_id = resp_res.json().get("id")
        assert resource_id is not None

        # Create task payload (task_id, project_id, task_name are required)
        task_payload = {
            "task_id": f"TSK-TC003-{unique_id}",
            "project_id": project_id,
            "task_name": "Test Task Creation and Status Transitions",
            "status": "Backlog",
            "resource1_uuid": resource_id,
            "deadline": "2026-12-31"
        }

        # Create task
        resp_task_create = requests.post(f"{BASE_URL}/api/tasks", json=task_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_task_create.status_code == 201, f"Task creation failed: {resp_task_create.status_code} {resp_task_create.text}"
        task_data = resp_task_create.json()
        task_id = task_data.get("id")
        assert task_id is not None
        assert task_data.get("status") == "Backlog"

        # Valid status transitions: Backlog -> In Progress -> Done
        # Update to In Progress
        patch_payload = {"status": "In Progress"}
        resp_update = requests.patch(f"{BASE_URL}/api/tasks/{task_id}", json=patch_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_update.status_code == 200, f"Status update to In Progress failed: {resp_update.status_code} {resp_update.text}"
        updated_task = resp_update.json()
        assert updated_task.get("status") == "In Progress"

        # Update to Done (requires completed_date and actual hours > 0)
        patch_payload_done = {"status": "Done", "completed_date": "2026-01-31", "r1_actual_hrs": 8}
        resp_update_done = requests.patch(f"{BASE_URL}/api/tasks/{task_id}", json=patch_payload_done, headers=HEADERS, timeout=TIMEOUT)
        assert resp_update_done.status_code == 200, f"Status update to Done failed: {resp_update_done.status_code} {resp_update_done.text}"
        updated_task_done = resp_update_done.json()
        assert updated_task_done.get("status") == "Done"

        # Attempt invalid status transition (Done -> Backlog should be blocked)
        invalid_transition_payload = {"status": "Backlog"}
        resp_invalid_update = requests.patch(f"{BASE_URL}/api/tasks/{task_id}", json=invalid_transition_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_invalid_update.status_code in (400, 422), f"Invalid status transition accepted: {resp_invalid_update.status_code} {resp_invalid_update.text}"
        err_json = resp_invalid_update.json()
        assert "error" in err_json or "message" in err_json

        # Verify resource assignment remains consistent after status transitions
        resp_task_get = requests.get(f"{BASE_URL}/api/tasks/{task_id}", headers=HEADERS, timeout=TIMEOUT)
        assert resp_task_get.status_code == 200
        task_after_updates = resp_task_get.json()
        assert task_after_updates.get("resource1_uuid") == resource_id

        print("TC003: All task creation and status transition tests passed!")

    finally:
        # Cleanup: delete task if created
        if task_id:
            requests.delete(f"{BASE_URL}/api/tasks/{task_id}", headers=HEADERS, timeout=TIMEOUT)
        # Cleanup: delete resource if created
        if resource_id:
            requests.delete(f"{BASE_URL}/api/resources/{resource_id}", headers=HEADERS, timeout=TIMEOUT)
        # Cleanup: delete project if created
        if project_id:
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS, timeout=TIMEOUT)

test_validate_task_creation_and_status_transitions()
