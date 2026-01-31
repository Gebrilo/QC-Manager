import requests

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_project_update_and_soft_deletion():
    project_url = f"{BASE_URL}/api/projects"
    created_project_id = None

    try:
        new_project_data = {
            "project_name": "Test Project for Update and Delete",
            "description": "Project created for testing PATCH and DELETE endpoints",
            "status": "active"
        }
        response = requests.post(project_url, json=new_project_data, headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code in [200, 201], f"Unexpected status code on project creation: {response.status_code}"
        created_project = response.json()
        created_project_id = created_project.get("id")
        assert created_project_id is not None, "Created project ID is None"

        get_project_url = f"{project_url}/{created_project_id}"
        before_update_resp = requests.get(get_project_url, headers=HEADERS, timeout=TIMEOUT)
        assert before_update_resp.status_code == 200, f"Failed to get project before update: {before_update_resp.status_code}"

        update_payload = {"status": "completed"}
        patch_resp = requests.patch(get_project_url, json=update_payload, headers=HEADERS, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Project update failed with status code: {patch_resp.status_code}"
        updated_project_data = patch_resp.json()
        assert updated_project_data.get("status") == "completed", "Project status did not update correctly"

        delete_resp = requests.delete(get_project_url, headers=HEADERS, timeout=TIMEOUT)
        assert delete_resp.status_code == 200, f"Soft delete failed with status code: {delete_resp.status_code}"

        get_after_delete_resp = requests.get(get_project_url, headers=HEADERS, timeout=TIMEOUT)
        if get_after_delete_resp.status_code == 404:
            pass
        elif get_after_delete_resp.status_code == 200:
            deleted_project = get_after_delete_resp.json()
            assert deleted_project.get("deleted_at") is not None, "Project not marked as deleted after DELETE"

    finally:
        if created_project_id:
            requests.delete(f"{project_url}/{created_project_id}", headers=HEADERS, timeout=TIMEOUT)

test_project_update_and_soft_deletion()
