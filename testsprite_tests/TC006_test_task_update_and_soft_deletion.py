import requests

BASE_URL = "http://72.61.157.168"
TASKS_ENDPOINT = f"{BASE_URL}/tasks"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_task_update_and_soft_deletion():
    task_id = None
    project_id = None
    
    try:
        projects_resp = requests.get(f"{BASE_URL}/projects", headers=HEADERS, timeout=TIMEOUT)
        if projects_resp.status_code == 200 and projects_resp.json():
            project_id = projects_resp.json()[0].get("id")

        create_payload = {
            "task_name": "Test Task for Update and Soft Deletion",
            "description": "Task created for testing PATCH and DELETE endpoints",
            "status": "backlog",
            "project_id": project_id
        }

        create_resp = requests.post(TASKS_ENDPOINT, json=create_payload, headers=HEADERS, timeout=TIMEOUT)
        assert create_resp.status_code in [200, 201], f"Task creation failed: {create_resp.text}"
        task_data = create_resp.json()
        task_id = task_data.get("id")
        assert task_id is not None, "Created task ID not returned"

        get_resp = requests.get(f"{TASKS_ENDPOINT}/{task_id}", headers=HEADERS, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Failed to retrieve created task: {get_resp.text}"
        task_before_update = get_resp.json()
        assert task_before_update.get("status") == "backlog", "Initial task status mismatch"

        patch_payload = {"status": "in_progress"}
        patch_resp = requests.patch(f"{TASKS_ENDPOINT}/{task_id}", json=patch_payload, headers=HEADERS, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Task update PATCH failed: {patch_resp.text}"
        updated_task = patch_resp.json()
        assert updated_task.get("status") == "in_progress", "Task status not updated correctly"

        delete_resp = requests.delete(f"{TASKS_ENDPOINT}/{task_id}", headers=HEADERS, timeout=TIMEOUT)
        assert delete_resp.status_code == 200, f"Task DELETE failed: {delete_resp.text}"

        get_after_delete_resp = requests.get(f"{TASKS_ENDPOINT}/{task_id}", headers=HEADERS, timeout=TIMEOUT)
        if get_after_delete_resp.status_code == 404:
            pass
        elif get_after_delete_resp.status_code == 200:
            task_after_delete = get_after_delete_resp.json()
            assert task_after_delete.get("deleted_at") is not None, "Task not marked as deleted after DELETE"

    finally:
        if task_id:
            try:
                requests.delete(f"{TASKS_ENDPOINT}/{task_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass

test_task_update_and_soft_deletion()
