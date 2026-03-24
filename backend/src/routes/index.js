import { Router } from 'express';
import studentsRouter from './students.js';
import coursesRouter from './courses.js';
import certificatesRouter from './certificates.js';
import enrollmentsRouter from './enrollments.js';
const router = Router();
// Mount all feature routers
router.use('/students', studentsRouter);
router.use('/courses', coursesRouter);
router.use('/certificates', certificatesRouter);
router.use('/enrollments', enrollmentsRouter);
// Placeholder routes for future features
// These can be replaced with actual routers as features are developed
router.use('/blockchain', (req, res) => {
  res.json({ message: 'Blockchain feature - Coming soon' });
});
router.use('/generator', (req, res) => {
  res.json({ message: 'Generator feature - Coming soon' });
});
router.use('/learning', (req, res) => {
  res.json({ message: 'Learning feature - Coming soon' });
});
export default router;
//# sourceMappingURL=index.js.map
