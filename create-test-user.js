import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const pool = new Pool({
  host: 'localhost',
  port: 5437,
  database: 'accounting_db',
  user: 'accounting_user',
  password: 'accounting_secure_pass_2024',
});

async function createTestUser() {
  console.log('🚀 Creating test users for ZirakBook Accounting...\n');

  const users = [
    { email: 'admin@zirakbook.com', password: 'admin123', role: 'SUPERADMIN', name: 'Admin User' },
    { email: 'demo@zirakbook.com', password: 'demo123', role: 'COMPANY_ADMIN', name: 'Demo User' },
    { email: 'test@zirakbook.com', password: 'test123', role: 'USER', name: 'Test User' },
  ];

  for (const user of users) {
    try {
      // Check if user exists
      const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [user.email]);

      if (checkResult.rows.length > 0) {
        console.log(`⚠️  User ${user.email} already exists, updating password...`);

        // Update password
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, user.email]);
        console.log(`✅ Updated password for ${user.email}`);
      } else {
        // Create new user
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const id = crypto.randomUUID();

        await pool.query(
          `INSERT INTO users (id, email, password, name, role, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [id, user.email, hashedPassword, user.name, user.role]
        );
        console.log(`✅ Created user: ${user.email} (${user.role})`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${user.email}:`, error.message);
    }
  }

  console.log('\n✅ User setup complete!\n');
  console.log('📋 Test Credentials:');
  console.log('─────────────────────────────────────────');
  users.forEach(u => {
    console.log(`${u.role.padEnd(15)} - ${u.email.padEnd(25)} / ${u.password}`);
  });

  await pool.end();
}

createTestUser().catch(console.error);
