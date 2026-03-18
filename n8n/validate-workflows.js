#!/usr/bin/env node
/**
 * T036: Workflow JSON Validation Script
 *
 * Validates all n8n workflow JSON files for structural correctness:
 * - Required fields: name, nodes, connections
 * - Node required props: name, type, typeVersion, position
 * - Connection references point to existing node names
 * - Credential naming consistency
 * - Duplicate webhook path detection
 * - Stub workflow warnings (webhook → no-op)
 *
 * Usage: node n8n/validate-workflows.js
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW_DIRS = [
    path.join(__dirname),
    path.join(__dirname, 'workflows')
];

const EXPECTED_CREDENTIAL_NAME = 'QC Supabase Postgres';

let totalErrors = 0;
let totalWarnings = 0;

function log(type, file, message) {
    if (type === 'ERROR') {
        totalErrors++;
        console.error(`  ❌ ERROR [${file}]: ${message}`);
    } else if (type === 'WARN') {
        totalWarnings++;
        console.warn(`  ⚠️  WARN [${file}]: ${message}`);
    } else {
        console.log(`  ✅ OK [${file}]: ${message}`);
    }
}

function validateWorkflow(filePath) {
    const fileName = path.basename(filePath);
    let workflow;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        workflow = JSON.parse(content);
    } catch (e) {
        log('ERROR', fileName, `Failed to parse JSON: ${e.message}`);
        return;
    }

    // Check required top-level fields
    if (!workflow.name) {
        log('ERROR', fileName, 'Missing required field: name');
    }
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
        log('ERROR', fileName, 'Missing or invalid field: nodes (must be array)');
        return;
    }
    if (!workflow.connections || typeof workflow.connections !== 'object') {
        log('ERROR', fileName, 'Missing or invalid field: connections (must be object)');
    }

    // Collect node names for connection validation
    const nodeNames = new Set();
    const webhookPaths = [];
    const credentialNames = new Set();
    let hasNoOpOnly = true;

    // Validate each node
    for (const node of workflow.nodes) {
        if (!node.name) {
            log('ERROR', fileName, 'Node missing required field: name');
            continue;
        }
        nodeNames.add(node.name);

        if (!node.type) {
            log('ERROR', fileName, `Node "${node.name}": missing required field: type`);
        }
        if (node.typeVersion === undefined) {
            log('WARN', fileName, `Node "${node.name}": missing typeVersion`);
        }
        if (!node.position) {
            log('WARN', fileName, `Node "${node.name}": missing position`);
        }

        // Track webhook paths
        if (node.type && node.type.includes('webhook') && node.parameters && node.parameters.path) {
            webhookPaths.push({
                file: fileName,
                path: node.parameters.path,
                nodeName: node.name
            });
        }

        // Track credential names
        if (node.credentials) {
            for (const [credType, credInfo] of Object.entries(node.credentials)) {
                if (credInfo.name) {
                    credentialNames.add(credInfo.name);
                    if (credType === 'postgres' && credInfo.name !== EXPECTED_CREDENTIAL_NAME) {
                        log('WARN', fileName, `Node "${node.name}": Postgres credential "${credInfo.name}" differs from expected "${EXPECTED_CREDENTIAL_NAME}"`);
                    }
                }
            }
        }

        // Check for non-trivial nodes
        if (node.type && !node.type.includes('noOp') && !node.type.includes('webhook')) {
            hasNoOpOnly = false;
        }
    }

    // Validate connections reference existing nodes
    if (workflow.connections) {
        for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
            if (!nodeNames.has(sourceName)) {
                log('ERROR', fileName, `Connection source "${sourceName}" not found in nodes`);
            }
            if (outputs && outputs.main) {
                for (const outputGroup of outputs.main) {
                    if (Array.isArray(outputGroup)) {
                        for (const conn of outputGroup) {
                            if (conn.node && !nodeNames.has(conn.node)) {
                                log('ERROR', fileName, `Connection target "${conn.node}" not found in nodes`);
                            }
                        }
                    }
                }
            }
        }
    }

    // Warn about stub workflows
    if (hasNoOpOnly && workflow.nodes.length <= 2) {
        log('WARN', fileName, 'Stub workflow detected (webhook → no-op). Consider adding functionality or documenting as placeholder.');
    }

    return { webhookPaths, credentialNames };
}

// ---- Main ----
console.log('\n🔍 N8N Workflow Validation\n');
console.log('='.repeat(60));

const allWebhookPaths = [];
const allCredentialNames = new Set();

for (const dir of WORKFLOW_DIRS) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    console.log(`\n📁 ${dir} (${files.length} workflows)\n`);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const result = validateWorkflow(filePath);
        if (result) {
            allWebhookPaths.push(...result.webhookPaths);
            result.credentialNames.forEach(n => allCredentialNames.add(n));
        }
    }
}

// Check for duplicate webhook paths
console.log('\n' + '='.repeat(60));
console.log('\n🔗 Webhook Path Analysis:\n');

const pathMap = {};
for (const wp of allWebhookPaths) {
    if (!pathMap[wp.path]) pathMap[wp.path] = [];
    pathMap[wp.path].push(wp);
}

for (const [webhookPath, entries] of Object.entries(pathMap)) {
    if (entries.length > 1) {
        const files = entries.map(e => e.file).join(', ');
        console.warn(`  ⚠️  DUPLICATE PATH "/webhook/${webhookPath}" used in: ${files}`);
        totalWarnings++;
    } else {
        console.log(`  ✅ /webhook/${webhookPath} → ${entries[0].file}`);
    }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(`\n📊 Summary: ${totalErrors} errors, ${totalWarnings} warnings`);

if (allCredentialNames.size > 0) {
    console.log(`\n🔑 Credential names in use: ${[...allCredentialNames].join(', ')}`);
}

if (totalErrors > 0) {
    console.error('\n❌ Validation FAILED — fix errors before deploying workflows.\n');
    process.exit(1);
} else if (totalWarnings > 0) {
    console.warn('\n⚠️  Validation PASSED with warnings.\n');
    process.exit(0);
} else {
    console.log('\n✅ All workflows passed validation.\n');
    process.exit(0);
}
