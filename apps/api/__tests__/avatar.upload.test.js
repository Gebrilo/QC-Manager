const request = require('supertest');
const path = require('path');
const fs = require('fs');

jest.mock('../src/config/db', () => require('./helpers/mockPool'));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
}));

const { createTestApp } = require('./helpers/testApp');

describe('POST /auth/profile/avatar', () => {
    let app;
    beforeAll(() => { app = createTestApp('/auth/profile', require('../src/routes/avatar')); });

    it('rejects non-image files', async () => {
        const res = await request(app)
            .post('/auth/profile/avatar')
            .attach('avatar', Buffer.from('not an image'), { filename: 'bad.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/image/i);
    });

    it('rejects files over 2MB', async () => {
        const bigBuffer = Buffer.alloc(2.1 * 1024 * 1024);
        const res = await request(app)
            .post('/auth/profile/avatar')
            .attach('avatar', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(400);
    });
});
