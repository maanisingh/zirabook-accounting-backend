const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  sanitizeSearchQuery,
  cleanObject
} = require('../utils/helpers');
const { validatePassword } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * List users in company
 * GET /api/v1/users
 */
const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const { skip, take } = paginate(page, limit);

    // Build where clause
    const where = {};

    // Company isolation
    if (req.user.role === 'SUPERADMIN' && req.query.companyId) {
      where.companyId = req.query.companyId;
    } else if (req.user.companyId) {
      where.companyId = req.user.companyId;
    }

    if (search) {
      const searchTerm = sanitizeSearchQuery(search);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          companyId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          company: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json(paginatedResponse(users, total, page, limit));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json(errorResponse('Failed to fetch users', error));
  }
};

/**
 * Create user
 * POST /api/v1/users
 */
const createUser = async (req, res) => {
  try {
    const { email, password, name, role = 'USER', companyId } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json(errorResponse('Email, password, and name are required'));
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    // Check permissions
    if (req.user.role === 'COMPANY_ADMIN') {
      // Company admins can only create users in their company
      if (companyId && companyId !== req.user.companyId) {
        return res.status(403).json(errorResponse('Cannot create users in other companies'));
      }
      // Cannot create SUPERADMIN users
      if (role === 'SUPERADMIN') {
        return res.status(403).json(errorResponse('Cannot create superadmin users'));
      }
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json(errorResponse('User with this email already exists'));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine company ID
    const userCompanyId = companyId || req.user.companyId;

    // Create user
    const newUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role,
        companyId: userCompanyId,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        company: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(successResponse(newUser, 'User created successfully'));
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json(errorResponse('Failed to create user', error));
  }
};

/**
 * Get user by ID
 * GET /api/v1/users/:id
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Build where clause
    const where = { id };

    // Company isolation
    if (req.user.role !== 'SUPERADMIN' && req.user.companyId) {
      where.companyId = req.user.companyId;
    }

    const user = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: { id: true, name: true }
        },
        _count: {
          select: {
            createdInvoices: true,
            createdPayments: true,
            createdJournals: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json(errorResponse('User not found'));
    }

    res.json(successResponse(user));
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(errorResponse('Failed to fetch user', error));
  }
};

/**
 * Update user
 * PUT /api/v1/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role, isActive } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!existingUser) {
      return res.status(404).json(errorResponse('User not found'));
    }

    // Check permissions
    if (req.user.role === 'COMPANY_ADMIN') {
      // Cannot modify SUPERADMIN users
      if (existingUser.role === 'SUPERADMIN' || role === 'SUPERADMIN') {
        return res.status(403).json(errorResponse('Cannot modify superadmin users'));
      }
    }

    // Users can only update their own profile (except admins)
    if (req.user.role === 'USER' && req.user.id !== id) {
      return res.status(403).json(errorResponse('Cannot update other users'));
    }

    // Check for duplicate email
    if (email && email !== existingUser.email) {
      const duplicateEmail = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (duplicateEmail) {
        return res.status(409).json(errorResponse('Email already in use'));
      }
    }

    // Update user
    const updateData = cleanObject({
      email: email?.toLowerCase(),
      name,
      role: req.user.role === 'SUPERADMIN' || req.user.role === 'COMPANY_ADMIN' ? role : undefined,
      isActive: req.user.role === 'SUPERADMIN' || req.user.role === 'COMPANY_ADMIN' ? isActive : undefined
    });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        company: {
          select: { id: true, name: true }
        }
      }
    });

    res.json(successResponse(updatedUser, 'User updated successfully'));
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json(errorResponse('Failed to update user', error));
  }
};

/**
 * Deactivate user
 * DELETE /api/v1/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete yourself
    if (req.user.id === id) {
      return res.status(400).json(errorResponse('Cannot delete your own account'));
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!existingUser) {
      return res.status(404).json(errorResponse('User not found'));
    }

    // Check permissions
    if (req.user.role === 'COMPANY_ADMIN' && existingUser.role === 'SUPERADMIN') {
      return res.status(403).json(errorResponse('Cannot delete superadmin users'));
    }

    // Soft delete (deactivate)
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    res.json(successResponse(null, 'User deactivated successfully'));
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(errorResponse('Failed to delete user', error));
  }
};

/**
 * Change user role
 * PATCH /api/v1/users/:id/role
 */
const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json(errorResponse('Role is required'));
    }

    // Check permissions
    if (req.user.role !== 'SUPERADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json(errorResponse('Insufficient permissions to change roles'));
    }

    if (req.user.role === 'COMPANY_ADMIN' && role === 'SUPERADMIN') {
      return res.status(403).json(errorResponse('Cannot assign superadmin role'));
    }

    // Cannot change own role
    if (req.user.id === id) {
      return res.status(400).json(errorResponse('Cannot change your own role'));
    }

    const user = await prisma.user.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!user) {
      return res.status(404).json(errorResponse('User not found'));
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    res.json(successResponse(updatedUser, 'User role updated successfully'));
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json(errorResponse('Failed to change user role', error));
  }
};

/**
 * Change user password (admin)
 * PATCH /api/v1/users/:id/password
 */
const changeUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json(errorResponse('New password is required'));
    }

    // Validate password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    // Check permissions (only admins can reset others' passwords)
    if (req.user.role !== 'SUPERADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      if (req.user.id !== id) {
        return res.status(403).json(errorResponse('Cannot change other users\' passwords'));
      }
    }

    const user = await prisma.user.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!user) {
      return res.status(404).json(errorResponse('User not found'));
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });

    res.json(successResponse(null, 'Password changed successfully'));
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json(errorResponse('Failed to change password', error));
  }
};

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  changeUserRole,
  changeUserPassword
};