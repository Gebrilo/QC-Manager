import requests
import time

BASE_URL = "http://72.61.157.168"
TIMEOUT = 30
HEADERS = {
    "Accept": "application/json",
    "Host": "api.gerbil.qc"
}

def test_validate_dashboard_metrics_retrieval():
    url = f"{BASE_URL}/dashboard"
    try:
        start_time = time.time()
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        elapsed_time = time.time() - start_time

        assert response.status_code == 200, f"Expected 200 OK but got {response.status_code}"
        assert elapsed_time <= 3, f"Response time exceeded 3 seconds: {elapsed_time:.2f}s"

        data = response.json()
        assert isinstance(data, dict), "Response JSON is not an object"

        expected_keys = [
            "total_tasks", "tasks_done", "tasks_in_progress",
            "total_projects", "active_resources"
        ]
        assert any(key in data for key in expected_keys), \
            f"Response JSON does not contain any expected dashboard metric keys from {expected_keys}"

    except requests.RequestException as e:
        assert False, f"Request to /dashboard failed: {e}"
    except ValueError:
        assert False, "Response is not valid JSON"

test_validate_dashboard_metrics_retrieval()
