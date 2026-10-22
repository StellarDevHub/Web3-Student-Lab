import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ChannelError, stateChannelService } from '../services/stateChannelService.js';
import { ApiResponse } from '../utils/response.js';

const openSchema = z.object({
  courseId: z.string().min(1),
  studentPublicKey: z.string().min(56),
  mentorPublicKey: z.string().min(56),
  rewardStroops: z.string().regex(/^\d+$/),
  contractId: z.string().optional(),
});

const signedStateSchema = z.object({
  state: z.object({
    channelId: z.string().min(1),
    sequence: z.number().int().positive(),
    completedMilestones: z.array(z.string().min(1)),
    studentRewardStroops: z.string().regex(/^\d+$/),
    mentorRewardStroops: z.string().regex(/^\d+$/),
    isFinal: z.boolean(),
  }),
  studentSig: z.string().min(1),
  mentorSig: z.string().min(1),
});

const disputeSchema = z.object({
  initiatorPublicKey: z.string().min(56),
  signature: z.string().min(1),
});

function handleChannelError(res: Response, err: unknown) {
  if (err instanceof ChannelError) {
    return res.status(err.statusCode).json(ApiResponse.error(err.message));
  }
  throw err;
}

export const channelController = {
  // Open a channel and settle its initial funding on Soroban
  openChannel: asyncHandler(async (req: Request, res: Response) => {
    const parsed = openSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(ApiResponse.error('Invalid channel request', parsed.error.issues));
    }

    const wallet = req.user?.walletAddress;
    if (!wallet || (wallet !== parsed.data.studentPublicKey && wallet !== parsed.data.mentorPublicKey)) {
      return res.status(403).json(ApiResponse.error('Only the student or mentor can open this channel'));
    }

    try {
      const channel = await stateChannelService.openChannel(parsed.data);
      return res.status(201).json(ApiResponse.success('State channel opened', channel));
    } catch (err) {
      return handleChannelError(res, err);
    }
  }),

  getChannel: asyncHandler(async (req: Request, res: Response) => {
    try {
      const channel = await stateChannelService.getChannel(req.params.channelId as string);
      return res.status(200).json(ApiResponse.success('State channel retrieved', channel));
    } catch (err) {
      return handleChannelError(res, err);
    }
  }),

  getHistory: asyncHandler(async (req: Request, res: Response) => {
    try {
      const updates = await stateChannelService.getHistory(req.params.channelId as string);
      return res.status(200).json(ApiResponse.success('State channel history retrieved', updates));
    } catch (err) {
      return handleChannelError(res, err);
    }
  }),

  // Submit a dual-signed state transition (isFinal=true settles on-chain)
  submitUpdate: asyncHandler(async (req: Request, res: Response) => {
    const parsed = signedStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(ApiResponse.error('Invalid signed state', parsed.error.issues));
    }

    try {
      const channel = await stateChannelService.submitUpdate(req.params.channelId as string, parsed.data);
      return res.status(200).json(ApiResponse.success('State channel updated', channel));
    } catch (err) {
      return handleChannelError(res, err);
    }
  }),

  initiateDispute: asyncHandler(async (req: Request, res: Response) => {
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(ApiResponse.error('Invalid dispute request', parsed.error.issues));
    }

    try {
      const channel = await stateChannelService.initiateDispute(
        req.params.channelId as string,
        parsed.data.initiatorPublicKey,
        parsed.data.signature
      );
      return res.status(202).json(ApiResponse.success('Dispute opened', channel));
    } catch (err) {
      return handleChannelError(res, err);
    }
  }),
};
