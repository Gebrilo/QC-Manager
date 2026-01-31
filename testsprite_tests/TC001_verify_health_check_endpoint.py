import requests

def test_verify_health_check_endpoint():
    base_url = "http://72.61.157.168"
    url = f"{base_url}/health"
    headers = {
        "Accept": "application/json",
        "Host": "api.gerbil.qc"
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        assert isinstance(data, dict), "Response is not a JSON object"
        assert "status" in data or "health" in data or "uptime" in data or "message" in data, "Response does not contain expected health info"
    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {e}"

test_verify_health_check_endpoint()
