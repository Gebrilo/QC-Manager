import requests

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}

def test_resource_creation_and_listing():
    resource_data = {
        "resource_name": "Test Resource TC007",
        "weekly_capacity_hrs": 40,
        "email": "test@example.com",
        "department": "QA",
        "role": "tester",
        "is_active": True
    }
    resource_id = None
    try:
        post_response = requests.post(
            f"{BASE_URL}/api/resources",
            json=resource_data,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert post_response.status_code in [200, 201], f"Expected status 201, got {post_response.status_code}"
        resp_json = post_response.json()
        assert "id" in resp_json, "Response JSON missing resource id"
        resource_id = resp_json["id"]
        assert resp_json.get("resource_name") == resource_data["resource_name"], "Resource name mismatch"

        get_response = requests.get(
            f"{BASE_URL}/api/resources",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert get_response.status_code == 200, f"Expected status 200, got {get_response.status_code}"
        resources = get_response.json()
        assert isinstance(resources, list), "Resources list response is not a list"
        found = False
        for r in resources:
            if r.get("id") == resource_id:
                found = True
                assert r.get("resource_name") == resource_data["resource_name"], "Listed resource name mismatch"
                break
        assert found, "Created resource not found in resource listing"
    finally:
        if resource_id:
            del_response = requests.delete(
                f"{BASE_URL}/api/resources/{resource_id}",
                headers=HEADERS,
                timeout=TIMEOUT
            )
            assert del_response.status_code in (200, 204), f"Expected 200 or 204 on delete, got {del_response.status_code}"

test_resource_creation_and_listing()
