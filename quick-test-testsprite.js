#!/usr/bin/env node

/**
 * Quick TestSprite Integration Test
 *
 * This script performs a quick test of the TestSprite integration
 * without requiring database setup or project IDs.
 */

const http = require('http');

const API_URL = 'http://localhost:3001';
const TEST_PROJECT_ID = 'test-project-uuid'; // This will fail but shows integration works

console.log('TestSprite Integration Quick Test\n');
console.log('=================================\n');

// Test 1: Check if API server is running
async function testAPIHealth() {
  console.log('Test 1: Checking API health...');

  return new Promise((resolve, reject) => {
    const req = http.request(`${API_URL}/health`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ API server is running\n');
          resolve(true);
        } else {
          console.log(`✗ API returned status ${res.statusCode}\n`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`✗ API server not accessible: ${error.message}`);
      console.log('  Please start the API server:');
      console.log('  cd "d:\\Claude\\QC management tool\\qc-app\\apps\\api"');
      console.log('  npm start\n');
      resolve(false);
    });

    req.end();
  });
}

// Test 2: Check TestSprite integration status
async function testTestSpriteStatus() {
  console.log('Test 2: Checking TestSprite integration status...');

  return new Promise((resolve, reject) => {
    const req = http.request(`${API_URL}/testsprite/status`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode === 200 && data.status === 'ok') {
            console.log('✓ TestSprite webhook endpoint is available');
            console.log(`  Integration: ${data.integration}`);
            console.log(`  Version: ${data.version}`);
            console.log(`  Webhook URL: ${data.webhook_url}`);
            console.log('  Supported formats:');
            data.supported_formats.forEach(format => {
              console.log(`    - ${format}`);
            });
            console.log('');
            resolve(true);
          } else {
            console.log(`✗ Unexpected response: ${res.statusCode}`);
            console.log(body);
            resolve(false);
          }
        } catch (error) {
          console.log(`✗ Failed to parse response: ${error.message}\n`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`✗ Request failed: ${error.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

// Test 3: Test webhook with sample data (will fail without valid project)
async function testWebhookPayload() {
  console.log('Test 3: Testing webhook with sample payload...');

  const samplePayload = {
    project_id: TEST_PROJECT_ID,
    results: {
      tests: [
        {
          id: 'quick-test-1',
          name: 'Sample test',
          status: 'passed'
        }
      ]
    }
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(samplePayload);

    const options = {
      method: 'POST',
      hostname: 'localhost',
      port: 3001,
      path: '/testsprite/webhook',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (res.statusCode === 400 && data.error && data.error.includes('project')) {
            console.log('✓ Webhook endpoint is working (project validation triggered)');
            console.log('  This is expected - you need a valid project_id to upload results');
            console.log('  Error received:', data.error);
            console.log('');
            resolve(true);
          } else if (res.statusCode === 200) {
            console.log('✓ Webhook accepted the payload successfully!');
            console.log('  Response:', JSON.stringify(data, null, 2));
            console.log('');
            resolve(true);
          } else {
            console.log(`? Unexpected response: ${res.statusCode}`);
            console.log('  Body:', body);
            console.log('');
            resolve(false);
          }
        } catch (error) {
          console.log(`✗ Failed to parse response: ${error.message}`);
          console.log('  Raw body:', body);
          console.log('');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`✗ Request failed: ${error.message}\n`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// Test 4: Check if sample results file exists
function testSampleFile() {
  console.log('Test 4: Checking for sample TestSprite results file...');

  const fs = require('fs');
  const path = require('path');
  const sampleFile = path.join(__dirname, 'test-testsprite-sample.json');

  if (fs.existsSync(sampleFile)) {
    console.log(`✓ Sample file exists: ${sampleFile}`);
    try {
      const content = fs.readFileSync(sampleFile, 'utf8');
      const data = JSON.parse(content);
      console.log(`  Contains ${data.tests?.length || 0} test results`);
      console.log('');
      return true;
    } catch (error) {
      console.log(`✗ Sample file is invalid JSON: ${error.message}\n`);
      return false;
    }
  } else {
    console.log(`✗ Sample file not found: ${sampleFile}\n`);
    return false;
  }
}

// Test 5: Check upload script exists
function testUploadScript() {
  console.log('Test 5: Checking upload script...');

  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.join(__dirname, 'scripts', 'testsprite-upload.js');

  if (fs.existsSync(scriptPath)) {
    console.log(`✓ Upload script exists: ${scriptPath}`);
    console.log('  Usage: node scripts/testsprite-upload.js <project-id> <results.json>');
    console.log('');
    return true;
  } else {
    console.log(`✗ Upload script not found: ${scriptPath}\n`);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = {
    apiHealth: false,
    integrationStatus: false,
    webhookEndpoint: false,
    sampleFile: false,
    uploadScript: false
  };

  // Test API health first
  results.apiHealth = await testAPIHealth();

  if (!results.apiHealth) {
    console.log('\n⚠ API server is not running. Start it first:\n');
    console.log('  cd "d:\\Claude\\QC management tool\\qc-app\\apps\\api"');
    console.log('  npm start\n');
    console.log('Then run this test again.\n');
    process.exit(1);
  }

  // Run other tests
  results.integrationStatus = await testTestSpriteStatus();
  results.webhookEndpoint = await testWebhookPayload();
  results.sampleFile = testSampleFile();
  results.uploadScript = testUploadScript();

  // Summary
  console.log('Test Summary');
  console.log('============\n');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, result]) => {
    const icon = result ? '✓' : '✗';
    const testName = test.replace(/([A-Z])/g, ' $1').trim();
    console.log(`${icon} ${testName}`);
  });

  console.log(`\nPassed: ${passed}/${total}\n`);

  if (passed === total) {
    console.log('🎉 All tests passed! TestSprite integration is ready.\n');
    console.log('Next steps:');
    console.log('1. Get a project ID from your database:');
    console.log('   SELECT id, name FROM project;');
    console.log('');
    console.log('2. Upload sample results:');
    console.log('   node scripts/testsprite-upload.js <project-id> test-testsprite-sample.json');
    console.log('');
    console.log('3. View results in dashboard:');
    console.log('   http://localhost:3000/test-results');
    console.log('');
  } else {
    console.log('⚠ Some tests failed. Review the output above.\n');
  }

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
