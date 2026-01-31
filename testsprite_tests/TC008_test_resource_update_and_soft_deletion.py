import requests

BASE_URL = "http://72.61.157.168"
HEADERS = {
    "Content-Type": "application/json",
    "Host": "api.gerbil.qc"
}
TIMEOUT = 30


def test_resource_update_and_soft_deletion():
    resource_data = {
        "resource_name": "Test Resource for Update",
        "role": "QA Engineer",
        "weekly_capacity_hrs": 40,
        "is_active": True
    }

    created_resource_id = None
    try:
        create_resp = requests.post(
            f"{BASE_URL}/api/resources",
            json=resource_data,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code in [200, 201], f"Resource creation failed: {create_resp.text}"
        created_resource = create_resp.json()
        created_resource_id = created_resource.get("id")
        assert created_resource_id is not None, "Created resource ID is None"

        update_data = {
            "role": "Senior QA Engineer",
            "weekly_capacity_hrs": 45
        }

        patch_resp = requests.patch(
            f"{BASE_URL}/api/resources/{created_resource_id}",
            json=update_data,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert patch_resp.status_code == 200, f"Resource update failed: {patch_resp.text}"
        updated_resource = patch_resp.json()
        assert updated_resource.get("role") == "Senior QA Engineer", "Role not updated correctly"

        delete_resp = requests.delete(
            f"{BASE_URL}/api/resources/{created_resource_id}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert delete_resp.status_code == 200, f"Resource soft-deletion failed: {delete_resp.text}"

        list_resp = requests.get(
            f"{BASE_URL}/api/resources",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert list_resp.status_code == 200, f"Failed to list resources: {list_resp.text}"

    finally:
        if created_resource_id is not None:
            try:
                requests.delete(
                    f"{BASE_URL}/api/resources/{created_resource_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT,
                )
            except Exception:
                pass


test_resource_update_and_soft_deletion()
