import { Router, Request, Response } from 'express';

const lotteryRouter: Router = Router();

/**
 * @openapi
 * /api/v2/lottery:
 *   get:
 *     summary: Get current lottery details
 *     tags: [Lottery]
 *     responses:
 *       200:
 *         description: Current lottery status
 */
lotteryRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    data: {
      lotteryId: 'lottery-active',
      prizePool: '10000 XLM',
      ticketPrice: '10 XLM',
      status: 'open',
    },
  });
});

/**
 * @openapi
 * /api/v2/lottery/tickets:
 *   post:
 *     summary: Buy lottery tickets
 *     tags: [Lottery]
 */
lotteryRouter.post('/tickets', (req: Request, res: Response) => {
  const { amount } = req.body || {};
  res.status(201).json({
    status: 'success',
    data: {
      ticketsPurchased: amount || 1,
      transactionHash: '0xmocklotterytxhash',
    },
  });
});

export default lotteryRouter;
export { lotteryRouter as v2Lottery };
