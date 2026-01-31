import requests
import uuid

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_project_creation_and_listing():
    project_endpoint = f"{BASE_URL}/projects"

    new_project = {
        "project_id": f"TC003-{uuid.uuid4().hex[:8]}",
        "name": "Test Project TC003",
        "total_weight": 3,
        "priority": "High"
    }

    project_id = None

    try:
        create_response = requests.post(
            project_endpoint,
            json=new_project,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert create_response.status_code in [200, 201], \
            f"Expected 201 or 200 on project creation, got {create_response.status_code}: {create_response.text}"
        create_data = create_response.json()

        assert "id" in create_data, "Response JSON missing 'id'"
        project_id = create_data["id"]

        list_response = requests.get(project_endpoint, headers=HEADERS, timeout=TIMEOUT)
        assert list_response.status_code == 200, f"Expected 200 on project listing, got {list_response.status_code}"
        projects = list_response.json()

        assert isinstance(projects, list), "Project listing response is not a list"

        found_projects = [p for p in projects if p.get("id") == project_id]
        assert len(found_projects) == 1, "Created project not found in project listing"

    finally:
        if project_id:
            delete_response = requests.delete(f"{project_endpoint}/{project_id}", headers=HEADERS, timeout=TIMEOUT)

test_project_creation_and_listing()
