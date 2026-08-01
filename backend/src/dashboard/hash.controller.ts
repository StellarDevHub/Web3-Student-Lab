import { Request, Response } from 'express';
import { HashService } from './hash.service.js';

export const generateHash = async (req: Request, res: Response) => {
  try {
    const { studentId, inputData, hashType } = req.body;
    if (!studentId || !inputData) {
      return res.status(400).json({ success: false, error: 'studentId and inputData are required' });
    }
    const simulation = await HashService.generateHash(studentId, inputData, hashType);
    res.status(201).json({ success: true, data: simulation });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSimulations = async (req: Request, res: Response) => {
  try {
    const studentId = typeof req.params.studentId === 'string' ? req.params.studentId : undefined;
    if (!studentId) {
      return res.status(400).json({ success: false, error: 'studentId is required' });
    }
    const simulations = await HashService.getSimulations(studentId);
    res.json({ success: true, data: simulations });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
