import requests

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_quality_gates_configuration_management():
    project_payload = {
        "project_name": "Test Project for Quality Gates",
        "description": "Created for TC010 quality gates management test",
        "status": "active"
    }
    created_project = None

    try:
        resp_project = requests.post(
            f"{BASE_URL}/projects",
            json=project_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_project.status_code in [200, 201], f"Expected 201, got {resp_project.status_code}"
        created_project = resp_project.json()
        assert "id" in created_project, "Created project response missing 'id'"
        project_id = created_project["id"]

        resp_get_gates_initial = requests.get(
            f"{BASE_URL}/governance/gates/{project_id}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_get_gates_initial.status_code == 200, f"GET gates returned {resp_get_gates_initial.status_code}"

        gate_payload = {
            "project_id": project_id,
            "gate_name": "Code Coverage",
            "threshold_value": 80,
            "is_mandatory": True
        }
        resp_post_gates = requests.post(
            f"{BASE_URL}/governance/gates",
            json=gate_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_post_gates.status_code in (200, 201), f"POST gates returned {resp_post_gates.status_code}"

        resp_get_gates_after = requests.get(
            f"{BASE_URL}/governance/gates/{project_id}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_get_gates_after.status_code == 200, f"GET gates after update returned {resp_get_gates_after.status_code}"

    finally:
        if created_project:
            try:
                requests.delete(
                    f"{BASE_URL}/projects/{created_project['id']}",
                    headers=HEADERS,
                    timeout=TIMEOUT,
                )
            except Exception:
                pass

test_quality_gates_configuration_management()
