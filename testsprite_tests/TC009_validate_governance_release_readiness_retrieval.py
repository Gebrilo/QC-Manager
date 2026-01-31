import requests

BASE_URL = "http://72.61.157.168"
HEADERS = {
    "Accept": "application/json",
    "Host": "api.gerbil.qc"
}
TIMEOUT = 30

def test_validate_governance_release_readiness_retrieval():
    url = f"{BASE_URL}/api/governance/release-readiness"

    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response content is not valid JSON"

    assert isinstance(data, list), "Response should be a list of release readiness statuses"

    for item in data:
        assert isinstance(item, dict), "Each item should be a dictionary"
        assert "project_id" in item or "projectId" in item or "id" in item, "Each item should contain a project identifier"

test_validate_governance_release_readiness_retrieval()
