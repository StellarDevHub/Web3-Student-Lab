import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock Authentication Middleware
// ---------------------------------------------------------------------------
let mockUser: { id: string; email: string; role: string } | null = {
  id: 'student-123',
  email: 'student@example.com',
  role: 'student',
};

jest.mock('../src/middleware/auth.js', () => ({
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (!mockUser) {
      return res.status(401).json({ status: 'error', message: 'Access token required' });
    }
    (req as any).user = mockUser;
    next();
  },
  optionalAuthenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (mockUser) {
      (req as any).user = mockUser;
    }
    next();
  },
}));

// ---------------------------------------------------------------------------
// Mock Prisma Database
// ---------------------------------------------------------------------------
const mockFindUniqueEnrollment = jest.fn();

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    enrollment: {
      findUnique: (...args: unknown[]) => mockFindUniqueEnrollment(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock Logger
// ---------------------------------------------------------------------------
jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock Transcoding Worker Enqueue
// ---------------------------------------------------------------------------
const mockEnqueueVideoTranscoding = jest.fn(async (data: any) => ({
  id: 'job-transcode-456',
  data,
}));

jest.mock('../src/workers/videoTranscodingWorker.js', () => {
  const actual = jest.requireActual('../src/workers/videoTranscodingWorker.js') as any;
  return {
    ...actual,
    enqueueVideoTranscoding: (...args: any[]) => mockEnqueueVideoTranscoding(...args),
  };
});

import mediaRouter from '../src/routes/media.routes.js';
import { generateCloudFrontSignedCookies } from '../src/services/cloudfrontCookieService.js';

describe('Media Routes & Video Transcoding Pipeline (#1844 / BE-097)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'student-123', email: 'student@example.com', role: 'student' };

    app = express();
    app.use(express.json());
    app.use('/media', mediaRouter);
  });

  describe('POST & GET /media/courses/:courseId/videos/:videoId/session', () => {
    it('returns 401 when the user is not authenticated', async () => {
      mockUser = null;
      const res = await request(app).post('/media/courses/c1/videos/v1/session');
      expect(res.status).toBe(401);
    });

    it('returns HTTP 403 when the student is not enrolled in the course', async () => {
      mockFindUniqueEnrollment.mockResolvedValue(null);

      const res = await request(app).post('/media/courses/course-solana/videos/lecture-1/session');

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Forbidden: Student is not enrolled/i);
      expect(mockFindUniqueEnrollment).toHaveBeenCalledWith({
        where: {
          studentId_courseId: {
            studentId: 'student-123',
            courseId: 'course-solana',
          },
        },
      });
    });

    it('returns HTTP 403 when the enrollment status is inactive', async () => {
      mockFindUniqueEnrollment.mockResolvedValue({
        id: 'e1',
        studentId: 'student-123',
        courseId: 'course-stellar',
        status: 'cancelled',
      });

      const res = await request(app).post('/media/courses/course-stellar/videos/lecture-1/session');
      expect(res.status).toBe(403);
    });

    it('issues CloudFront signed cookies and returns stream URL for enrolled student', async () => {
      mockFindUniqueEnrollment.mockResolvedValue({
        id: 'e1',
        studentId: 'student-123',
        courseId: 'course-stellar',
        status: 'active',
      });

      const res = await request(app).post('/media/courses/course-stellar/videos/lecture-1/session');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.streamUrl).toBe('/media/courses/course-stellar/videos/lecture-1/hls/master.m3u8');
      expect(res.body.data.cookies).toBeDefined();
      expect(res.body.data.cookies['CloudFront-Key-Pair-Id']).toBeDefined();
      expect(res.body.data.cookies['CloudFront-Policy']).toBeDefined();
      expect(res.body.data.cookies['CloudFront-Signature']).toBeDefined();

      // Verify Set-Cookie headers
      const setCookieHeaders = res.headers['set-cookie'] as string[] | undefined;
      expect(setCookieHeaders).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeaders) ? setCookieHeaders.join(';') : String(setCookieHeaders);
      expect(cookieStr).toContain('CloudFront-Key-Pair-Id=');
      expect(cookieStr).toContain('CloudFront-Policy=');
      expect(cookieStr).toContain('CloudFront-Signature=');
    });

    it('also supports GET method for streaming session initialization', async () => {
      mockFindUniqueEnrollment.mockResolvedValue({
        id: 'e1',
        studentId: 'student-123',
        courseId: 'course-stellar',
        status: 'active',
      });

      const res = await request(app).get('/media/courses/course-stellar/videos/lecture-1/session');
      expect(res.status).toBe(200);
      expect(res.body.data.streamUrl).toBeDefined();
    });
  });

  describe('GET /media/courses/:courseId/videos/:videoId/hls/:file (Segment Security)', () => {
    it('returns HTTP 403 when an unenrolled user without signed cookies requests HLS manifest', async () => {
      mockUser = null;
      mockFindUniqueEnrollment.mockResolvedValue(null);

      const res = await request(app).get('/media/courses/c1/videos/v1/hls/master.m3u8');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Forbidden/i);
    });

    it('returns HTTP 403 when an unenrolled user without signed cookies requests a video chunk (.ts)', async () => {
      mockUser = null;
      mockFindUniqueEnrollment.mockResolvedValue(null);

      const res = await request(app).get('/media/courses/c1/videos/v1/hls/1080p_000.ts');
      expect(res.status).toBe(403);
    });

    it('serves master.m3u8 when user provides valid CloudFront signed cookies', async () => {
      mockUser = null; // Unauthenticated via JWT, but has signed cookies
      const cookies = generateCloudFrontSignedCookies({
        resourceUrl: '*/media/courses/c1/videos/v1/*',
        expiresInSeconds: 3600,
      });

      const cookieHeader = [
        `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}`,
        `CloudFront-Policy=${cookies['CloudFront-Policy']}`,
        `CloudFront-Signature=${cookies['CloudFront-Signature']}`,
      ].join('; ');

      const res = await request(app)
        .get('/media/courses/c1/videos/v1/hls/master.m3u8')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(res.text).toContain('#EXTM3U');
      expect(res.text).toContain('1080p.m3u8');
      expect(res.text).toContain('720p.m3u8');
      expect(res.text).toContain('480p.m3u8');
    });

    it('serves variant playlist (720p.m3u8) when user provides valid CloudFront signed cookies', async () => {
      const cookies = generateCloudFrontSignedCookies({
        resourceUrl: '*/media/courses/c1/videos/v1/*',
        expiresInSeconds: 3600,
      });

      const cookieHeader = [
        `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}`,
        `CloudFront-Policy=${cookies['CloudFront-Policy']}`,
        `CloudFront-Signature=${cookies['CloudFront-Signature']}`,
      ].join('; ');

      const res = await request(app)
        .get('/media/courses/c1/videos/v1/hls/720p.m3u8')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(res.text).toContain('720p_000.ts');
    });

    it('serves video segment (.ts) chunk when user provides valid CloudFront signed cookies', async () => {
      const cookies = generateCloudFrontSignedCookies({
        resourceUrl: '*/media/courses/c1/videos/v1/*',
        expiresInSeconds: 3600,
      });

      const cookieHeader = [
        `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}`,
        `CloudFront-Policy=${cookies['CloudFront-Policy']}`,
        `CloudFront-Signature=${cookies['CloudFront-Signature']}`,
      ].join('; ');

      const res = await request(app)
        .get('/media/courses/c1/videos/v1/hls/1080p_001.ts')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('video/mp2t');
    });

    it('returns HTTP 403 when signed cookies are expired and user is not enrolled', async () => {
      const expiredCookies = generateCloudFrontSignedCookies({
        resourceUrl: '*/media/courses/c1/videos/v1/*',
        expiresInSeconds: -300,
      });

      const cookieHeader = [
        `CloudFront-Key-Pair-Id=${expiredCookies['CloudFront-Key-Pair-Id']}`,
        `CloudFront-Policy=${expiredCookies['CloudFront-Policy']}`,
        `CloudFront-Signature=${expiredCookies['CloudFront-Signature']}`,
      ].join('; ');

      mockUser = null;
      mockFindUniqueEnrollment.mockResolvedValue(null);

      const res = await request(app)
        .get('/media/courses/c1/videos/v1/hls/master.m3u8')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(403);
    });

    it('allows access to enrolled authenticated student even if cookie is not yet set', async () => {
      mockUser = { id: 'student-enrolled', email: 'enrolled@test.com', role: 'student' };
      mockFindUniqueEnrollment.mockResolvedValue({
        id: 'e-active',
        studentId: 'student-enrolled',
        courseId: 'c1',
        status: 'active',
      });

      const res = await request(app).get('/media/courses/c1/videos/v1/hls/master.m3u8');
      expect(res.status).toBe(200);
      expect(res.text).toContain('#EXTM3U');
    });
  });

  describe('POST /media/transcode (Enqueue Pipeline)', () => {
    it('returns 401 when unauthenticated', async () => {
      mockUser = null;
      const res = await request(app)
        .post('/media/transcode')
        .send({ videoId: 'v1', courseId: 'c1', inputPath: '/tmp/video.mp4' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when missing required parameters', async () => {
      const res = await request(app)
        .post('/media/transcode')
        .send({ videoId: 'v1' });

      expect(res.status).toBe(400);
    });

    it('enqueues video transcoding job and returns 202 Accepted', async () => {
      const res = await request(app)
        .post('/media/transcode')
        .send({
          videoId: 'vid-course-101',
          courseId: 'course-stellar-101',
          inputPath: '/uploads/lecture-intro.mp4',
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('success');
      expect(res.body.data.jobId).toBe('job-transcode-456');
      expect(mockEnqueueVideoTranscoding).toHaveBeenCalledWith(
        expect.objectContaining({
          videoId: 'vid-course-101',
          courseId: 'course-stellar-101',
          inputPath: '/uploads/lecture-intro.mp4',
          userId: 'student-123',
        })
      );
    });
  });
});
