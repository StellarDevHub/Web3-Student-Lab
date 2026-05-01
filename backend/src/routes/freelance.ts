import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess } from '../utils/response.js';

const router = express.Router();

// Mocking reputation retrieval for the demo
router.get('/reputation/:address', asyncHandler(async (req, res) => {
    const { address } = req.params;
    return sendSuccess(res, {
        data: {
            address,
            score: 4.8,
            reviews: [
                { rating: 5, comment: "Excellent smart contract work." },
                { rating: 4, comment: "Great communication." }
            ]
        },
        message: 'Reputation profile retrieved'
    });
}));

export default router;
