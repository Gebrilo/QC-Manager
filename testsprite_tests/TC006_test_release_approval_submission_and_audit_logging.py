import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_release_approval_submission_and_audit_logging():
    approvals_endpoint = f"{BASE_URL}/api/governance/approvals"
    headers = {"Content-Type": "application/json"}

    # Create a dummy project to attach approval (for audit trail completeness)
    project_payload = {
        "name": "Test Project for Release Approval",
        "description": "Project to test release approval submissions and audit logging",
        "status": "active"
    }
    project_id = None
    try:
        # Create project for context (needed to submit an approval with a valid projectId)
        create_project_resp = requests.post(f"{BASE_URL}/api/projects", json=project_payload, headers=headers, timeout=TIMEOUT)
        assert create_project_resp.status_code == 201, f"Project creation failed: {create_project_resp.text}"
        project_id = create_project_resp.json().get("id")
        assert project_id is not None, "Project ID missing from creation response"

        # Test valid approval submission (approval with compulsory comment)
        approval_payload_approved = {
            "projectId": project_id,
            "approvalStatus": "approved",
            "comment": "All quality gates passed and release is ready for production."
        }
        resp_approved = requests.post(approvals_endpoint, json=approval_payload_approved, headers=headers, timeout=TIMEOUT)
        assert resp_approved.status_code == 200, f"Approval submission failed: {resp_approved.text}"
        data_approved = resp_approved.json()
        assert "approvalId" in data_approved, "Approval ID missing in approval response"
        assert data_approved.get("status") == "approved", "Approval status not reflected correctly"

        # Test valid rejection submission (rejection with compulsory comment)
        approval_payload_rejected = {
            "projectId": project_id,
            "approvalStatus": "rejected",
            "comment": "Critical quality gates failed. Release blocked."
        }
        resp_rejected = requests.post(approvals_endpoint, json=approval_payload_rejected, headers=headers, timeout=TIMEOUT)
        assert resp_rejected.status_code == 200, f"Rejection submission failed: {resp_rejected.text}"
        data_rejected = resp_rejected.json()
        assert "approvalId" in data_rejected, "Approval ID missing in rejection response"
        assert data_rejected.get("status") == "rejected", "Rejection status not reflected correctly"

        # Test rejection without comment (should fail)
        approval_payload_no_comment = {
            "projectId": project_id,
            "approvalStatus": "rejected"
        }
        resp_no_comment = requests.post(approvals_endpoint, json=approval_payload_no_comment, headers=headers, timeout=TIMEOUT)
        assert resp_no_comment.status_code == 400 or resp_no_comment.status_code == 422, \
            "Submission without compulsory comment did not fail as expected"
        err_data = resp_no_comment.json()
        assert "error" in err_data, "Error message missing for missing comment"

        # Test approval without comment (should also fail since comment is compulsory)
        approval_payload_no_comment_approved = {
            "projectId": project_id,
            "approvalStatus": "approved"
        }
        resp_no_comment_approved = requests.post(approvals_endpoint, json=approval_payload_no_comment_approved, headers=headers, timeout=TIMEOUT)
        assert resp_no_comment_approved.status_code == 400 or resp_no_comment_approved.status_code == 422, \
            "Approval submission without compulsory comment did not fail as expected"
        err_data_approved = resp_no_comment_approved.json()
        assert "error" in err_data_approved, "Error message missing for missing approval comment"

        # Retrieve audit logs if available to verify audit trail completeness
        # Assuming an audit log endpoint exists as /api/audit/logs?entity=approvals&entityId=<approvalId>
        # We check at least one approval's audit logs
        approval_id = data_approved["approvalId"]
        audit_endpoint = f"{BASE_URL}/api/audit/logs"
        audit_params = {"entity": "approvals", "entityId": approval_id}
        audit_resp = requests.get(audit_endpoint, params=audit_params, headers=headers, timeout=TIMEOUT)
        assert audit_resp.status_code == 200, f"Failed to get audit logs: {audit_resp.text}"
        audit_data = audit_resp.json()
        assert isinstance(audit_data, list) and len(audit_data) > 0, "Audit logs missing or empty for approval"
        for entry in audit_data:
            assert "before" in entry and "after" in entry, "Audit log entry missing before/after states"
            assert entry.get("entityId") == approval_id, "Audit log entityId mismatch"

    finally:
        # Cleanup created project
        if project_id:
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=headers, timeout=TIMEOUT)


test_release_approval_submission_and_audit_logging()