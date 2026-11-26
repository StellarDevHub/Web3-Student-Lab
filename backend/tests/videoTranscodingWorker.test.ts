import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { UnrecoverableError } from 'bullmq';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  HLS_PROFILES,
  buildFfmpegArgsForProfile,
  generateMasterPlaylist,
  assertValidTranscodingJob,
  transcodeVideoToHls,
  createVideoTranscodingProcessor,
  enqueueVideoTranscoding,
  startVideoTranscodingWorker,
  stopVideoTranscodingWorker,
  type VideoTranscodingJobData,
} from '../src/workers/videoTranscodingWorker.js';

describe('videoTranscodingWorker (BE-097 / #1844)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hls-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    await stopVideoTranscodingWorker();
  });

  describe('HLS Profiles & Command Generation', () => {
    it('defines 1080p, 720p, and 480p adaptive multi-bitrate profiles', () => {
      expect(HLS_PROFILES).toHaveLength(3);
      const profileNames = HLS_PROFILES.map((p) => p.name);
      expect(profileNames).toEqual(['1080p', '720p', '480p']);

      const [p1080, p720, p480] = HLS_PROFILES;
      expect(p1080).toMatchObject({ width: 1920, height: 1080, bandwidth: 5000000 });
      expect(p720).toMatchObject({ width: 1280, height: 720, bandwidth: 2800000 });
      expect(p480).toMatchObject({ width: 854, height: 480, bandwidth: 1200000 });
    });

    it('generates a valid HLS master playlist with all variant streams', () => {
      const masterContent = generateMasterPlaylist();
      expect(masterContent).toContain('#EXTM3U');
      expect(masterContent).toContain('#EXT-X-VERSION:3');
      expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n1080p.m3u8');
      expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n720p.m3u8');
      expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=854x480\n480p.m3u8');
    });

    it('builds FFmpeg command arguments with scaling, HLS chunking, and bitrates', () => {
      const profile = HLS_PROFILES[0]; // 1080p
      const args = buildFfmpegArgsForProfile('/tmp/input.mp4', tempDir, profile, 6);

      expect(args).toContain('-i');
      expect(args).toContain('/tmp/input.mp4');
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).toContain('-b:v');
      expect(args).toContain('5000k');
      expect(args).toContain('-hls_time');
      expect(args).toContain('6');
      expect(args).toContain('-f');
      expect(args).toContain('hls');
      expect(args[args.length - 1]).toBe(path.join(tempDir, '1080p.m3u8'));
    });
  });

  describe('Validation & Job Assertion', () => {
    it('throws UnrecoverableError on missing videoId', () => {
      expect(() =>
        assertValidTranscodingJob({
          videoId: '',
          courseId: 'course-1',
          inputPath: '/tmp/test.mp4',
          outputDir: tempDir,
        } as VideoTranscodingJobData)
      ).toThrow(UnrecoverableError);
    });

    it('throws UnrecoverableError on missing courseId', () => {
      expect(() =>
        assertValidTranscodingJob({
          videoId: 'vid-1',
          courseId: '',
          inputPath: '/tmp/test.mp4',
          outputDir: tempDir,
        } as VideoTranscodingJobData)
      ).toThrow(UnrecoverableError);
    });

    it('throws UnrecoverableError on missing inputPath or outputDir', () => {
      expect(() =>
        assertValidTranscodingJob({
          videoId: 'vid-1',
          courseId: 'c1',
          inputPath: '',
          outputDir: tempDir,
        } as VideoTranscodingJobData)
      ).toThrow(UnrecoverableError);

      expect(() =>
        assertValidTranscodingJob({
          videoId: 'vid-1',
          courseId: 'c1',
          inputPath: '/tmp/vid.mp4',
          outputDir: '',
        } as VideoTranscodingJobData)
      ).toThrow(UnrecoverableError);
    });
  });

  describe('transcodeVideoToHls Execution', () => {
    it('executes FFmpeg for all profiles and produces variant and master playlists', async () => {
      const runner = jest.fn(async (_args: string[]) => ({ stdout: '', stderr: '' }));

      const jobData: VideoTranscodingJobData = {
        videoId: 'v100',
        courseId: 'c200',
        inputPath: '/data/raw.mp4',
        outputDir: tempDir,
      };

      const result = await transcodeVideoToHls(jobData, runner);

      expect(runner).toHaveBeenCalledTimes(3); // 1080p, 720p, 480p
      expect(result.videoId).toBe('v100');
      expect(result.courseId).toBe('c200');
      expect(result.variants).toHaveLength(3);

      // Verify master playlist file was written to disk
      const masterPath = path.join(tempDir, 'master.m3u8');
      expect(fs.existsSync(masterPath)).toBe(true);
      const masterContent = await fs.promises.readFile(masterPath, 'utf8');
      expect(masterContent).toContain('1080p.m3u8');
      expect(masterContent).toContain('720p.m3u8');
      expect(masterContent).toContain('480p.m3u8');
    });

    it('rethrows errors if FFmpeg runner fails', async () => {
      const failingRunner = jest.fn(async () => {
        throw new Error('ffmpeg execution failure: invalid codec');
      });

      const jobData: VideoTranscodingJobData = {
        videoId: 'v100',
        courseId: 'c200',
        inputPath: '/data/raw.mp4',
        outputDir: tempDir,
      };

      await expect(transcodeVideoToHls(jobData, failingRunner)).rejects.toThrow('ffmpeg execution failure');
    });
  });

  describe('BullMQ Processor & Queue Operations', () => {
    it('processes valid jobs using createVideoTranscodingProcessor', async () => {
      const runner = jest.fn(async () => ({ stdout: '', stderr: '' }));
      const processor = createVideoTranscodingProcessor(runner);

      const job = {
        id: 'job-1',
        data: {
          videoId: 'v1',
          courseId: 'c1',
          inputPath: '/in.mp4',
          outputDir: tempDir,
        },
      } as any;

      const result = await processor(job);
      expect(result.videoId).toBe('v1');
      expect(result.variants).toHaveLength(3);
    });

    it('fails unrecoverable jobs on malformed input data', async () => {
      const processor = createVideoTranscodingProcessor();
      const job = {
        id: 'job-err',
        data: { videoId: '', courseId: 'c1', inputPath: '', outputDir: '' },
      } as any;

      await expect(processor(job)).rejects.toThrow(UnrecoverableError);
    });

    it('enqueues video transcoding job into the queue manager', async () => {
      const mockManager = {
        enqueue: jest.fn(async () => ({ id: 'job-999' })),
      };

      const jobData: VideoTranscodingJobData = {
        videoId: 'vid-xyz',
        courseId: 'course-abc',
        inputPath: '/tmp/source.mp4',
        outputDir: tempDir,
        userId: 'student-123',
      };

      const job = await enqueueVideoTranscoding(jobData, mockManager as any);
      expect(mockManager.enqueue).toHaveBeenCalledWith(
        'video-transcoding',
        'transcode-video-hls',
        jobData,
        { userId: 'student-123' }
      );
      expect(job.id).toBe('job-999');
    });

    it('starts and stops video transcoding worker', async () => {
      const mockWorker = { close: jest.fn(async () => undefined) };
      const mockManager = {
        createWorker: jest.fn(() => mockWorker),
      };

      const worker = startVideoTranscodingWorker(mockManager as any);
      expect(mockManager.createWorker).toHaveBeenCalledWith('video-transcoding', expect.any(Function));
      expect(worker).toBe(mockWorker);

      await stopVideoTranscodingWorker();
      expect(mockWorker.close).toHaveBeenCalled();
    });
  });
});
