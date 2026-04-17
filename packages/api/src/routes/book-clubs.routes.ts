/**
 * Book Club Routes — Reading groups / book clubs
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import { BookClub, BookClubMember, Book, User, ClubDiscussion } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { parsePagination } from '../utils/pagination';
import { notFound, forbidden } from '../utils/errors';
import { sequelize } from '../db';
import { Op } from 'sequelize';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getClubMembership(clubId: string, userId: string) {
  return BookClubMember.findOne({ where: { clubId, userId } });
}

async function requireAdmin(req: AuthRequest, clubId: string) {
  const membership = await getClubMembership(clubId, req.userId!);
  if (!membership || membership.role !== 'admin') {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/book-clubs — Create a book club
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  rateLimiter({ windowMs: 300000, max: 5 }),
  validate([
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('isPrivate').optional().isBoolean(),
    body('maxMembers').optional().isInt({ min: 2, max: 100 }),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { name, description, isPrivate, maxMembers } = req.body;

      const club = await BookClub.create({
        name,
        description,
        isPrivate: isPrivate ?? false,
        maxMembers: maxMembers ?? 20,
        createdBy: req.userId!,
      });

      // Creator becomes admin
      await BookClubMember.create({
        clubId: club.id,
        userId: req.userId!,
        role: 'admin',
      });

      // Fetch with member count
      const result = await BookClub.findByPk(club.id, {
        include: [{ model: BookClubMember, as: 'clubMembers', attributes: ['id', 'userId', 'role'] }],
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Error creating book club:', error);
      res.status(500).json({ success: false, error: { code: 'CLUB_CREATE_ERROR', message: 'Failed to create book club' } });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/book-clubs — List user's clubs
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const memberships = await BookClubMember.findAll({
      where: { userId: req.userId! },
      attributes: ['clubId', 'role', 'joinedAt'],
    });

    const clubIds = memberships.map((m) => m.clubId);
    if (clubIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const clubs = await BookClub.findAll({
      where: { id: { [Op.in]: clubIds } },
      include: [
        { model: BookClubMember, as: 'clubMembers', attributes: ['id', 'userId', 'role'] },
      ],
      order: [['updatedAt', 'DESC']],
    });

    // Attach current user's role
    const roleMap = new Map(memberships.map((m) => [m.clubId, m.role]));
    const result = clubs.map((club) => ({
      ...club.toJSON(),
      currentUserRole: roleMap.get(club.id) || 'member',
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching book clubs:', error);
    res.status(500).json({ success: false, error: { code: 'CLUBS_FETCH_ERROR', message: 'Failed to fetch book clubs' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/book-clubs/discover — Browse public clubs
// ---------------------------------------------------------------------------
router.get('/discover', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    // Exclude clubs user is already in
    const memberships = await BookClubMember.findAll({
      where: { userId: req.userId! },
      attributes: ['clubId'],
    });
    const joinedIds = memberships.map((m) => m.clubId);

    const where: Record<string, unknown> = { isPrivate: false };
    if (joinedIds.length > 0) {
      where.id = { [Op.notIn]: joinedIds };
    }

    const { rows: clubs, count: total } = await BookClub.findAndCountAll({
      where,
      attributes: ['id', 'name', 'description', 'coverImage', 'isPrivate', 'maxMembers', 'createdAt'],
      include: [{ model: BookClubMember, as: 'clubMembers', attributes: ['id'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    // Add member count
    const result = clubs.map((club) => {
      const json = club.toJSON() as unknown as Record<string, unknown>;
      json.memberCount = (json.clubMembers as unknown[])?.length || 0;
      delete json.clubMembers;
      return json;
    });

    res.json({
      success: true,
      data: result,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error discovering clubs:', error);
    res.status(500).json({ success: false, error: { code: 'DISCOVER_ERROR', message: 'Failed to discover clubs' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/book-clubs/:id — Club detail
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const club = await BookClub.findByPk(req.params.id, {
      include: [
        {
          model: BookClubMember,
          as: 'clubMembers',
          attributes: ['id', 'userId', 'role', 'joinedAt'],
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        },
      ],
    });

    if (!club) {
      return notFound(res, 'Book club');
    }

    // Check membership for private clubs
    const membership = await getClubMembership(club.id, req.userId!);
    if (club.isPrivate && !membership) {
      return forbidden(res, 'This club is private');
    }

    // Get current book info
    let currentBook = null;
    if (club.currentBookId) {
      currentBook = await Book.findByPk(club.currentBookId, {
        attributes: ['id', 'title', 'author', 'coverUrl', 'progress'],
      });
    }

    res.json({
      success: true,
      data: {
        ...club.toJSON(),
        currentBook,
        currentUserRole: membership?.role || null,
      },
    });
  } catch (error) {
    console.error('Error fetching book club:', error);
    res.status(500).json({ success: false, error: { code: 'CLUB_FETCH_ERROR', message: 'Failed to fetch book club' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/book-clubs/:id/join — Join a club (by invite code or direct)
// ---------------------------------------------------------------------------
router.post(
  '/:id/join',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 10 }),
  async (req: AuthRequest, res) => {
    try {
      const club = await BookClub.findByPk(req.params.id);
      if (!club) {
        return notFound(res, 'Book club');
      }

      // Check invite code for private clubs
      if (club.isPrivate) {
        const { inviteCode } = req.body;
        if (inviteCode !== club.inviteCode) {
          return forbidden(res, 'Invalid invite code');
        }
      }

      // Check if already a member
      const existing = await getClubMembership(club.id, req.userId!);
      if (existing) {
        return res.status(409).json({ success: false, error: { code: 'ALREADY_MEMBER', message: 'Already a member of this club' } });
      }

      // Check member count
      const memberCount = await BookClubMember.count({ where: { clubId: club.id } });
      if (memberCount >= club.maxMembers) {
        return res.status(409).json({ success: false, error: { code: 'CLUB_FULL', message: 'This club is full' } });
      }

      await BookClubMember.create({
        clubId: club.id,
        userId: req.userId!,
        role: 'member',
      });

      res.json({ success: true, data: { message: 'Joined successfully' } });
    } catch (error) {
      console.error('Error joining club:', error);
      res.status(500).json({ success: false, error: { code: 'JOIN_ERROR', message: 'Failed to join club' } });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/book-clubs/join-code — Join by invite code (no club ID needed)
// ---------------------------------------------------------------------------
router.post(
  '/join-code',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 10 }),
  validate([body('inviteCode').isString().trim().isLength({ min: 6, max: 6 })]),
  async (req: AuthRequest, res) => {
    try {
      const { inviteCode } = req.body;

      const club = await BookClub.findOne({ where: { inviteCode: inviteCode.toUpperCase() } });
      if (!club) {
        return notFound(res, 'Club with that invite code');
      }

      // Check if already a member
      const existing = await getClubMembership(club.id, req.userId!);
      if (existing) {
        return res.status(409).json({ success: false, error: { code: 'ALREADY_MEMBER', message: 'Already a member of this club' } });
      }

      // Check member count
      const memberCount = await BookClubMember.count({ where: { clubId: club.id } });
      if (memberCount >= club.maxMembers) {
        return res.status(409).json({ success: false, error: { code: 'CLUB_FULL', message: 'This club is full' } });
      }

      await BookClubMember.create({
        clubId: club.id,
        userId: req.userId!,
        role: 'member',
      });

      res.json({ success: true, data: { clubId: club.id, clubName: club.name } });
    } catch (error) {
      console.error('Error joining club by code:', error);
      res.status(500).json({ success: false, error: { code: 'JOIN_ERROR', message: 'Failed to join club' } });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/book-clubs/:id/leave — Leave a club
// ---------------------------------------------------------------------------
router.post('/:id/leave', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), async (req: AuthRequest, res) => {
  try {
    const membership = await getClubMembership(req.params.id, req.userId!);
    if (!membership) {
      return notFound(res, 'Membership');
    }

    // If admin, check if there are other admins
    if (membership.role === 'admin') {
      const adminCount = await BookClubMember.count({
        where: { clubId: req.params.id, role: 'admin' },
      });
      if (adminCount <= 1) {
        // Transfer ownership to the longest-standing member
        const nextMember = await BookClubMember.findOne({
          where: { clubId: req.params.id, userId: { [Op.ne]: req.userId! } },
          order: [['joinedAt', 'ASC']],
        });
        if (nextMember) {
          await nextMember.update({ role: 'admin' });
        } else {
          // Last member leaving — delete the club
          await BookClub.destroy({ where: { id: req.params.id } });
          return res.json({ success: true, data: { message: 'Club dissolved — you were the last member' } });
        }
      }
    }

    await membership.destroy();
    res.json({ success: true, data: { message: 'Left the club' } });
  } catch (error) {
    console.error('Error leaving club:', error);
    res.status(500).json({ success: false, error: { code: 'LEAVE_ERROR', message: 'Failed to leave club' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/book-clubs/:id/members — List members
// ---------------------------------------------------------------------------
router.get('/:id/members', authenticate, async (req: AuthRequest, res) => {
  try {
    const club = await BookClub.findByPk(req.params.id);
    if (!club) {
      return notFound(res, 'Book club');
    }

    // Private clubs require membership
    if (club.isPrivate) {
      const membership = await getClubMembership(club.id, req.userId!);
      if (!membership) {
        return forbidden(res, 'Not a member of this club');
      }
    }

    const members = await BookClubMember.findAll({
      where: { clubId: req.params.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['joinedAt', 'ASC']],
    });

    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ success: false, error: { code: 'MEMBERS_FETCH_ERROR', message: 'Failed to fetch members' } });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/book-clubs/:id — Update club (admin only)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 20 }),
  validate([
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('isPrivate').optional().isBoolean(),
    body('maxMembers').optional().isInt({ min: 2, max: 100 }),
  ]),
  async (req: AuthRequest, res) => {
    try {
      if (!await requireAdmin(req, req.params.id)) {
        return forbidden(res, 'Only admins can update the club');
      }

      const club = await BookClub.findByPk(req.params.id);
      if (!club) {
        return notFound(res, 'Book club');
      }

      const { name, description, isPrivate, maxMembers } = req.body;
      await club.update({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isPrivate !== undefined && { isPrivate }),
        ...(maxMembers !== undefined && { maxMembers }),
      });

      res.json({ success: true, data: club });
    } catch (error) {
      console.error('Error updating club:', error);
      res.status(500).json({ success: false, error: { code: 'CLUB_UPDATE_ERROR', message: 'Failed to update club' } });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/book-clubs/:id/set-book — Set current reading book (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/:id/set-book',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 10 }),
  validate([body('bookId').isString()]),
  async (req: AuthRequest, res) => {
    try {
      if (!await requireAdmin(req, req.params.id)) {
        return forbidden(res, 'Only admins can set the reading book');
      }

      const club = await BookClub.findByPk(req.params.id);
      if (!club) {
        return notFound(res, 'Book club');
      }

      // Verify book exists (it should belong to at least one member)
      const book = await Book.findByPk(req.body.bookId);
      if (!book) {
        return notFound(res, 'Book');
      }

      await club.update({ currentBookId: req.body.bookId });

      res.json({ success: true, data: { message: 'Reading book updated', currentBookId: req.body.bookId } });
    } catch (error) {
      console.error('Error setting reading book:', error);
      res.status(500).json({ success: false, error: { code: 'SET_BOOK_ERROR', message: 'Failed to set reading book' } });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/book-clubs/:id — Delete club (admin only)
// ---------------------------------------------------------------------------
router.delete('/:id', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), async (req: AuthRequest, res) => {
  try {
    if (!await requireAdmin(req, req.params.id)) {
      return forbidden(res, 'Only admins can delete the club');
    }

    const club = await BookClub.findByPk(req.params.id);
    if (!club) {
      return notFound(res, 'Book club');
    }

    // Cascade deletes members
    await club.destroy();
    res.json({ success: true, data: { message: 'Club deleted' } });
  } catch (error) {
    console.error('Error deleting club:', error);
    res.status(500).json({ success: false, error: { code: 'CLUB_DELETE_ERROR', message: 'Failed to delete club' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/book-clubs/:id/progress — Get group reading progress
// ---------------------------------------------------------------------------
router.get('/:id/progress', authenticate, async (req: AuthRequest, res) => {
  try {
    const club = await BookClub.findByPk(req.params.id, {
      include: [{ model: BookClubMember, as: 'clubMembers', attributes: ['userId'] }],
    });
    if (!club) {
      return notFound(res, 'Book club');
    }

    const membership = await getClubMembership(club.id, req.userId!);
    if (!membership) {
      return forbidden(res, 'Not a member');
    }

    if (!club.currentBookId) {
      return res.json({ success: true, data: { hasBook: false } });
    }

    // Get progress for each member who has this book
    const members = (club as unknown as { clubMembers?: Array<{ userId: string }> }).clubMembers || [];
    const memberIds = members.map((m: { userId: string }) => m.userId);
    const books = await Book.findAll({
      where: {
        id: club.currentBookId,
        userId: { [Op.in]: memberIds },
      },
      attributes: ['id', 'userId', 'title', 'author', 'progress', 'currentPage', 'totalPages', 'status'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });

    res.json({ success: true, data: { hasBook: true, bookId: club.currentBookId, progress: books } });
  } catch (error) {
    console.error('Error fetching club progress:', error);
    res.status(500).json({ success: false, error: { code: 'PROGRESS_ERROR', message: 'Failed to fetch progress' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/book-clubs/:id/discussions — List discussion messages
// ---------------------------------------------------------------------------
router.get('/:id/discussions', authenticate, async (req: AuthRequest, res) => {
  try {
    const club = await BookClub.findByPk(req.params.id);
    if (!club) {
      return notFound(res, 'Book club');
    }

    // Private clubs require membership
    if (club.isPrivate) {
      const membership = await getClubMembership(club.id, req.userId!);
      if (!membership) {
        return forbidden(res, 'Not a member of this club');
      }
    }

    const { limit, offset } = parsePagination(req);
    const maxLimit = Math.min(limit, 50);

    const { rows: messages, count: total } = await ClubDiscussion.findAndCountAll({
      where: { clubId: req.params.id },
      include: [{ model: User, as: 'author', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: maxLimit,
      offset,
    });

    // Return newest-last for chat display
    res.json({
      success: true,
      data: messages.reverse(),
      pagination: {
        total,
        limit: maxLimit,
        offset,
        hasMore: offset + maxLimit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ success: false, error: { code: 'DISCUSSION_FETCH_ERROR', message: 'Failed to fetch discussions' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/book-clubs/:id/discussions — Send a message
// ---------------------------------------------------------------------------
router.post(
  '/:id/discussions',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 20 }),
  validate([
    body('content').isString().trim().isLength({ min: 1, max: 2000 }),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const club = await BookClub.findByPk(req.params.id);
      if (!club) {
        return notFound(res, 'Book club');
      }

      // Must be a member to post
      const membership = await getClubMembership(club.id, req.userId!);
      if (!membership) {
        return forbidden(res, 'Only members can post messages');
      }

      const message = await ClubDiscussion.create({
        clubId: club.id,
        userId: req.userId!,
        content: req.body.content,
      });

      // Fetch with author info
      const result = await ClubDiscussion.findByPk(message.id, {
        include: [{ model: User, as: 'author', attributes: ['id', 'name'] }],
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Error posting discussion:', error);
      res.status(500).json({ success: false, error: { code: 'DISCUSSION_POST_ERROR', message: 'Failed to post message' } });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/book-clubs/:id/discussions/:messageId — Delete a message (author or admin)
// ---------------------------------------------------------------------------
router.delete('/:id/discussions/:messageId', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const message = await ClubDiscussion.findByPk(req.params.messageId);
    if (!message) {
      return notFound(res, 'Message');
    }

    // Author can delete own messages, admins can delete any
    const isAdmin = await requireAdmin(req, req.params.id);
    if (message.userId !== req.userId! && !isAdmin) {
      return forbidden(res, 'Can only delete your own messages');
    }

    await message.destroy();
    res.json({ success: true, data: { message: 'Message deleted' } });
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ success: false, error: { code: 'DISCUSSION_DELETE_ERROR', message: 'Failed to delete message' } });
  }
});

export default router;
