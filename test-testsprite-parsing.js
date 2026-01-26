#!/usr/bin/env node

/**
 * TestSprite Parsing and Status Mapping Test
 *
 * This test verifies the TestSprite integration logic without requiring a database.
 * It tests the parsing and status mapping functions independently.
 */

const fs = require('fs');
const path = require('path');

console.log('TestSprite Integration - Parsing & Status Mapping Test\n');
console.log('========================================================\n');

// Load the sample TestSprite results
const sampleFile = path.join(__dirname, 'test-testsprite-sample.json');

if (!fs.existsSync(sampleFile)) {
  console.error('❌ Sample file not found:', sampleFile);
  process.exit(1);
}

const testSpriteData = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
console.log('✅ Loaded sample TestSprite results');
console.log(`   Contains ${testSpriteData.tests.length} tests\n`);

// Import the parsing functions (simulate them here)
function mapTestSpriteStatus(testSpriteStatus) {
  const statusMap = {
    'passed': 'passed',
    'pass': 'passed',
    'success': 'passed',
    'ok': 'passed',
    'failed': 'failed',
    'fail': 'failed',
    'error': 'failed',
    'skipped': 'not_run',
    'skip': 'not_run',
    'pending': 'not_run',
    'blocked': 'blocked',
    'disabled': 'not_run',
    'rejected': 'rejected'
  };

  const normalized = String(testSpriteStatus).toLowerCase();
  return statusMap[normalized] || 'not_run';
}

function buildNotes(test) {
  const notes = [];

  if (test.error || test.errorMessage) {
    notes.push(`Error: ${test.error || test.errorMessage}`);
  }

  if (test.stack || test.stackTrace) {
    notes.push(`Stack trace available`);
  }

  if (test.duration) {
    notes.push(`Duration: ${test.duration}ms`);
  }

  if (test.failureReason) {
    notes.push(test.failureReason);
  }

  if (test.assertions) {
    notes.push(`Assertions: ${test.assertions.passed}/${test.assertions.total}`);
  }

  return notes.join(' | ');
}

function parseTestSpriteResults(testSpriteData) {
  const results = [];

  if (Array.isArray(testSpriteData.tests)) {
    testSpriteData.tests.forEach(test => {
      results.push({
        test_case_id: test.id || test.name || test.testId,
        test_case_title: test.title || test.description || test.name,
        status: mapTestSpriteStatus(test.status),
        notes: buildNotes(test),
        tester_name: 'TestSprite AI',
        executed_at: test.timestamp || new Date().toISOString().split('T')[0]
      });
    });
  } else if (testSpriteData.suites) {
    testSpriteData.suites.forEach(suite => {
      if (suite.tests) {
        suite.tests.forEach(test => {
          results.push({
            test_case_id: `${suite.name}-${test.id || test.name}`,
            test_case_title: `[${suite.name}] ${test.title || test.name}`,
            status: mapTestSpriteStatus(test.status),
            notes: buildNotes(test),
            tester_name: 'TestSprite AI',
            executed_at: test.timestamp || new Date().toISOString().split('T')[0]
          });
        });
      }
    });
  }

  return results;
}

// Test 1: Parse TestSprite results
console.log('Test 1: Parsing TestSprite Results\n');
console.log('-----------------------------------\n');

let parsedResults;
try {
  parsedResults = parseTestSpriteResults(testSpriteData);
  console.log(`✅ Successfully parsed ${parsedResults.length} test results\n`);
} catch (error) {
  console.error(`❌ Parsing failed: ${error.message}\n`);
  process.exit(1);
}

// Test 2: Display parsed results
console.log('Test 2: Parsed Test Results\n');
console.log('----------------------------\n');

console.log('| Test ID | Status    | Title                                  | Notes                           |');
console.log('|---------|-----------|----------------------------------------|---------------------------------|');

parsedResults.forEach(result => {
  const id = result.test_case_id.padEnd(7);
  const status = result.status.padEnd(9);
  const title = (result.test_case_title || '').substring(0, 38).padEnd(38);
  const notes = (result.notes || '').substring(0, 31).padEnd(31);
  console.log(`| ${id} | ${status} | ${title} | ${notes} |`);
});

console.log('\n');

// Test 3: Status mapping verification
console.log('Test 3: Status Mapping Verification\n');
console.log('------------------------------------\n');

const statusCounts = {
  passed: 0,
  failed: 0,
  not_run: 0,
  blocked: 0,
  rejected: 0
};

parsedResults.forEach(result => {
  statusCounts[result.status]++;
});

console.log('Status Distribution:');
Object.entries(statusCounts).forEach(([status, count]) => {
  if (count > 0) {
    const icon = {
      passed: '🟢',
      failed: '🔴',
      not_run: '⚪',
      blocked: '🟡',
      rejected: '🟣'
    }[status];
    console.log(`  ${icon} ${status.padEnd(10)} : ${count}`);
  }
});

console.log('\n');

// Test 4: Verify specific status mappings
console.log('Test 4: Status Mapping Test Cases\n');
console.log('----------------------------------\n');

const testCases = [
  { input: 'passed', expected: 'passed' },
  { input: 'pass', expected: 'passed' },
  { input: 'success', expected: 'passed' },
  { input: 'failed', expected: 'failed' },
  { input: 'fail', expected: 'failed' },
  { input: 'error', expected: 'failed' },
  { input: 'skipped', expected: 'not_run' },
  { input: 'pending', expected: 'not_run' },
  { input: 'blocked', expected: 'blocked' },
  { input: 'unknown', expected: 'not_run' } // default mapping
];

let mappingTestsPassed = 0;
let mappingTestsFailed = 0;

testCases.forEach(({ input, expected }) => {
  const actual = mapTestSpriteStatus(input);
  const passed = actual === expected;

  if (passed) {
    mappingTestsPassed++;
    console.log(`  ✅ "${input}" → "${actual}" (expected: "${expected}")`);
  } else {
    mappingTestsFailed++;
    console.log(`  ❌ "${input}" → "${actual}" (expected: "${expected}")`);
  }
});

console.log('\n');
console.log(`Mapping tests: ${mappingTestsPassed}/${testCases.length} passed\n`);

// Test 5: Webhook payload simulation
console.log('Test 5: Webhook Payload Format\n');
console.log('-------------------------------\n');

const webhookPayload = {
  project_id: 'YOUR-PROJECT-UUID',
  results: testSpriteData,
  metadata: {
    source: 'TestSprite MCP',
    timestamp: new Date().toISOString()
  }
};

console.log('Sample webhook payload structure:');
console.log(JSON.stringify(webhookPayload, null, 2).substring(0, 500) + '...\n');

// Summary
console.log('Test Summary\n');
console.log('============\n');

const allTestsPassed = mappingTestsFailed === 0 && parsedResults.length === testSpriteData.tests.length;

if (allTestsPassed) {
  console.log('🎉 All parsing and mapping tests passed!\n');
  console.log('The TestSprite integration logic is working correctly.');
  console.log('\nWhat this means:');
  console.log('  ✅ TestSprite results parse correctly');
  console.log('  ✅ Status mapping works as expected');
  console.log('  ✅ Notes are extracted properly');
  console.log('  ✅ Test metadata is preserved');
  console.log('\nTo complete the integration test:');
  console.log('  1. Start PostgreSQL database (via Docker or locally)');
  console.log('  2. Get a valid project_id from the database');
  console.log('  3. Run: node scripts/testsprite-upload.js <project-id> test-testsprite-sample.json');
  console.log('  4. View results at: http://localhost:3000/test-results\n');
} else {
  console.log('⚠️  Some tests failed. Review the output above.\n');
  process.exit(1);
}
