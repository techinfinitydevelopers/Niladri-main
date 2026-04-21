const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'archive.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    instrument TEXT,
    avatar_initials TEXT,
    bio TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    otp_code TEXT,
    otp_expires_at TEXT,
    reset_token TEXT,
    reset_expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE,
    subtitle TEXT,
    description TEXT,
    instructor_id INTEGER REFERENCES users(id),
    instrument TEXT,
    level TEXT,
    category TEXT,
    tags TEXT DEFAULT '[]',
    cover_color TEXT,
    cover_accent TEXT,
    duration_weeks INTEGER,
    lesson_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER,
    type TEXT DEFAULT 'video',
    content_url TEXT,
    duration_minutes INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    course_id INTEGER REFERENCES courses(id),
    enrolled_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    progress_pct INTEGER DEFAULT 0,
    last_accessed_at TEXT,
    UNIQUE(student_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS lesson_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    lesson_id INTEGER REFERENCES lessons(id),
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    UNIQUE(student_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS sheet_music (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    composer TEXT,
    period TEXT,
    instrument TEXT,
    difficulty TEXT,
    file_path TEXT,
    preview_path TEXT,
    page_count INTEGER,
    uploaded_by INTEGER REFERENCES users(id),
    course_id INTEGER REFERENCES courses(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    course_id INTEGER REFERENCES courses(id),
    lesson_id INTEGER REFERENCES lessons(id),
    title TEXT,
    file_path TEXT,
    duration_seconds INTEGER,
    waveform_data TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS masterclasses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    instructor_id INTEGER REFERENCES users(id),
    scheduled_at TEXT,
    duration_minutes INTEGER,
    location TEXT,
    meeting_url TEXT,
    max_participants INTEGER,
    description TEXT,
    status TEXT DEFAULT 'upcoming'
  );

  CREATE TABLE IF NOT EXISTS masterclass_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    masterclass_id INTEGER REFERENCES masterclasses(id),
    student_id INTEGER REFERENCES users(id),
    registered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(masterclass_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    lesson_id INTEGER REFERENCES lessons(id),
    course_id INTEGER REFERENCES courses(id),
    recording_id INTEGER REFERENCES recordings(id),
    file_path TEXT,
    notes TEXT,
    grade TEXT,
    feedback TEXT,
    graded_by INTEGER REFERENCES users(id),
    submitted_at TEXT DEFAULT (datetime('now')),
    graded_at TEXT,
    status TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    attribution TEXT
  );

  CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY,
    s3_config TEXT DEFAULT '{}',
    smtp_config TEXT DEFAULT '{}',
    general_config TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    submission_type TEXT DEFAULT 'file',
    allowed_file_types TEXT DEFAULT '[]',
    max_file_size_mb INTEGER DEFAULT 10,
    max_score INTEGER DEFAULT 100,
    due_type TEXT DEFAULT 'relative',
    due_days INTEGER,
    due_date TEXT,
    is_required INTEGER DEFAULT 1,
    visible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Sprint 1+2: Learning core & communication
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    time_limit_minutes INTEGER,
    passing_score INTEGER DEFAULT 70,
    attempts_allowed INTEGER DEFAULT 3,
    randomize_questions INTEGER DEFAULT 0,
    show_answers_after INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'mcq',
    options TEXT DEFAULT '[]',
    correct_answer TEXT,
    points INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    audio_url TEXT,
    explanation TEXT
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    answers TEXT DEFAULT '{}',
    score INTEGER,
    passed INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    time_taken_seconds INTEGER
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    created_by INTEGER NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS thread_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(thread_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    attachment_path TEXT,
    read_by TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    practice_goal_minutes INTEGER DEFAULT 60,
    phone TEXT,
    location TEXT,
    social_links TEXT DEFAULT '{}',
    notification_prefs TEXT DEFAULT '{"email":true,"inapp":true,"graded":true,"messages":true,"masterclass":true}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Sprint 3: Analytics & engagement
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    piece TEXT,
    composer TEXT,
    course_id INTEGER,
    focus_area TEXT,
    quality_rating INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'personal',
    start_datetime TEXT NOT NULL,
    end_datetime TEXT,
    all_day INTEGER DEFAULT 0,
    color TEXT DEFAULT '#8B2E26',
    related_id INTEGER,
    related_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Sprint 4+5+6: Monetisation, growth, scale
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    amount_paise INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'created',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    issued_at TEXT DEFAULT (datetime('now')),
    certificate_number TEXT UNIQUE,
    pdf_path TEXT,
    UNIQUE(student_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    masterclass_id INTEGER,
    course_id INTEGER,
    instructor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    meeting_url TEXT,
    meeting_id TEXT,
    status TEXT DEFAULT 'scheduled',
    recording_url TEXT,
    max_participants INTEGER DEFAULT 50,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS live_session_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT,
    left_at TEXT,
    UNIQUE(session_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    instructor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    send_email INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    lesson_id INTEGER,
    uploaded_by INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes INTEGER,
    category TEXT DEFAULT 'general',
    is_public INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    variables TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT,
    status TEXT DEFAULT 'sent',
    error TEXT,
    sent_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    body TEXT,
    cover_image TEXT,
    author_id INTEGER REFERENCES users(id),
    category TEXT DEFAULT 'general',
    tags TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    published_at TEXT,
    views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations — safe to run on existing DBs
const migrations = [
  `ALTER TABLE courses ADD COLUMN price_paise INTEGER DEFAULT 0`,
  `ALTER TABLE courses ADD COLUMN is_paid INTEGER DEFAULT 0`,
  `ALTER TABLE courses ADD COLUMN slug TEXT`,
  `ALTER TABLE courses ADD COLUMN tags TEXT DEFAULT '[]'`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch(e) { /* column already exists */ }
}

// Back-fill slugs for existing courses that have none
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const unslugged = db.prepare("SELECT id, title FROM courses WHERE slug IS NULL OR slug = ''").all();
const slugUpdate = db.prepare("UPDATE courses SET slug = ? WHERE id = ?");
for (const row of unslugged) {
  let base = slugify(row.title);
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT id FROM courses WHERE slug = ? AND id != ?").get(slug, row.id)) {
    slug = `${base}-${n++}`;
  }
  slugUpdate.run(slug, row.id);
}

// Seed data only if tables are empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const hash = bcrypt.hashSync('password123', 10);
  const adminHash = bcrypt.hashSync('admin@tfr2024', 10);

  const userInsert = db.prepare(`
    INSERT INTO users (email, password_hash, first_name, last_name, role, instrument, avatar_initials, bio, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // ── Admin account ──
  const admin = userInsert.run(
    'admin@thefoundationroom.in', adminHash, 'TFR', 'Admin',
    'admin', null, 'AD',
    'Platform administrator for The Foundation Room.',
    1
  );

  // ── Demo student ──
  const student = userInsert.run(
    'student@thefoundationroom.in', hash, 'Arjun', 'Sharma',
    'student', 'Sitar', 'AS',
    'Passionate student of Hindustani classical music from Pune.',
    1
  );
  const studentId = student.lastInsertRowid;

  // ── TFR Instructors ──
  const niladri = userInsert.run('niladri@thefoundationroom.in', hash,
    'Niladri', 'Kumar', 'instructor', 'Sitar', 'NK',
    'Niladri Kumar is one of India\'s foremost sitar virtuosos, son of the legendary Pandit Kartick Kumar. A recipient of the National Film Award and countless accolades, he has redefined the sitar for a global audience while remaining deeply rooted in the Imdadkhani gharana tradition.',
    1);

  const taufiq = userInsert.run('taufiq@thefoundationroom.in', hash,
    'Taufiq', 'Qureshi', 'instructor', 'Djembe & Percussions', 'TQ',
    'Taufiq Qureshi is a rhythmic genius and the son of the iconic Ustad Alla Rakha. Brother of tabla maestro Zakir Hussain, Taufiq has pioneered the fusion of Indian classical percussion with world music, creating a unique rhythmic language that transcends boundaries.',
    1);

  const sveta = userInsert.run('sveta@thefoundationroom.in', hash,
    'Sveta', 'Kilpady', 'instructor', 'Hindustani Vocals', 'SK',
    'Sveta Kilpady is a celebrated Hindustani classical vocalist trained in the Kirana gharana. Her voice carries the rare combination of technical rigour and emotional depth, making her one of the most sought-after teachers of classical and semi-classical music.',
    1);

  const sangeeta = userInsert.run('sangeeta@thefoundationroom.in', hash,
    'Guruma Sangeeta', 'Sinha', 'instructor', 'Kathak', 'GS',
    'Guruma Sangeeta Sinha is a Kathak exponent of the Lucknow gharana, trained under the legendary Pandit Birju Maharaj. Her dance carries the grace, rhythm, and storytelling tradition of classical Kathak, and she has been teaching for over three decades.',
    1);

  const milind = userInsert.run('milind@thefoundationroom.in', hash,
    'Milind', 'Singh', 'instructor', 'Film Songs', 'MS',
    'Milind Singh is one of Bollywood\'s most prolific playback singers, with hundreds of songs spanning three decades of Hindi cinema. His rich baritone and effortless style have made him a favourite of composers and audiences alike.',
    1);

  const makarand = userInsert.run('makarand@thefoundationroom.in', hash,
    'Makarand', 'Deshpande', 'instructor', 'Acting & Writing', 'MD',
    'Makarand Deshpande is one of India\'s most celebrated playwright-actors, known for his intense, transformative approach to theatre and screen. His Writer\'s Room sessions are legendary — raw, unscripted, and deeply illuminating for anyone serious about storytelling.',
    1);

  // ── TFR Courses ──
  const courseInsert = db.prepare(`
    INSERT INTO courses (title, slug, subtitle, description, instructor_id, instrument, level, category, tags, cover_color, cover_accent, duration_weeks, lesson_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const course1 = courseInsert.run(
    'Sitar — The Complete Foundation',
    'sitar-the-complete-foundation',
    'From first notes to raga mastery',
    'An immersive journey into the world of the sitar under Niladri Kumar\'s direct mentorship. Beginning with instrument anatomy, correct posture, and meend (glide) technique, students progress through foundational ragas in the Imdadkhani gharana tradition. Live sessions include real-time corrections, dedicated riyaz modules, and performance recordings reviewed by Niladri himself.',
    niladri.lastInsertRowid, 'Sitar', 'Foundation', 'Sitar',
    '["Hindustani Classical","Raga","Imdadkhani Gharana","Beginner Friendly"]',
    '#1A0D00', '#C8A84B', 16, 32, 'active'
  );

  const course2 = courseInsert.run(
    'Djembe & World Percussions',
    'djembe-world-percussions',
    'Rhythm as a universal language',
    'Taufiq Qureshi opens the world of rhythm in this extraordinary course blending Djembe, tabla bols, and world percussion traditions. Students learn polyrhythmic patterns, groove construction, and the meditative quality of deep listening. Suitable for complete beginners and practising musicians alike who want to awaken their inner rhythm.',
    taufiq.lastInsertRowid, 'Djembe', 'Foundation', 'Percussion',
    '["World Music","Rhythm","Tabla","Polyrhythm","Beginner Friendly"]',
    '#001A08', '#C8A84B', 12, 24, 'active'
  );

  const course3 = courseInsert.run(
    'Hindustani Vocals — Kirana Gharana',
    'hindustani-vocals-kirana-gharana',
    'The science and art of the classical voice',
    'Train your voice under Sveta Kilpady in the tradition of the Kirana gharana. This course covers sur (pitch), layakari (rhythm), raga grammar, and the art of khayal and thumri. Students receive personalized feedback on their practice recordings and participate in live group mehfils each month.',
    sveta.lastInsertRowid, 'Vocals', 'Intermediate', 'Vocals',
    '["Khayal","Thumri","Raga","Sur","Kirana Gharana"]',
    '#1A0014', '#C8A84B', 20, 40, 'active'
  );

  const course4 = courseInsert.run(
    'Kathak — Lucknow Gharana',
    'kathak-lucknow-gharana',
    'Grace, rhythm and storytelling in motion',
    'Guruma Sangeeta Sinha guides students through the graceful Lucknow style of Kathak — from foundational tatkar (footwork) and hastas (hand gestures) to full compositions and thumri abhinaya. Each module is structured around a thematic rasa, bringing together the technical and expressive dimensions of the dance.',
    sangeeta.lastInsertRowid, 'Kathak', 'Foundation', 'Dance',
    '["Classical Dance","Tatkar","Abhinaya","Lucknow Gharana","Thumri"]',
    '#001A1A', '#C8A84B', 24, 48, 'active'
  );

  const course5 = courseInsert.run(
    'Film Songs — The Playback Art',
    'film-songs-the-playback-art',
    'Singing for the camera and microphone',
    'Milind Singh demystifies the world of Bollywood playback singing in this practical, studio-oriented course. Learn mic technique, breath control for recording, stylistic interpretation of film songs across eras, and how to prepare for studio sessions. Includes exclusive behind-the-scenes insights from three decades of Hindi film music.',
    milind.lastInsertRowid, 'Vocals', 'Intermediate', 'Film Songs',
    '["Bollywood","Playback Singing","Studio","Mic Technique","Film Music"]',
    '#1A1000', '#C8A84B', 12, 24, 'active'
  );

  const course6 = courseInsert.run(
    'Writer\'s Room with Makarand Deshpande',
    'writers-room-makarand-deshpande',
    'Find your voice. Tell your truth.',
    'Makarand Deshpande\'s Writer\'s Room is unlike any writing course you\'ve experienced. Part masterclass, part therapy, part performance — these live sessions push actors, writers and storytellers to excavate their deepest material and transform it into compelling work. Absolutely no prior writing experience required.',
    makarand.lastInsertRowid, 'Writing', 'Foundation', 'Acting',
    '["Scriptwriting","Theatre","Storytelling","Performance","Acting"]',
    '#0A0A1A', '#C8A84B', 10, 20, 'active'
  );

  const c1 = course1.lastInsertRowid;
  const c2 = course2.lastInsertRowid;
  const c3 = course3.lastInsertRowid;
  const c4 = course4.lastInsertRowid;

  // ── Chapters & Lessons: Sitar Foundation ──
  const chapterInsert = db.prepare(`INSERT INTO chapters (course_id, title, order_index, description) VALUES (?, ?, ?, ?)`);
  const lessonInsert = db.prepare(`INSERT INTO lessons (chapter_id, course_id, title, order_index, type, content_url, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const s1 = chapterInsert.run(c1, 'Welcome to the Sitar', 1, 'Orientation, instrument anatomy and Niladri\'s philosophy');
  lessonInsert.run(s1.lastInsertRowid, c1, 'Welcome from Niladri Kumar', 1, 'video', null, 10);
  lessonInsert.run(s1.lastInsertRowid, c1, 'Anatomy of the Sitar', 2, 'reading', null, 15);
  lessonInsert.run(s1.lastInsertRowid, c1, 'Setting Up Your Riyaz Space', 3, 'video', null, 12);

  const s2 = chapterInsert.run(c1, 'Posture & Right Hand (Mizrab)', 2, 'Correct sitting position and Da-Ra stroke technique');
  lessonInsert.run(s2.lastInsertRowid, c1, 'Baithak: The Classical Sitting Posture', 1, 'video', null, 18);
  lessonInsert.run(s2.lastInsertRowid, c1, 'The Mizrab: Wearing and Holding', 2, 'video', null, 14);
  lessonInsert.run(s2.lastInsertRowid, c1, 'Da-Ra Strokes on Open String', 3, 'exercise', null, 25);

  const s3 = chapterInsert.run(c1, 'Left Hand & Meend', 3, 'Finger placement, fret navigation and the glide technique');
  lessonInsert.run(s3.lastInsertRowid, c1, 'Left Hand Position & Finger Strength', 1, 'video', null, 20);
  lessonInsert.run(s3.lastInsertRowid, c1, 'Meend: The Soul of the Sitar', 2, 'video', null, 30);
  lessonInsert.run(s3.lastInsertRowid, c1, 'Meend Exercise — Sa to Ga', 3, 'exercise', null, 20);

  const s4 = chapterInsert.run(c1, 'Raga Yaman — Your First Raga', 4, 'Introduction to Kalyan thaat and Raga Yaman');
  lessonInsert.run(s4.lastInsertRowid, c1, 'Raga Yaman: Grammar & Mood', 1, 'video', null, 25);
  lessonInsert.run(s4.lastInsertRowid, c1, 'Alaap in Yaman — Purvang', 2, 'video', null, 35);
  lessonInsert.run(s4.lastInsertRowid, c1, 'Alaap in Yaman — Uttarang', 3, 'video', null, 35);
  lessonInsert.run(s4.lastInsertRowid, c1, 'Gat in Teentaal', 4, 'video', null, 40);

  // ── Chapters & Lessons: Djembe & World Percussions ──
  const d1 = chapterInsert.run(c2, 'The World of Rhythm', 1, 'Taufiq\'s philosophy, percussion families and listening practice');
  lessonInsert.run(d1.lastInsertRowid, c2, 'Welcome: Why Rhythm Heals', 1, 'video', null, 12);
  lessonInsert.run(d1.lastInsertRowid, c2, 'The Djembe: History & Construction', 2, 'reading', null, 15);
  lessonInsert.run(d1.lastInsertRowid, c2, 'Active Listening: Rhythms of the World', 3, 'video', null, 20);

  const d2 = chapterInsert.run(c2, 'Djembe Fundamentals', 2, 'Bass, tone, slap and hand technique');
  lessonInsert.run(d2.lastInsertRowid, c2, 'Holding & Sitting Position', 1, 'video', null, 14);
  lessonInsert.run(d2.lastInsertRowid, c2, 'The Three Core Sounds: Bass, Tone, Slap', 2, 'video', null, 30);
  lessonInsert.run(d2.lastInsertRowid, c2, 'Alternating Hands Exercise', 3, 'exercise', null, 25);

  const d3 = chapterInsert.run(c2, 'Indian Rhythm — Taal & Bols', 3, 'Tabla bols, Teentaal and Dadra applied to hand percussion');
  lessonInsert.run(d3.lastInsertRowid, c2, 'Understanding Taal: The Indian Time Cycle', 1, 'video', null, 22);
  lessonInsert.run(d3.lastInsertRowid, c2, 'Teentaal on Djembe', 2, 'video', null, 28);
  lessonInsert.run(d3.lastInsertRowid, c2, 'Polyrhythm: 3 Against 4', 3, 'exercise', null, 30);

  // ── Enrollments: demo student in Sitar + Djembe ──
  const enrollInsert = db.prepare(`INSERT OR IGNORE INTO enrollments (student_id, course_id, progress_pct, last_accessed_at) VALUES (?, ?, ?, datetime('now'))`);
  enrollInsert.run(studentId, c1, 65);
  enrollInsert.run(studentId, c2, 28);

  // ── Sheet Music (TFR-relevant) ──
  const sheetInsert = db.prepare(`INSERT INTO sheet_music (title, composer, period, instrument, difficulty, page_count, uploaded_by, course_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  sheetInsert.run('Raga Yaman — Alaap & Gat Notation', 'Niladri Kumar', 'Contemporary', 'Sitar', 'Foundation', 8, niladri.lastInsertRowid, c1);
  sheetInsert.run('Raga Bhairav — Morning Raga Notations', 'Traditional (Imdadkhani Gharana)', 'Classical', 'Sitar', 'Intermediate', 12, niladri.lastInsertRowid, c1);
  sheetInsert.run('Dadra Taal — Hand Percussion Chart', 'Taufiq Qureshi', 'Contemporary', 'Percussion', 'Foundation', 4, taufiq.lastInsertRowid, c2);
  sheetInsert.run('Teentaal Compositions — Djembe Notation', 'Taufiq Qureshi', 'Contemporary', 'Percussion', 'Intermediate', 6, taufiq.lastInsertRowid, c2);
  sheetInsert.run('Raag Darbari Kanada — Bandish Notation', 'Traditional (Kirana Gharana)', 'Classical', 'Vocals', 'Intermediate', 10, sveta.lastInsertRowid, c3);
  sheetInsert.run('Teentaal Thumri — Notation & Lyrics', 'Traditional', 'Classical', 'Vocals', 'Advanced', 8, sveta.lastInsertRowid, c3);

  // ── Masterclasses ──
  const mcInsert = db.prepare(`INSERT INTO masterclasses (title, instructor_id, scheduled_at, duration_minutes, location, meeting_url, max_participants, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  mcInsert.run(
    'Raga Grammar: Unlocking the Language of Indian Music',
    niladri.lastInsertRowid, '2026-05-10 16:00:00', 90,
    'Online via Zoom', 'https://zoom.us/j/tfr-niladri-001', 25,
    'Niladri Kumar opens the deep grammar of Indian ragas — how each raga has its own personality, time of day, season, and emotional world. Students may submit short sitar or vocal recordings for live feedback.',
    'upcoming'
  );
  mcInsert.run(
    'The Rhythm Within: Discovering Your Inner Pulse',
    taufiq.lastInsertRowid, '2026-05-24 17:00:00', 120,
    'Online via Zoom', 'https://zoom.us/j/tfr-taufiq-001', 30,
    'A transformative session with Taufiq Qureshi on rhythm as a meditative practice. We will explore polyrhythms, silence, and the space between beats. No instrument required — just your hands and an open mind.',
    'upcoming'
  );
  mcInsert.run(
    'Sur Sadhana: The Daily Practice of the Classical Voice',
    sveta.lastInsertRowid, '2026-06-14 10:00:00', 90,
    'The Foundation Room Studio, Mumbai', null, 20,
    'Sveta Kilpady shares her daily sadhana practice — the riyaz routines, swara exercises, and meditative approach to maintaining and deepening the classical voice over decades. Open Q&A included.',
    'upcoming'
  );
  mcInsert.run(
    'Kathak Abhinaya: The Art of Expression',
    sangeeta.lastInsertRowid, '2026-07-05 15:00:00', 90,
    'Online via Zoom', 'https://zoom.us/j/tfr-sangeeta-001', 20,
    'Guruma Sangeeta Sinha explores the expressive dimension of Kathak — how a single gesture (mudra) can tell an entire story. This masterclass covers abhinaya, nava rasa, and the poetry behind the movement.',
    'upcoming'
  );

  // ── Quotes (Indian classical music & arts) ──
  const quoteInsert = db.prepare(`INSERT INTO quotes (text, attribution) VALUES (?, ?)`);
  quoteInsert.run('Music is the medicine of the mind.', 'John A. Logan');
  quoteInsert.run('Nada Brahma — Sound is God. The universe is vibration.', 'Ancient Vedic Teaching');
  quoteInsert.run('Without music, life would be a mistake.', 'Friedrich Nietzsche');
  quoteInsert.run('The sitar speaks what words cannot. It reaches where language ends.', 'Pandit Ravi Shankar');
  quoteInsert.run('Rhythm is the soul of life. The whole universe revolves in rhythm. Everything and every human action revolves in rhythm.', 'Babatunde Olatunji');
  quoteInsert.run('Music gives a soul to the universe, wings to the mind, flight to the imagination, and life to everything.', 'Plato');
  quoteInsert.run('To play without passion is inexcusable.', 'Ludwig van Beethoven');
  quoteInsert.run('A raga is not a scale, not a mode, but the quintessence of a melody.', 'Pandit Vishnu Narayan Bhatkhande');
  quoteInsert.run('The dancer\'s body is simply the luminous manifestation of the soul.', 'Isadora Duncan');
  quoteInsert.run('One good thing about music: when it hits you, you feel no pain.', 'Bob Marley');
  quoteInsert.run('Sur, laya, taal — pitch, tempo, rhythm. Master these three and music will speak through you.', 'Ustad Bismillah Khan');
  quoteInsert.run('Every raga is a universe. Learning one properly takes a lifetime. And it is worth every moment.', 'Niladri Kumar');

  // ── App config row ──
  db.prepare(`INSERT OR IGNORE INTO app_config (id, s3_config, smtp_config, general_config) VALUES (1, '{}', '{}', '{"school_name":"The Foundation Room","tagline":"Where Music Begins"}')`)
    .run();

  console.log('✅ The Foundation Room database seeded successfully.');
}

module.exports = db;
