const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(errorResponse('Email and password are required'));
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json(errorResponse('Invalid email or password'));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json(errorResponse('Invalid email or password'));
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      process.env.JWT_SECRET || 'zirakbook-secret-key-2024',
      { expiresIn: '7d' }
    );

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name
    };

    res.json(successResponse({ user: userData, token }, 'Login successful'));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Register
exports.register = async (req, res) => {
  try {
    const { email, password, name, role = 'USER', companyId } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json(errorResponse('Email, password, and name are required'));
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json(errorResponse('User with this email already exists'));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        companyId
      },
      include: { company: true }
    });

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      process.env.JWT_SECRET || 'zirakbook-secret-key-2024',
      { expiresIn: '7d' }
    );

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name
    };

    res.status(201).json(successResponse({ user: userData, token }, 'Registration successful'));
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true }
    });

    if (!user) {
      return res.status(404).json(errorResponse('User not found'));
    }

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name,
      isActive: user.isActive,
      createdAt: user.createdAt
    };

    res.json(successResponse(userData));
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get users by company
exports.getUsersByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const users = await prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(successResponse(users));
  } catch (error) {
    console.error('Get users by company error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create user (admin only)
exports.createUser = async (req, res) => {
  try {
    const { email, password, name, role, companyId } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json(errorResponse('Email, password, and name are required'));
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json(errorResponse('User with this email already exists'));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'USER',
        companyId: companyId || req.user.companyId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true
      }
    });

    res.status(201).json(successResponse(user, 'User created successfully'));
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, password } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        updatedAt: true
      }
    });

    res.json(successResponse(user, 'User updated successfully'));
  } catch (error) {
    console.error('Update user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('User not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id }
    });

    res.json(successResponse(null, 'User deleted successfully'));
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('User not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};