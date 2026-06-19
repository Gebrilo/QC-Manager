export type LinkRelationshipDirection = 'from' | 'to';

export interface LinkRelationshipOption {
    value: string;
    label: string;
}

export const LINK_RELATIONSHIP_OPTIONS_BY_PAIR = {
    taskTestCases: [
        { value: 'covers', label: 'covers' },
        { value: 'verified by', label: 'verified by' },
    ],
    bugTestCases: [
        { value: 'reveals', label: 'reveals' },
        { value: 'found in', label: 'found in' },
    ],
    bugTasks: [
        { value: 'blocks', label: 'blocks' },
        { value: 'is blocked by', label: 'is blocked by' },
        { value: 'relates to', label: 'relates to' },
    ],
    bugUserStories: [
        { value: 'affects', label: 'affects' },
        { value: 'relates to', label: 'relates to' },
    ],
    testCaseUserStories: [
        { value: 'verifies', label: 'verifies' },
        { value: 'relates to', label: 'relates to' },
    ],
    storySuites: [
        { value: 'validated by', label: 'validated by' },
        { value: 'relates to', label: 'relates to' },
    ],
    storyRuns: [
        { value: 'validated by', label: 'validated by' },
        { value: 'relates to', label: 'relates to' },
    ],
    taskRuns: [
        { value: 'exercised by', label: 'exercised by' },
        { value: 'relates to', label: 'relates to' },
    ],
    bugRuns: [
        { value: 'found in', label: 'found in' },
        { value: 'relates to', label: 'relates to' },
    ],
} as const satisfies Record<string, LinkRelationshipOption[]>;

const INVERSE_RELATIONSHIP_LABELS: Record<string, string> = {
    covers: 'covered by',
    'covered by': 'covers',
    verifies: 'verified by',
    'verified by': 'verifies',
    reveals: 'revealed by',
    'revealed by': 'reveals',
    'found in': 'finds',
    finds: 'found in',
    'validated by': 'validates',
    validates: 'validated by',
    'exercised by': 'exercises',
    exercises: 'exercised by',
    blocks: 'is blocked by',
    'is blocked by': 'blocks',
    affects: 'affected by',
    'affected by': 'affects',
    'relates to': 'relates to',
};

export function getInverseRelationshipLabel(relationshipType: string) {
    return INVERSE_RELATIONSHIP_LABELS[relationshipType] || relationshipType;
}

export function getDirectionalRelationshipLabel(relationshipType: string, direction: LinkRelationshipDirection = 'from') {
    return direction === 'to' ? getInverseRelationshipLabel(relationshipType) : relationshipType;
}
