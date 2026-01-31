import requests
import uuid

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_task_creation_and_listing():
    task_id = None
    project_id = None
    resource_id = None
    
    try:
        projects_resp = requests.get(f"{BASE_URL}/projects", headers=HEADERS, timeout=TIMEOUT)
        assert projects_resp.status_code == 200, f"Failed getting projects, status: {projects_resp.status_code}"
        projects = projects_resp.json()
        if projects and len(projects) > 0:
            project_id = projects[0].get("id")
        else:
            project_payload = {"project_name": f"Test Project {uuid.uuid4()}", "status": "active"}
            create_proj_resp = requests.post(f"{BASE_URL}/projects", json=project_payload, headers=HEADERS, timeout=TIMEOUT)
            assert create_proj_resp.status_code in [200, 201], f"Failed creating project: {create_proj_resp.status_code}"
            project_id = create_proj_resp.json().get("id")

        resources_resp = requests.get(f"{BASE_URL}/resources", headers=HEADERS, timeout=TIMEOUT)
        assert resources_resp.status_code == 200, f"Failed getting resources, status: {resources_resp.status_code}"
        resources = resources_resp.json()
        if resources and len(resources) > 0:
            resource_id = resources[0].get("id")

        task_payload = {
            "task_name": f"Test Task {uuid.uuid4()}",
            "description": "Task created during automated test",
            "status": "backlog",
            "project_id": project_id,
            "assigned_resource_id": resource_id,
            "estimated_hrs": 10
        }
        create_task_resp = requests.post(f"{BASE_URL}/tasks", json=task_payload, headers=HEADERS, timeout=TIMEOUT)
        assert create_task_resp.status_code in [200, 201], f"Task creation failed with status: {create_task_resp.status_code}"
        task_resp_json = create_task_resp.json()
        task_id = task_resp_json.get("id")
        assert task_id is not None, "Created task does not have an ID"

        list_tasks_resp = requests.get(f"{BASE_URL}/tasks", headers=HEADERS, timeout=TIMEOUT)
        assert list_tasks_resp.status_code == 200, f"Failed to list tasks, status: {list_tasks_resp.status_code}"
        tasks_list = list_tasks_resp.json()
        assert isinstance(tasks_list, list), "Tasks list response is not a list"

        matched_tasks = [t for t in tasks_list if t.get("id") == task_id]
        assert len(matched_tasks) == 1, f"Created task with ID {task_id} not found in task list"

    finally:
        if task_id:
            requests.delete(f"{BASE_URL}/tasks/{task_id}", headers=HEADERS, timeout=TIMEOUT)

test_task_creation_and_listing()
