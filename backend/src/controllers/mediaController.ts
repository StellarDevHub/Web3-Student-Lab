import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import prisma from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  generateCloudFrontSignedCookies,
  parseCookiesFromRequest,
  verifyCloudFrontSignedCookies,
} from '../services/cloudfrontCookieService.js';
import { ipfsPinningService, isCidV1 } from '../services/ipfsPinningService.js';
import {
  enqueueVideoTranscoding,
  generateMasterPlaylist,
} from '../workers/videoTranscodingWorker.js';
import logger from '../utils/logger.js';
import { ApiResponse } from '../utils/response.js';

/** Upper bound for base64 uploads through the JSON API (course media should use storage uploads). */
const MAX_PIN_BYTES = 10 * 1024 * 1024;
const RESOURCE_TYPES = new Set(['certificate', 'course', 'lesson', 'media']);

export const mediaController = {
  // Pin an asset (base64 payload) to IPFS + Filecoin and record its CID
  pinAsset: asyncHandler(async (req: Request, res: Response) => {
    const { data, name, contentType, resourceType, resourceId, kind } = req.body ?? {};

    if (typeof data !== 'string' || !data) {
      return res.status(400).json(ApiResponse.error('`data` (base64 content) is required'));
    }
    if (typeof name !== 'string' || typeof contentType !== 'string' || typeof kind !== 'string') {
      return res.status(400).json(ApiResponse.error('`name`, `contentType` and `kind` are required'));
    }
    if (!RESOURCE_TYPES.has(resourceType) || typeof resourceId !== 'string' || !resourceId) {
      return res.status(400).json(ApiResponse.error('Invalid `resourceType` or `resourceId`'));
    }

    const content = Buffer.from(data, 'base64');
    if (content.length === 0 || content.length > MAX_PIN_BYTES) {
      return res.status(413).json(ApiResponse.error(`Content must be between 1 byte and ${MAX_PIN_BYTES} bytes`));
    }

    try {
      const record = await ipfsPinningService.pinAsset({ content, name, contentType, resourceType, resourceId, kind });
      return res.status(201).json(ApiResponse.success('Asset pinned', record));
    } catch (error) {
      logger.error('Media pinning failed', {
        resourceType,
        resourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json(ApiResponse.error('All IPFS pinning providers failed'));
    }
  }),

  // Resolve a CID to its stored records and gateway URLs (optionally redirect to the CDN)
  getByCid: asyncHandler(async (req: Request, res: Response) => {
    const cid = String(req.params.cid);
    if (!isCidV1(cid)) {
      return res.status(400).json(ApiResponse.error('Malformed CID: a CIDv1 (base32) is required'));
    }

    const records = await ipfsPinningService.findByCid(cid);
    if (records.length === 0) {
      return res.status(404).json(ApiResponse.error('CID is not tracked by this service'));
    }

    if (req.query.redirect === 'true') {
      return res.redirect(302, ipfsPinningService.cdnUrl(cid));
    }

    return res.status(200).json(
      ApiResponse.success('Pinned asset retrieved', {
        cid,
        cdnUrl: ipfsPinningService.cdnUrl(cid),
        gateways: ipfsPinningService.gatewayUrls(cid),
        records,
      }),
    );
  }),

  // Check gateway accessibility (CDN first, then secondary gateways) and persist the result
  verifyCid: asyncHandler(async (req: Request, res: Response) => {
    const cid = String(req.params.cid);
    if (!isCidV1(cid)) {
      return res.status(400).json(ApiResponse.error('Malformed CID: a CIDv1 (base32) is required'));
    }

    const [record] = await ipfsPinningService.findByCid(cid);
    const check = record
      ? await ipfsPinningService.reverify(record)
      : await ipfsPinningService.verifyGatewayAccessibility(cid);

    return res.status(check.accessible ? 200 : 503).json(ApiResponse.success('Gateway accessibility checked', check));
  }),

  // List the immutable CIDs pinned for a certificate
  getCertificateAssets: asyncHandler(async (req: Request, res: Response) => {
    const certificateId = String(req.params.certificateId);
    const records = await ipfsPinningService.findByResource('certificate', certificateId);
    if (records.length === 0) {
      return res.status(404).json(ApiResponse.error('No pinned assets for this certificate'));
    }
    return res.status(200).json(ApiResponse.success('Certificate assets retrieved', records));
  }),

  // Issue CloudFront signed cookies validated against student enrollment for video playback (#1844)
  createStreamSession: asyncHandler(async (req: Request, res: Response) => {
    const courseId = String(req.params.courseId ?? '');
    const videoId = String(req.params.videoId ?? '');
    const studentId = (req as any).user?.id;

    if (!courseId || !videoId) {
      return res.status(400).json(ApiResponse.error('courseId and videoId are required'));
    }

    if (!studentId) {
      return res.status(401).json(ApiResponse.error('Authentication required to access course videos'));
    }

    // Validate enrollment against student records
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    if (!enrollment || enrollment.status !== 'active') {
      logger.warn('[MediaController] Unauthorized video access attempt by unenrolled student', {
        studentId,
        courseId,
        videoId,
      });
      return res.status(403).json(ApiResponse.error('Forbidden: Student is not enrolled in this course'));
    }

    const cdnDomain = process.env.CLOUDFRONT_DOMAIN || 'cdn.web3studentlab.org';
    const resourcePattern = `*/media/courses/${courseId}/videos/${videoId}/*`;
    const expiresInSeconds = 24 * 60 * 60; // 24 hours

    const cookies = generateCloudFrontSignedCookies({
      resourceUrl: resourcePattern,
      expiresInSeconds,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const cookiePath = `/media/courses/${courseId}/videos/${videoId}`;

    // Set signed cookies on response
    res.cookie('CloudFront-Key-Pair-Id', cookies['CloudFront-Key-Pair-Id'], {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: cookiePath,
      maxAge: expiresInSeconds * 1000,
    });

    res.cookie('CloudFront-Policy', cookies['CloudFront-Policy'], {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: cookiePath,
      maxAge: expiresInSeconds * 1000,
    });

    res.cookie('CloudFront-Signature', cookies['CloudFront-Signature'], {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: cookiePath,
      maxAge: expiresInSeconds * 1000,
    });

    return res.status(200).json(
      ApiResponse.success('CloudFront signed cookies issued for stream playback', {
        courseId,
        videoId,
        streamUrl: `/media/courses/${courseId}/videos/${videoId}/hls/master.m3u8`,
        cdnUrl: `https://${cdnDomain}/courses/${courseId}/videos/${videoId}/master.m3u8`,
        cookies,
        expiresIn: expiresInSeconds,
      })
    );
  }),

  // Serve HLS stream chunks and playlists protected by CloudFront signed cookies & enrollment (#1844)
  getHlsSegmentOrManifest: asyncHandler(async (req: Request, res: Response) => {
    const courseId = String(req.params.courseId ?? '');
    const videoId = String(req.params.videoId ?? '');
    const file = String(req.params.file ?? '');

    if (!courseId || !videoId || !file) {
      return res.status(400).json(ApiResponse.error('courseId, videoId, and file are required'));
    }

    // 1. Verify CloudFront signed cookies
    const cookies = parseCookiesFromRequest(req.headers.cookie, req.cookies);
    const verification = verifyCloudFrontSignedCookies({
      cookies,
      requestUrl: req.originalUrl || req.url,
    });

    let isAuthorized = verification.valid;

    // 2. Fallback: check authenticated student enrollment if cookies were not provided
    if (!isAuthorized) {
      const studentId = (req as any).user?.id;
      if (studentId) {
        const enrollment = await prisma.enrollment.findUnique({
          where: {
            studentId_courseId: {
              studentId,
              courseId,
            },
          },
        });
        if (enrollment && enrollment.status === 'active') {
          isAuthorized = true;
        }
      }
    }

    // Unenrolled or unauthorized users receive HTTP 403 Forbidden
    if (!isAuthorized) {
      logger.warn('[MediaController] Denied access to HLS video segment for unauthorized user', {
        courseId,
        videoId,
        file,
        reason: verification.reason || 'unauthorized',
      });
      return res
        .status(403)
        .json(ApiResponse.error('Forbidden: Enrollment or valid CloudFront signed cookie required to access video segments'));
    }

    // 3. Serve playlist or segment chunk
    const storageDir = process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'videos');
    const filePath = path.join(storageDir, courseId, videoId, file);

    const isPlaylist = file.endsWith('.m3u8');
    const isSegment = file.endsWith('.ts');

    const contentType = isPlaylist
      ? 'application/vnd.apple.mpegurl'
      : isSegment
      ? 'video/mp2t'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', isPlaylist ? 'no-cache' : 'public, max-age=86400');

    if (fs.existsSync(filePath)) {
      return fs.createReadStream(filePath).pipe(res);
    }

    // If served in dynamic mode or mock file is requested
    if (file === 'master.m3u8') {
      const manifest = generateMasterPlaylist();
      return res.status(200).send(manifest);
    }

    if (isPlaylist) {
      const variantName = file.replace('.m3u8', '');
      const variantManifest = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\n${variantName}_000.ts\n#EXT-X-ENDLIST\n`;
      return res.status(200).send(variantManifest);
    }

    if (isSegment) {
      // Return dummy MPEG-TS segment chunk
      return res.status(200).send(Buffer.from([0x47, 0x40, 0x00, 0x10]));
    }

    return res.status(404).json(ApiResponse.error('Video file not found'));
  }),

  // Enqueue a video transcoding job into the BullMQ pipeline (#1844)
  enqueueTranscode: asyncHandler(async (req: Request, res: Response) => {
    const { videoId, courseId, lessonId, inputPath, outputDir } = req.body ?? {};
    const userId = (req as any).user?.id;

    if (!videoId || !courseId || !inputPath) {
      return res.status(400).json(ApiResponse.error('videoId, courseId, and inputPath are required'));
    }

    const defaultOutputDir =
      outputDir ||
      path.join(process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'videos'), courseId, videoId);

    const job = await enqueueVideoTranscoding({
      videoId,
      courseId,
      lessonId,
      inputPath,
      outputDir: defaultOutputDir,
      userId,
    });

    return res.status(202).json(
      ApiResponse.success('Video transcoding job enqueued', {
        jobId: job.id,
        videoId,
        courseId,
        outputDir: defaultOutputDir,
      })
    );
  }),
};
