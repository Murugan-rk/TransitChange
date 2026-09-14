import express from 'express';
import {
  register,
  login,
  logout,
  getProfile,
  changePassword,
  updateBusNumber,
} from '../controllers/authController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/profile', protect, getProfile);
router.put('/change-password', protect, changePassword);
router.put('/bus-number', protect, authorize('Conductor'), updateBusNumber);

export default router;

