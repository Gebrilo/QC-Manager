import requests
import json
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json"
}

def test_validate_project_creation_and_update():
    project_url = f"{BASE_URL}/api/projects"
    unique_id = str(uuid.uuid4())[:8]

    # Sample valid project creation payload (project_id and name are required)
    valid_project = {
        "project_id": f"PROJ-TEST-{unique_id}",
        "name": "Test Project Valid",
        "description": "A valid test project",
        "priority": "High",
        "total_weight": 3
    }

    # Sample invalid project creation payloads
    invalid_projects = [
        {"name": "Missing project_id"},  # Missing required project_id
        {"project_id": "PROJ-001"},  # Missing required name
        {"project_id": "", "name": "Empty project_id"},  # Empty project_id
        {"project_id": "PROJ-002", "name": "", "description": "Empty name"},  # Empty name
        {"project_id": "PROJ-003", "name": "Valid Name", "priority": "InvalidPriority"},  # Invalid priority enum
        {"project_id": "PROJ-004", "name": "Valid Name", "total_weight": 10},  # Weight > 5
    ]

    created_project_id = None

    try:
        # Create project with valid payload, expect success (201 Created or 200)
        resp = requests.post(project_url, headers=HEADERS, json=valid_project, timeout=TIMEOUT)
        assert resp.status_code in (200, 201), f"Expected status 200 or 201 but got {resp.status_code}: {resp.text}"
        created_project = resp.json()
        assert "id" in created_project, "Created project response must include 'id'"
        created_project_id = created_project["id"]

        # Validate that the returned project has fields similar to what was sent
        assert created_project.get("project_name") == valid_project["name"] or created_project.get("name") == valid_project["name"]

        # Try updating the project with valid fields
        update_payload_valid = {
            "name": "Updated Project Name",
            "priority": "Medium"
        }
        patch_url = f"{project_url}/{created_project_id}"
        update_resp = requests.patch(patch_url, headers=HEADERS, json=update_payload_valid, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Expected 200 OK on valid update, got {update_resp.status_code}: {update_resp.text}"
        updated_project = update_resp.json()
        assert updated_project.get("project_name") == "Updated Project Name" or updated_project.get("name") == "Updated Project Name"

        # Try updating project with invalid priority
        update_payload_invalid = {
            "priority": "InvalidPriority"
        }
        update_resp_invalid = requests.patch(patch_url, headers=HEADERS, json=update_payload_invalid, timeout=TIMEOUT)
        assert update_resp_invalid.status_code in (400, 422), f"Expected 400 or 422 on invalid update, got {update_resp_invalid.status_code}"
        err_resp = update_resp_invalid.json()
        assert "error" in err_resp or "message" in err_resp or "details" in err_resp, "Error response should contain error info"

        # Try creating projects with invalid data and expect rejection with clear error messages
        for invalid_proj in invalid_projects:
            resp_invalid = requests.post(project_url, headers=HEADERS, json=invalid_proj, timeout=TIMEOUT)
            assert resp_invalid.status_code in (400, 422, 500), f"Expected 400/422/500 for invalid creation, got {resp_invalid.status_code} for {invalid_proj}"
            err_data = resp_invalid.json()
            assert "error" in err_data or "message" in err_data or "details" in err_data, f"Error response should contain error info for {invalid_proj}"

    finally:
        # Clean up: delete the created valid project if it exists
        if created_project_id:
            try:
                del_resp = requests.delete(f"{project_url}/{created_project_id}", headers=HEADERS, timeout=TIMEOUT)
                assert del_resp.status_code in (200, 204, 404), f"Unexpected status deleting project: {del_resp.status_code}"
            except Exception:
                pass

    print("TC002: All project creation and update tests passed!")

test_validate_project_creation_and_update()