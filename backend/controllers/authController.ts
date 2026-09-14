import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';

// Generate JWT
const generateToken = (id: string, role: string) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, mobileNumber, password, role, staffId } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { mobileNumber }] });
    if (userExists) {
      res.status(400).json({ success: false, error: 'User with this email or mobile already exists' });
      return;
    }

    // Role validation for public registration (Privilege Escalation Guard)
    let assignedRole: 'Passenger' | 'Conductor' = 'Passenger';
    if (role !== undefined && role !== null && role !== '') {
      if (role === 'Admin') {
        res.status(400).json({
          success: false,
          errorCode: 'ADMIN_REGISTRATION_FORBIDDEN',
          error: 'Public registration for the Admin role is strictly forbidden',
        });
        return;
      }
      if (role === 'Passenger' || role === 'Conductor') {
        assignedRole = role;
      } else {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_ROLE',
          error: 'Invalid registration role. Allowed roles are Passenger or Conductor',
        });
        return;
      }
    }

    // Create user
    const user = await User.create({
      fullName,
      email,
      mobileNumber,
      password,
      role: assignedRole,
      staffId: assignedRole === 'Conductor' ? staffId : undefined,
    });

    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      success: true,
      token,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        busNumber: user.busNumber,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Please provide email and password' });
      return;
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    // Check password
    const isMatch = await (user as any).matchPassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ success: false, error: 'Account has been deactivated' });
      return;
    }

    const token = generateToken(user._id.toString(), user.role);

    res.status(200).json({
      success: true,
      token,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        busNumber: user.busNumber,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Logout user / clear cookie if we use cookies later
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req: Request, res: Response): Promise<void> => {
  // Currently using JWT stored in client. Client should just discard the token.
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// @desc    Get current logged in user
// @route   GET /api/auth/profile
// @access  Private
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Change Password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Please provide old and new password' });
      return;
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const isMatch = await (user as any).matchPassword(oldPassword);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Incorrect old password' });
      return;
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update conductor bus number
// @route   PUT /api/auth/bus-number
// @access  Private (Conductor only)
export const updateBusNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { busNumber } = req.body;
    if (!busNumber || typeof busNumber !== 'string' || !busNumber.trim()) {
      res.status(400).json({ success: false, error: 'Please provide a valid bus number' });
      return;
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    user.busNumber = busNumber.trim().toUpperCase();
    await user.save();

    const userProfile = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      staffId: user.staffId,
      busNumber: user.busNumber,
    };

    res.status(200).json({
      success: true,
      message: 'Bus number configured successfully',
      user: userProfile,
      data: userProfile,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

