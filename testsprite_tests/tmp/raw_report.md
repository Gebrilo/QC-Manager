
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** QC-Manager
- **Date:** 2026-01-31
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 verify health check endpoint
- **Test Code:** [TC001_verify_health_check_endpoint.py](./TC001_verify_health_check_endpoint.py)
- **Test Error:** Traceback (most recent call last):
  File "<string>", line 11, in test_verify_health_check_endpoint
  File "/var/task/requests/models.py", line 1024, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 404 Client Error: Not Found for url: http://72.61.157.168/api/health

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 20, in <module>
  File "<string>", line 18, in test_verify_health_check_endpoint
AssertionError: Request failed: 404 Client Error: Not Found for url: http://72.61.157.168/api/health

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/67aece30-23e9-4557-b3ff-a3035034d9dc
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 validate dashboard metrics retrieval
- **Test Code:** [TC002_validate_dashboard_metrics_retrieval.py](./TC002_validate_dashboard_metrics_retrieval.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 39, in <module>
  File "<string>", line 15, in test_validate_dashboard_metrics_retrieval
AssertionError: Expected 200 OK but got 404

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/bec8669b-33dd-4cf3-b780-bfcd5b31c49d
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 test project creation and listing
- **Test Code:** [TC003_test_project_creation_and_listing.py](./TC003_test_project_creation_and_listing.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 60, in <module>
  File "<string>", line 26, in test_project_creation_and_listing
AssertionError: Expected 201 or 200 on project creation, got 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/aa44aef0-e569-4cb0-96cc-f2f60494d9f4
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 test project update and soft deletion
- **Test Code:** [TC004_test_project_update_and_soft_deletion.py](./TC004_test_project_update_and_soft_deletion.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 69, in <module>
  File "<string>", line 19, in test_project_update_and_soft_deletion
AssertionError: Unexpected status code on project creation: 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/96c727f4-a520-4b51-a9d0-133f65a29561
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 test task creation and listing
- **Test Code:** [TC005_test_task_creation_and_listing.py](./TC005_test_task_creation_and_listing.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 78, in <module>
  File "<string>", line 18, in test_task_creation_and_listing
AssertionError: Failed getting resources, status: 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/5da3fde1-76d3-44aa-8eee-1ba6fc665016
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 test task update and soft deletion
- **Test Code:** [TC006_test_task_update_and_soft_deletion.py](./TC006_test_task_update_and_soft_deletion.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 82, in <module>
  File "<string>", line 20, in test_task_update_and_soft_deletion
AssertionError: Task creation failed: Proxy server error: connect ETIMEDOUT 72.61.157.168:3001

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/433b054b-6db2-4cbd-b51d-c64a03df7136
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 test resource creation and listing
- **Test Code:** [TC007_test_resource_creation_and_listing.py](./TC007_test_resource_creation_and_listing.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/urllib3/connectionpool.py", line 787, in urlopen
    response = self._make_request(
               ^^^^^^^^^^^^^^^^^^^
  File "/var/task/urllib3/connectionpool.py", line 534, in _make_request
    response = conn.getresponse()
               ^^^^^^^^^^^^^^^^^^
  File "/var/task/urllib3/connection.py", line 565, in getresponse
    httplib_response = super().getresponse()
                       ^^^^^^^^^^^^^^^^^^^^^
  File "/var/lang/lib/python3.12/http/client.py", line 1430, in getresponse
    response.begin()
  File "/var/lang/lib/python3.12/http/client.py", line 331, in begin
    version, status, reason = self._read_status()
                              ^^^^^^^^^^^^^^^^^^^
  File "/var/lang/lib/python3.12/http/client.py", line 292, in _read_status
    line = str(self.fp.readline(_MAXLINE + 1), "iso-8859-1")
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/var/lang/lib/python3.12/socket.py", line 720, in readinto
    return self._sock.recv_into(b)
           ^^^^^^^^^^^^^^^^^^^^^^^
ConnectionResetError: [Errno 104] Connection reset by peer

The above exception was the direct cause of the following exception:

urllib3.exceptions.ProxyError: ('Unable to connect to proxy', ConnectionResetError(104, 'Connection reset by peer'))

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "/var/task/requests/adapters.py", line 667, in send
    resp = conn.urlopen(
           ^^^^^^^^^^^^^
  File "/var/task/urllib3/connectionpool.py", line 841, in urlopen
    retries = retries.increment(
              ^^^^^^^^^^^^^^^^^^
  File "/var/task/urllib3/util/retry.py", line 519, in increment
    raise MaxRetryError(_pool, url, reason) from reason  # type: ignore[arg-type]
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
urllib3.exceptions.MaxRetryError: HTTPConnectionPool(host='tun.testsprite.com', port=8080): Max retries exceeded with url: http://72.61.157.168:3001/api/resources (Caused by ProxyError('Unable to connect to proxy', ConnectionResetError(104, 'Connection reset by peer')))

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 57, in <module>
  File "<string>", line 16, in test_resource_creation_and_listing
  File "/var/task/requests/api.py", line 115, in post
    return request("post", url, data=data, json=json, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/var/task/requests/api.py", line 59, in request
    return session.request(method=method, url=url, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/var/task/requests/sessions.py", line 589, in request
    resp = self.send(prep, **send_kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/var/task/requests/sessions.py", line 703, in send
    r = adapter.send(request, **kwargs)
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/var/task/requests/adapters.py", line 694, in send
    raise ProxyError(e, request=request)
requests.exceptions.ProxyError: HTTPConnectionPool(host='tun.testsprite.com', port=8080): Max retries exceeded with url: http://72.61.157.168:3001/api/resources (Caused by ProxyError('Unable to connect to proxy', ConnectionResetError(104, 'Connection reset by peer')))

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/058485cf-02c9-4789-9897-6217bf89762a
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 test resource update and soft deletion
- **Test Code:** [TC008_test_resource_update_and_soft_deletion.py](./TC008_test_resource_update_and_soft_deletion.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 87, in <module>
  File "<string>", line 25, in test_resource_update_and_soft_deletion
AssertionError: Resource creation failed: Proxy server error: connect ETIMEDOUT 72.61.157.168:3001

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/699965c1-e1a5-4d35-b79e-493680ec2e28
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 validate governance release readiness retrieval
- **Test Code:** [TC009_validate_governance_release_readiness_retrieval.py](./TC009_validate_governance_release_readiness_retrieval.py)
- **Test Error:** Traceback (most recent call last):
  File "<string>", line 13, in test_validate_governance_release_readiness_retrieval
  File "/var/task/requests/models.py", line 1024, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 404 Client Error: Not Found for url: http://72.61.157.168/api/governance/release-readiness

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 36, in <module>
  File "<string>", line 15, in test_validate_governance_release_readiness_retrieval
AssertionError: Request to http://72.61.157.168/api/governance/release-readiness failed: 404 Client Error: Not Found for url: http://72.61.157.168/api/governance/release-readiness

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/d0ec2d08-84b2-48ae-8c7b-b6f05c2cec79
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 test quality gates configuration management
- **Test Code:** [TC010_test_quality_gates_configuration_management.py](./TC010_test_quality_gates_configuration_management.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 127, in <module>
  File "<string>", line 24, in test_quality_gates_configuration_management
AssertionError: Expected 201, got 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/b889ac76-d541-4e57-9d32-a3e83be87acd/77a5bdeb-cbc6-4120-9df8-e7e3cce3ba81
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **0.00** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---