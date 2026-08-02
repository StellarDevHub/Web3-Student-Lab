import { Request, Response } from 'express';
import { TransactionService, Transaction } from './transaction.service.js';
import { v4 as uuidv4 } from 'uuid';

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const transactions = await TransactionService.getRecentTransactions();
    res.json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const { sender, receiver, amount } = req.body;
    if (!sender || !receiver || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const newTx: Transaction = {
      id: uuidv4(),
      sender,
      receiver,
      amount,
      status: 'success',
      timestamp: Date.now(),
    };

    await TransactionService.addTransaction(newTx);
    res.status(201).json({ success: true, data: newTx });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
