/**
 * Video Transcoding & HLS Chunking Worker — BE-097 (#1844)
 *
 * Automated video processing pipeline that ingests raw course video uploads (MP4)
 * and transcodes them into adaptive multi-bitrate HTTP Live Streaming (HLS) streams:
 *  - 1080p (FHD): 1920x1080 @ ~5000 kbps (192k audio)
 *  - 720p  (HD):  1280x720  @ ~2800 kbps (128k audio)
 *  - 480p  (SD):  854x480   @ ~1200 kbps (96k audio)
 *
 * Emits segmented .ts chunks with a target duration of 6s alongside variant playlists
 * and a master playlist (`master.m3u8`). Stream chunks are secured via AWS CloudFront
 * signed cookies validated against student enrollment records.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { UnrecoverableError, type Job, type Worker } from 'bullmq';
import { getQueueManager, QUEUE_NAMES, type QueueManager } from '../queues/queueManager.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface HlsResolutionProfile {
  name: '1080p' | '720p' | '480p';
  width: number;
  height: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  bandwidth: number;
}

export const HLS_PROFILES: readonly HlsResolutionProfile[] = [
  {
    name: '1080p',
    width: 1920,
    height: 1080,
    bitrate: '5000k',
    maxrate: '5350k',
    bufsize: '7500k',
    audioBitrate: '192k',
    bandwidth: 5000000,
  },
  {
    name: '720p',
    width: 1280,
    height: 720,
    bitrate: '2800k',
    maxrate: '3000k',
    bufsize: '4200k',
    audioBitrate: '128k',
    bandwidth: 2800000,
  },
  {
    name: '480p',
    width: 854,
    height: 480,
    bitrate: '1200k',
    maxrate: '1400k',
    bufsize: '2100k',
    audioBitrate: '96k',
    bandwidth: 1200000,
  },
];

export interface VideoTranscodingJobData {
  videoId: string;
  courseId: string;
  lessonId?: string;
  inputPath: string;
  outputDir: string;
  userId?: string;
  segmentDuration?: number;
}

export interface VideoVariantResult {
  resolution: '1080p' | '720p' | '480p';
  playlist: string;
  bandwidth: number;
  width: number;
  height: number;
  segmentPattern: string;
}

export interface VideoTranscodingResult {
  videoId: string;
  courseId: string;
  masterPlaylist: string;
  outputDir: string;
  variants: VideoVariantResult[];
}

export type FfmpegRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

export const defaultFfmpegRunner: FfmpegRunner = async (args: string[]) => {
  const ffmpegBinary = process.env.FFMPEG_PATH || 'ffmpeg';
  return execFileAsync(ffmpegBinary, args);
};

export function buildFfmpegArgsForProfile(
  inputPath: string,
  outputDir: string,
  profile: HlsResolutionProfile,
  segmentDuration = 6
): string[] {
  const segmentPattern = path.join(outputDir, `${profile.name}_%03d.ts`);
  const playlistPath = path.join(outputDir, `${profile.name}.m3u8`);

  return [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale=w=${profile.width}:h=${profile.height}:force_original_aspect_ratio=decrease`,
    '-c:v',
    'libx264',
    '-profile:v',
    'main',
    '-crf',
    '20',
    '-sc_threshold',
    '0',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-b:v',
    profile.bitrate,
    '-maxrate',
    profile.maxrate,
    '-bufsize',
    profile.bufsize,
    '-c:a',
    'aac',
    '-b:a',
    profile.audioBitrate,
    '-ac',
    '2',
    '-ar',
    '48000',
    '-hls_time',
    String(segmentDuration),
    '-hls_playlist_type',
    'vod',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    segmentPattern,
    '-f',
    'hls',
    playlistPath,
  ];
}

export function generateMasterPlaylist(profiles: readonly HlsResolutionProfile[] = HLS_PROFILES): string {
  let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n';
  for (const profile of profiles) {
    manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${profile.bandwidth},RESOLUTION=${profile.width}x${profile.height}\n${profile.name}.m3u8\n`;
  }
  return manifest;
}

export async function transcodeVideoToHls(
  jobData: VideoTranscodingJobData,
  runner: FfmpegRunner = defaultFfmpegRunner,
  profiles: readonly HlsResolutionProfile[] = HLS_PROFILES
): Promise<VideoTranscodingResult> {
  const { videoId, courseId, inputPath, outputDir, segmentDuration = 6 } = jobData;

  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  const variants: VideoVariantResult[] = [];

  // Transcode each resolution profile
  for (const profile of profiles) {
    const args = buildFfmpegArgsForProfile(inputPath, outputDir, profile, segmentDuration);
    logger.info(`[videoTranscoding] Transcoding ${profile.name} for video ${videoId}`, {
      videoId,
      courseId,
      profile: profile.name,
    });

    try {
      await runner(args);
    } catch (err) {
      logger.error(`[videoTranscoding] FFmpeg transcoding failed for ${profile.name}`, {
        videoId,
        profile: profile.name,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    variants.push({
      resolution: profile.name,
      playlist: `${profile.name}.m3u8`,
      bandwidth: profile.bandwidth,
      width: profile.width,
      height: profile.height,
      segmentPattern: `${profile.name}_%03d.ts`,
    });
  }

  // Write master playlist
  const masterContent = generateMasterPlaylist(profiles);
  const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
  await fs.promises.writeFile(masterPlaylistPath, masterContent, 'utf8');

  logger.info(`[videoTranscoding] Completed HLS pipeline for video ${videoId}`, {
    videoId,
    courseId,
    masterPlaylist: masterPlaylistPath,
    variantCount: variants.length,
  });

  return {
    videoId,
    courseId,
    masterPlaylist: masterPlaylistPath,
    outputDir,
    variants,
  };
}

export function assertValidTranscodingJob(data: VideoTranscodingJobData): void {
  if (!data?.videoId || typeof data.videoId !== 'string') {
    throw new UnrecoverableError('Video transcoding job is missing videoId');
  }
  if (!data?.courseId || typeof data.courseId !== 'string') {
    throw new UnrecoverableError('Video transcoding job is missing courseId');
  }
  if (!data?.inputPath || typeof data.inputPath !== 'string') {
    throw new UnrecoverableError('Video transcoding job is missing inputPath');
  }
  if (!data?.outputDir || typeof data.outputDir !== 'string') {
    throw new UnrecoverableError('Video transcoding job is missing outputDir');
  }
}

export function createVideoTranscodingProcessor(
  runner: FfmpegRunner = defaultFfmpegRunner,
  profiles: readonly HlsResolutionProfile[] = HLS_PROFILES
) {
  return async (job: Job<VideoTranscodingJobData, VideoTranscodingResult>): Promise<VideoTranscodingResult> => {
    assertValidTranscodingJob(job.data);

    try {
      return await transcodeVideoToHls(job.data, runner, profiles);
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        throw err;
      }
      logger.error('[videoTranscodingWorker] Job execution failed', {
        jobId: job.id,
        videoId: job.data.videoId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

let activeWorker: Worker | null = null;

export function startVideoTranscodingWorker(
  manager: QueueManager = getQueueManager(),
  runner: FfmpegRunner = defaultFfmpegRunner
): Worker {
  if (activeWorker) return activeWorker;
  activeWorker = manager.createWorker(QUEUE_NAMES.VIDEO_TRANSCODING, createVideoTranscodingProcessor(runner));
  return activeWorker;
}

export async function stopVideoTranscodingWorker(): Promise<void> {
  if (!activeWorker) return;
  const worker = activeWorker;
  activeWorker = null;
  await worker.close();
}

export async function enqueueVideoTranscoding(
  data: VideoTranscodingJobData,
  manager: QueueManager = getQueueManager()
): Promise<Job<VideoTranscodingJobData, VideoTranscodingResult>> {
  assertValidTranscodingJob(data);
  return manager.enqueue<VideoTranscodingJobData>(
    QUEUE_NAMES.VIDEO_TRANSCODING,
    'transcode-video-hls',
    data,
    data.userId ? { userId: data.userId } : {}
  );
}
