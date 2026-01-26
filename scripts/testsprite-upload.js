#!/usr/bin/env node

/**
 * TestSprite Results Upload Script
 *
 * This script allows you to manually upload TestSprite test results to the QC Management Tool.
 * It can be used in CI/CD pipelines or run locally after TestSprite executes tests.
 *
 * Usage:
 *   node testsprite-upload.js <project-id> <results-file.json>
 *   node testsprite-upload.js --help
 *
 * Environment Variables:
 *   QC_API_URL - QC Management Tool API URL (default: http://localhost:3001)
 *   TESTSPRITE_API_KEY - TestSprite API key (optional)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const API_URL = process.env.QC_API_URL || 'http://localhost:3001';
const TESTSPRITE_API_KEY = process.env.TESTSPRITE_API_KEY;

// Help text
const HELP_TEXT = `
TestSprite Results Upload Script

Upload TestSprite test results to QC Management Tool

USAGE:
  node testsprite-upload.js <project-id> <results-file.json>
  node testsprite-upload.js --help

ARGUMENTS:
  project-id        UUID of the project in QC Management Tool
  results-file.json Path to TestSprite results JSON file

OPTIONS:
  --help            Show this help message
  --url <url>       Override API URL (default: http://localhost:3001)
  --verbose         Show detailed output

ENVIRONMENT:
  QC_API_URL            QC Management Tool API URL
  TESTSPRITE_API_KEY    TestSprite API key (optional)

EXAMPLES:
  # Upload results to project
  node testsprite-upload.js abc123-uuid ./testsprite-results.json

  # Upload with custom API URL
  node testsprite-upload.js abc123 results.json --url https://qc.example.com

EXIT CODES:
  0   Success
  1   Error (invalid arguments, file not found, upload failed)
`;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const config = {
    projectId: args[0],
    resultsFile: args[1],
    apiUrl: API_URL,
    verbose: args.includes('--verbose')
  };

  // Check for --url flag
  const urlIndex = args.indexOf('--url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    config.apiUrl = args[urlIndex + 1];
  }

  return config;
}

// Read and parse results file
function readResultsFile(filePath) {
  try {
    const absolutePath = path.resolve(filePath);
    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to read results file: ${error.message}`);
  }
}

// Make HTTP request
function makeRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(url, options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ statusCode: res.statusCode, body: response });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Upload results to QC Management Tool
async function uploadResults(config, results) {
  const url = `${config.apiUrl}/testsprite/webhook`;

  const payload = {
    project_id: config.projectId,
    results: results,
    metadata: {
      source: 'testsprite-upload-script',
      timestamp: new Date().toISOString()
    }
  };

  if (config.verbose) {
    console.log('\nUploading to:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));
  }

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(url, options, payload);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.body;
    } else {
      throw new Error(`Upload failed with status ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
  } catch (error) {
    throw new Error(`Upload request failed: ${error.message}`);
  }
}

// Main function
async function main() {
  try {
    // Parse arguments
    const config = parseArgs();

    // Validate arguments
    if (!config.projectId || !config.resultsFile) {
      console.error('Error: Missing required arguments');
      console.log('\nUsage: node testsprite-upload.js <project-id> <results-file.json>');
      console.log('Run with --help for more information');
      process.exit(1);
    }

    console.log('TestSprite Results Upload');
    console.log('=========================\n');
    console.log(`Project ID: ${config.projectId}`);
    console.log(`Results File: ${config.resultsFile}`);
    console.log(`API URL: ${config.apiUrl}\n`);

    // Read results file
    console.log('Reading results file...');
    const results = readResultsFile(config.resultsFile);

    if (config.verbose) {
      console.log(`Found ${results.tests?.length || results.suites?.length || 0} test results\n`);
    }

    // Upload results
    console.log('Uploading results...');
    const uploadResponse = await uploadResults(config, results);

    // Display summary
    console.log('\n✓ Upload successful!\n');
    console.log('Summary:');
    console.log(`  Total: ${uploadResponse.summary.total}`);
    console.log(`  Imported: ${uploadResponse.summary.imported}`);
    console.log(`  Updated: ${uploadResponse.summary.updated}`);
    console.log(`  Errors: ${uploadResponse.summary.errors}`);
    console.log(`  Success Rate: ${uploadResponse.summary.success_rate}`);

    if (uploadResponse.details.errors.length > 0) {
      console.log('\nErrors:');
      uploadResponse.details.errors.forEach(error => {
        console.log(`  - ${error.test_case_id}: ${error.error}`);
      });
    }

    console.log(`\nUpload Batch ID: ${uploadResponse.upload_batch_id}`);
    console.log('\nView results at:');
    console.log(`  ${config.apiUrl.replace(/:\d+$/, ':3000')}/test-results?project_id=${config.projectId}\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Run main function
main();
