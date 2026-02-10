import subprocess
import sys

def verify_deployment_guides_for_docker_and_hostinger():
    """
    Test Case: TC010
    Verify deployment procedures using Docker Compose and Hostinger VPS instructions 
    to ensure reproducible local and production deployments.
    """

    # Test Docker Compose local deployment
    try:
        # Step 1: Run 'docker compose config' to validate the Docker Compose file syntax
        result = subprocess.run(
            ["docker", "compose", "config"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"Docker Compose config validation failed:\n{result.stderr}"

        # Step 2: Bring up the services using 'docker compose up -d'
        up_result = subprocess.run(
            ["docker", "compose", "up", "-d"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert up_result.returncode == 0, f"Docker Compose up failed:\n{up_result.stderr}"

        # Step 3: Verify containers are running with 'docker compose ps'
        ps_result = subprocess.run(
            ["docker", "compose", "ps"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert ps_result.returncode == 0, f"Docker Compose ps failed:\n{ps_result.stderr}"
        output = ps_result.stdout.lower()
        # Basic checks to ensure key services are listed as up
        assert "up" in output, "No running containers detected in Docker Compose ps output"
        assert "qc_manager" in output or "qc-manager" in output or "express" in output or "backend" in output, "Expected QC Manager service not found running"

    finally:
        # Step 4: Tear down any running containers from the test
        subprocess.run(["docker", "compose", "down"], capture_output=True, timeout=60)

    # Test Hostinger VPS deployment instructions simulation
    # Since actual VPS deployment cannot be executed here,
    # simulate the typical deployment steps verifying command availability and syntax.

    # Check SSH client availability to simulate remote connection (no connection attempt)
    ssh_check = subprocess.run(["ssh", "-V"], capture_output=True, text=True)
    assert ssh_check.returncode == 0 or ssh_check.returncode is None, "SSH client not available for VPS deployment simulation"

    # Check commands typically used in production deployment
    for cmd in [["git", "--version"], ["node", "--version"], ["npm", "--version"]]:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        assert proc.returncode == 0, f"Required command {' '.join(cmd)} not available or failed: {proc.stderr}"

    # Check basic Docker commands on the VPS environment simulation (locals)
    for cmd in [["docker", "--version"], ["docker", "compose", "version"]]:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        assert proc.returncode == 0, f"Required Docker command {' '.join(cmd)} not available or failed: {proc.stderr}"

verify_deployment_guides_for_docker_and_hostinger()
