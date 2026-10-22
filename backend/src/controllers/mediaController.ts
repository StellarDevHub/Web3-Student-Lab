import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ipfsPinningService, isCidV1 } from '../services/ipfsPinningService.js';
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
};
