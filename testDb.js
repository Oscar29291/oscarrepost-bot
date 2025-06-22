const pool = require("./db");

async function testInsert() {
  try {
    const sql = `INSERT INTO scheduled_posts (chat_id, message_text, media_link, scheduled_time) VALUES (?, ?, ?, ?)`;
    const values = [
      "123456", // Пример chat_id
      "Тестовое сообщение", // Текст сообщения
      "https://example.com/photo.jpg", // Ссылка на медиа
      new Date(Date.now() + 3600000), // Время через 1 час от текущего момента
    ];

    const [result] = await pool.execute(sql, values);
    console.log("Запись успешно добавлена. ID:", result.insertId);
  } catch (err) {
    console.error("Ошибка при вставке в базу:", err.message);
  }
}

testInsert();
