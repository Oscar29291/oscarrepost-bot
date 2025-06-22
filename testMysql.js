const mysql = require("mysql2/promise");

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      // <-- добавил await
      host: "oscar2xk.beget.tech",
      user: "oscar2xk_myteleg",
      password: "125896Oscar",
      database: "oscar2xk_myteleg",
    });

    console.log("✅ Успешно подключились!");

    const [rows] = await connection.execute("SELECT 1");
    console.log("Запрос выполнен:", rows);

    await connection.end();
  } catch (err) {
    console.error("❌ Ошибка подключения к MySQL:", err.message);
  }
}

testConnection();
