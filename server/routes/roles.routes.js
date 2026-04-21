const express = require('express');
const router = express.Router();
const db = require('../db');

const VALID_ROLES = ['student', 'instructor', 'teaching_assistant', 'admin'];

// GET /api/roles/users  (admin only)
router.get('/users', (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const users = db.prepare(`
      SELECT id, first_name, last_name, email, role, instrument, avatar_initials, created_at
      FROM users
      ORDER BY role, last_name, first_name
    `).all();

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/roles/users/:id  (admin only)
router.put('/users/:id', (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Valid role required: ${VALID_ROLES.join(', ')}` });
    }

    const user = db.prepare('SELECT id, first_name, last_name, email FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);

    const updated = db.prepare('SELECT id, first_name, last_name, email, role FROM users WHERE id = ?').get(req.params.id);
    res.json({ user: updated, message: `Role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roles/teaching-assistants
router.get('/teaching-assistants', (req, res) => {
  try {
    if (!['instructor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Instructor access required' });
    }

    const tas = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.instrument, u.avatar_initials
      FROM users u
      WHERE u.role = 'teaching_assistant'
      ORDER BY u.last_name, u.first_name
    `).all();

    // Get their course assignments
    let taAssignments = [];
    try {
      taAssignments = db.prepare(`
        SELECT e.student_id AS ta_id, e.course_id, c.title AS course_title
        FROM enrollments e
        JOIN users u ON e.student_id = u.id
        JOIN courses c ON e.course_id = c.id
        WHERE u.role = 'teaching_assistant'
      `).all();
    } catch (e) { /* ignore */ }

    const taMap = {};
    taAssignments.forEach(a => {
      if (!taMap[a.ta_id]) taMap[a.ta_id] = [];
      taMap[a.ta_id].push({ course_id: a.course_id, course_title: a.course_title });
    });

    const result = tas.map(ta => ({ ...ta, assigned_courses: taMap[ta.id] || [] }));
    res.json({ teaching_assistants: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roles/assign-ta
router.post('/assign-ta', (req, res) => {
  try {
    if (!['instructor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Instructor access required' });
    }

    const { user_id, course_id } = req.body;
    if (!user_id || !course_id) return res.status(400).json({ error: 'user_id and course_id are required' });

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!['teaching_assistant', 'instructor'].includes(user.role)) {
      return res.status(400).json({ error: 'User must be a teaching assistant or instructor' });
    }

    const course = db.prepare('SELECT id, title, instructor_id FROM courses WHERE id = ?').get(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your course' });
    }

    // Enroll the TA in the course (reuse enrollments table)
    try {
      db.prepare(`
        INSERT INTO enrollments (student_id, course_id, enrolled_at)
        VALUES (?, ?, datetime('now'))
      `).run(user_id, course_id);
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'TA already assigned to this course' });
      }
      throw e;
    }

    res.status(201).json({ message: `TA assigned to ${course.title}`, user_id, course_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
