import { Router } from 'express';
import prisma from '../../db/index.js';
import { SearchController } from './search.controller.js';

const router = Router();
const searchController = new SearchController(prisma);

// Search endpoints
router.get('/courses', (req, res) => searchController.searchCourses(req, res));
router.get('/students', (req, res) => searchController.searchStudents(req, res));
router.get('/certificates', (req, res) => searchController.searchCertificates(req, res));
router.get('/all', (req, res) => searchController.searchAll(req, res));

export default router;
