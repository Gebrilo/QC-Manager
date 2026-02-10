import requests
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_resource_allocation_and_utilization():
    resource_id = None
    project_id = None
    task_id = None
    unique_id = str(uuid.uuid4())[:8].upper()

    try:
        # Step 1: Create a new resource with weekly capacity
        create_resource_payload = {
            "resource_name": "Test Resource Allocation",
            "weekly_capacity_hrs": 40,
            "role": "QA Engineer",
            "department": "Quality Assurance"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/resources",
            json=create_resource_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 201, f"Resource creation failed: {create_resp.text}"
        resource = create_resp.json()
        resource_id = resource["id"]
        assert resource["weekly_capacity_hrs"] == 40
        assert resource["resource_name"] == "Test Resource Allocation"

        # Step 2: Update resource capacity
        update_payload = {
            "weekly_capacity_hrs": 35,
            "department": "Engineering"
        }
        update_resp = requests.patch(
            f"{BASE_URL}/api/resources/{resource_id}",
            json=update_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert update_resp.status_code == 200, f"Resource update failed: {update_resp.text}"
        updated_resource = update_resp.json()
        assert updated_resource["weekly_capacity_hrs"] == 35
        assert updated_resource["department"] == "Engineering"

        # Step 3: Create a project and task to test resource assignment
        project_payload = {
            "project_id": f"PROJ-TC004-{unique_id}",
            "name": "Test Project for Resource Allocation"
        }
        proj_resp = requests.post(f"{BASE_URL}/api/projects", json=project_payload, headers=HEADERS, timeout=TIMEOUT)
        assert proj_resp.status_code == 201, f"Project creation failed: {proj_resp.text}"
        project_id = proj_resp.json()["id"]

        # Step 4: Create a task assigned to the resource
        task_payload = {
            "task_id": f"TSK-TC004-{unique_id}",
            "project_id": project_id,
            "task_name": "Task assigned to test resource",
            "status": "Backlog",
            "resource1_uuid": resource_id,
            "r1_estimate_hrs": 20
        }
        task_resp = requests.post(f"{BASE_URL}/api/tasks", json=task_payload, headers=HEADERS, timeout=TIMEOUT)
        assert task_resp.status_code == 201, f"Task creation failed: {task_resp.text}"
        task_id = task_resp.json()["id"]

        # Step 5: Verify resource has utilization metrics (calculated from tasks)
        get_resp = requests.get(f"{BASE_URL}/api/resources/{resource_id}", headers=HEADERS, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Get resource failed: {get_resp.text}"
        resource_with_util = get_resp.json()
        assert "utilization_pct" in resource_with_util or "current_allocation_hrs" in resource_with_util

        # Step 6: Verify invalid resource updates are rejected
        invalid_update = {"weekly_capacity_hrs": 100}  # Max is 80
        invalid_resp = requests.patch(
            f"{BASE_URL}/api/resources/{resource_id}",
            json=invalid_update,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert invalid_resp.status_code in (400, 422), f"Expected validation error, got {invalid_resp.status_code}"

        print("TC004: All resource allocation tests passed!")

    finally:
        # Cleanup
        if task_id:
            try:
                requests.delete(f"{BASE_URL}/api/tasks/{task_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass
        if project_id:
            try:
                requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass
        if resource_id:
            try:
                requests.delete(f"{BASE_URL}/api/resources/{resource_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass


test_resource_allocation_and_utilization()