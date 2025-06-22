const mysql = require("mysql2/promise");

// Конфигурация подключения к БД Beget
const pool = mysql.createPool({
  host: "oscar2xk.beget.tech", // сервер для внешних подключений (см. твои данные)
  user: "oscar2xk_myteleg", // имя пользователя базы
  password: "125896Oscar", // пароль к базе данных
  database: "oscar2xk_myteleg", // имя базы данных
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
