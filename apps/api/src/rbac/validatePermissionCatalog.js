'use strict';

const fs = require('fs');
const path = require('path');
const { isKnownPermissionKey } = require('../../../shared/rbac/catalog.ts');

const API_SRC_ROOT = path.resolve(__dirname, '..');

function walkJavaScriptFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkJavaScriptFiles(fullPath);
        if (entry.isFile() && entry.name.endsWith('.js')) return [fullPath];
        return [];
    });
}

function extractPermissionReferences(source) {
    const references = [];
    const matcher = /require(?:Any)?Permission\s*\(([^)]*)\)/g;
    let match;

    while ((match = matcher.exec(source)) !== null) {
        const args = match[1];
        const stringMatcher = /['"`]([^'"`]+)['"`]/g;
        let stringMatch;
        while ((stringMatch = stringMatcher.exec(args)) !== null) {
            references.push(stringMatch[1]);
        }
    }

    return references;
}

function validatePermissionCatalog() {
    const unknown = [];

    for (const file of walkJavaScriptFiles(API_SRC_ROOT)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const key of extractPermissionReferences(source)) {
            if (!isKnownPermissionKey(key)) {
                unknown.push({
                    file: path.relative(process.cwd(), file),
                    key,
                });
            }
        }
    }

    if (unknown.length > 0) {
        const details = unknown
            .map(item => `- ${item.key} in ${item.file}`)
            .join('\n');
        throw new Error(`RBAC catalog validation failed. Unknown permission keys referenced by API:\n${details}`);
    }
}

module.exports = {
    extractPermissionReferences,
    validatePermissionCatalog,
};
