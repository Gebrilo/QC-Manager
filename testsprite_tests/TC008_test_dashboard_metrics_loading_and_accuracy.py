import requests
import time

BASE_URL = "http://localhost:3001"
DASHBOARD_ENDPOINT = f"{BASE_URL}/api/dashboard"
TIMEOUT_SECONDS = 30

def test_dashboard_metrics_loading_and_accuracy():
    # Measure load time and get metrics
    start_time = time.time()
    try:
        response = requests.get(DASHBOARD_ENDPOINT, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    duration = time.time() - start_time

    # Assert load time is within 3 seconds
    assert duration <= 3, f"Dashboard metrics loading took too long: {duration:.2f} seconds, expected <= 3 seconds"

    # Assert status code and JSON content
    assert response.status_code == 200, f"Unexpected status code: {response.status_code}"

    try:
        data = response.json()
    except ValueError as e:
        assert False, f"Response is not valid JSON: {e}"

    # Validate that data is a non-empty dictionary with expected keys present
    assert isinstance(data, dict), "Dashboard response JSON is not a dictionary"
    
    # Actual API uses snake_case keys
    expected_keys = ['total_projects', 'total_tasks', 'tasks_done', 'tasks_in_progress', 'tasks_backlog', 'active_resources']
    present_keys = [key for key in expected_keys if key in data]
    assert present_keys, f"None of the expected dashboard keys found in response JSON keys: {list(data.keys())}"

    # Validate numeric values are non-negative if present
    for key in present_keys:
        val = data[key]
        if val is not None:
            # Handle string numbers (some DB drivers return counts as strings)
            if isinstance(val, str):
                try:
                    val = int(val) if '.' not in val else float(val)
                except ValueError:
                    pass
            if isinstance(val, (int, float)):
                assert val >= 0, f"Dashboard metric '{key}' has negative value: {val}"

    print("TC008: Dashboard metrics test passed!")

test_dashboard_metrics_loading_and_accuracy()