import requests
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_verify_quality_gates_configuration_and_evaluation():
    unique_id = str(uuid.uuid4())[:8]
    project_id = None
    
    try:
        # Step 1: Create a sample project to associate quality gates with
        project_payload = {
            "project_id": f"PROJ-TC005-{unique_id}",
            "name": "TC005 Test Project",
            "description": "Project for quality gates configuration and evaluation testing"
        }

        # Create project
        r = requests.post(f"{BASE_URL}/api/projects", json=project_payload, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 201, f"Project creation failed: {r.text}"
        project = r.json()
        project_id = project.get("id")
        assert project_id is not None, "Project ID not returned"

        # Step 2: Create quality gates configuration for the project
        # Actual API expects: project_id, min_pass_rate, max_critical_defects, min_test_coverage
        gates_payload = {
            "project_id": project_id,
            "min_pass_rate": 80,
            "max_critical_defects": 0,
            "min_test_coverage": 75
        }
        r = requests.post(f"{BASE_URL}/api/governance/gates", json=gates_payload, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Creating/updating quality gates failed: {r.text}"
        created_gates = r.json()
        assert isinstance(created_gates, dict), "Quality gates response not a dict"

        # Step 3: Retrieve quality gates configuration and verify it matches
        r = requests.get(f"{BASE_URL}/api/governance/gates/{project_id}", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Get quality gates failed: {r.text}"
        retrieved_gates = r.json()
        # API returns {success: true, data: {...}}
        gate_data = retrieved_gates.get("data", retrieved_gates)
        # Handle Decimal type conversion (returns as string or float)
        min_pass_rate = gate_data.get("min_pass_rate") or gate_data.get("minPassRate")
        assert min_pass_rate is not None, f"min_pass_rate not found in {gate_data}"
        assert float(min_pass_rate) == 80.0, f"min_pass_rate expected 80, got {min_pass_rate}"

        # Step 4: Test approval workflow
        # Submit an approval
        approval_payload = {
            "project_id": project_id,
            "release_version": "1.0.0",
            "status": "approved",
            "approver_name": "Test Approver",
            "comments": "Approving release based on passing quality gates.",
            "gate_snapshot": {
                "min_pass_rate": 85,
                "critical_defects": 0
            }
        }

        r = requests.post(f"{BASE_URL}/api/governance/approvals", json=approval_payload, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Approval submission failed: {r.text}"
        approval_response = r.json()
        # API returns {success: true, data: {...}}
        approval_data = approval_response.get("data", approval_response)
        assert approval_data.get("id") is not None, f"Approval ID not returned: {approval_response}"

        # Step 5: Get approval history
        r = requests.get(f"{BASE_URL}/api/governance/approvals/{project_id}", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Get approval history failed: {r.text}"
        approvals_response = r.json()
        # API returns {success: true, data: [...]}
        approvals = approvals_response.get("data", approvals_response)
        assert isinstance(approvals, list), f"Approval history should be a list: {approvals_response}"
        assert len(approvals) > 0, "Should have at least one approval"

        print("TC005: All quality gates tests passed!")

    finally:
        # Clean up: delete the project
        if project_id:
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS, timeout=TIMEOUT)


test_verify_quality_gates_configuration_and_evaluation()