import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_verify_jwt_authentication_enforcement():
    # According to PRD, API has no authentication (open API). So no JWT enforcement expected.
    endpoints = [
        {"path": "/api/dashboard", "methods": ["GET"]},
        {"path": "/api/projects", "methods": ["GET", "POST"]},
        {"path": "/api/projects/1", "methods": ["GET", "PATCH", "DELETE"]},
        {"path": "/api/tasks", "methods": ["GET", "POST"]},
        {"path": "/api/tasks/1", "methods": ["GET", "PATCH", "DELETE"]},
        {"path": "/api/resources", "methods": ["GET", "POST"]},
        {"path": "/api/resources/1", "methods": ["GET", "PATCH", "DELETE"]},
        {"path": "/api/governance/release-readiness", "methods": ["GET"]},
        {"path": "/api/governance/quality-risks", "methods": ["GET"]},
        {"path": "/api/governance/project-health", "methods": ["GET"]},
        {"path": "/api/governance/dashboard-summary", "methods": ["GET"]},
        {"path": "/api/governance/gates/1", "methods": ["GET"]},
        {"path": "/api/governance/gates", "methods": ["POST"]},
        {"path": "/api/governance/approvals", "methods": ["POST"]},
    ]

    headers = {"Content-Type": "application/json"}

    for endpoint in endpoints:
        for method in endpoint["methods"]:
            url = f"{BASE_URL}{endpoint['path']}"
            try:
                if method == "GET":
                    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
                elif method == "POST":
                    resp = requests.post(url, headers=headers, json={}, timeout=TIMEOUT)
                elif method == "PATCH":
                    resp = requests.patch(url, headers=headers, json={}, timeout=TIMEOUT)
                elif method == "DELETE":
                    resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
                else:
                    continue
            except requests.RequestException as e:
                assert False, f"Request to {method} {url} failed with exception: {e}"

            # Since no JWT auth enforcement is expected, check for success or client error but not 401/403
            # Accept 2xx or 4xx other than 401/403 (like 404) as valid
            valid_status_codes = list(range(200,300)) + [400,404,405]
            assert resp.status_code in valid_status_codes, (
                f"Endpoint {method} {url} returned unexpected status code {resp.status_code}, response body: {resp.text}"
            )

test_verify_jwt_authentication_enforcement()
