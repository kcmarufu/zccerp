const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'root', database: 'finance_erp'
  });
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         INT PRIMARY KEY AUTO_INCREMENT,
        user_id    INT NOT NULL,
        title      VARCHAR(100) NOT NULL,
        message    VARCHAR(500) NOT NULL,
        type       VARCHAR(50)  NOT NULL DEFAULT 'info',
        entity_type VARCHAR(50) NULL,
        entity_id  INT NULL,
        link       VARCHAR(200) NULL,
        is_read    TINYINT(1)  NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
        INDEX idx_user_read    (user_id, is_read),
        INDEX idx_user_created (user_id, created_at),
        CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('notifications table created OK');
  } catch (e) {
    console.log('Result:', e.code || e.message);
  }
  await conn.end();
}

run();
