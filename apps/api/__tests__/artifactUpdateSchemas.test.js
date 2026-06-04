const { updateTaskSchema } = require('../src/schemas/task');
const { updateBugSchema } = require('../src/schemas/bug');
const { updateUserStorySchema } = require('../src/schemas/userStory');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('artifact update schemas', () => {
    test('task updates preserve project_id', () => {
        expect(updateTaskSchema.parse({ project_id: PROJECT_ID, task_name: 'Retarget task' }))
            .toMatchObject({ project_id: PROJECT_ID, task_name: 'Retarget task' });
    });

    test('bug updates preserve project_id', () => {
        expect(updateBugSchema.parse({ project_id: PROJECT_ID, title: 'Retarget bug' }))
            .toMatchObject({ project_id: PROJECT_ID, title: 'Retarget bug' });
    });

    test('user story updates preserve project_id', () => {
        expect(updateUserStorySchema.parse({ project_id: PROJECT_ID, title: 'Retarget story' }))
            .toMatchObject({ project_id: PROJECT_ID, title: 'Retarget story' });
    });
});
