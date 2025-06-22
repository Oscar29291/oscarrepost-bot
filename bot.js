const TelegramBot = require("node-telegram-bot-api");
const mysql = require("mysql2/promise");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjQ7d3oUBjL5FM";
const CHANNEL_USERNAME = "@diz673";

const bot = new TelegramBot(TOKEN, { polling: true });
const pendingAlbums = {};

const monthsRu = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Создаем пул подключений к MySQL (параметры берутся из переменных окружения Railway)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Функция добавления нового запланированного поста в базу
async function addScheduledPost(userId, caption, photos, scheduledDateTime) {
  const dateStr = scheduledDateTime.toISOString().split("T")[0]; // 'YYYY-MM-DD'
  const timeStr = scheduledDateTime.toTimeString().slice(0, 5); // 'HH:MM'
  const photosJson = JSON.stringify(photos);

  await pool.query(
    "INSERT INTO schedule (user_id, caption, photos, date, time, posted) VALUES (?, ?, ?, ?, ?, 0)",
    [userId, caption, photosJson, dateStr, timeStr]
  );
}

// Функция загрузки всех непросмотренных (неопубликованных) постов из базы
async function loadSchedule() {
  const [rows] = await pool.query("SELECT * FROM schedule WHERE posted = 0");
  return rows;
}

// Таймер проверяет каждую минуту, что пора публиковать
setInterval(async () => {
  const now = new Date();
  const schedule = await loadSchedule();

  for (const post of schedule) {
    const postTime = new Date(`${post.date}T${post.time}:00`);
    if (now >= postTime && !post.posted) {
      try {
        const photos = JSON.parse(post.photos);
        await bot.sendMediaGroup(CHANNEL_USERNAME, photos);

        // Обновляем статус в базе - опубликован
        await pool.query("UPDATE schedule SET posted = 1 WHERE id = ?", [
          post.id,
        ]);
      } catch (err) {
        console.error("Ошибка публикации:", err);
      }
    }
  }
}, 60 * 1000);

// --- Все функции для создания inline клавиатур, выбора даты и времени ---

function buildDateKeyboard(year, month, startDay = 1) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const keyboard = [];

  for (let i = startDay; i <= daysInMonth; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysInMonth; j++) {
      row.push({
        text: j.toString(),
        callback_data: `date_${year}_${month}_${j}`,
      });
    }
    keyboard.push(row);
  }

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${monthsRu[month]} ${year}`, callback_data: "ignore" }],
        ...keyboard,
      ],
    },
  };
}

function buildTimeKeyboard(year, month, day) {
  const now = new Date();
  const isToday =
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day;
  const times = ["11:00", "16:00", "20:00"];

  const buttons = times
    .filter((time) => {
      if (!isToday) return true;
      const [h, m] = time.split(":").map(Number);
      const slotTime = new Date(year, month, day, h, m);
      return slotTime > now;
    })
    .map((time) => ({
      text: time,
      callback_data: `time_${time.replace(":", "_")}`,
    }));

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  rows.push([
    { text: "⌚ Ввести время вручную", callback_data: "manual_time" },
  ]);

  return {
    reply_markup: {
      inline_keyboard: rows,
    },
  };
}

// --- Обработчик сообщений пользователя ---

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.photo) {
    if (!pendingAlbums[userId]) {
      pendingAlbums[userId] = {
        photos: [],
        caption: msg.caption || "",
        chatId,
      };
    }

    pendingAlbums[userId].photos.push({
      type: "photo",
      media: msg.photo[msg.photo.length - 1].file_id,
    });

    if (msg.caption) {
      pendingAlbums[userId].caption = msg.caption;
    }

    await bot.sendMessage(chatId, "Что хотите сделать?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 Выбрать дату", callback_data: "choose_date" }],
          [{ text: "🚀 Опубликовать сейчас", callback_data: "post_now" }],
        ],
      },
    });
  }

  // Обработка ручного ввода времени (если выбрали "ввести вручную")
  if (pendingAlbums[userId]?.awaitingTimeInput) {
    const time = msg.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return bot.sendMessage(
        chatId,
        "Неверный формат времени. Введите в формате ЧЧ:ММ"
      );
    }

    const post = pendingAlbums[userId];
    const dateStr = `${post.scheduledDate.getFullYear()}-${String(
      post.scheduledDate.getMonth() + 1
    ).padStart(2, "0")}-${String(post.scheduledDate.getDate()).padStart(
      2,
      "0"
    )}`;

    const scheduledDateTime = new Date(`${dateStr}T${time}:00`);

    await addScheduledPost(
      userId,
      post.caption,
      post.photos,
      scheduledDateTime
    );

    delete pendingAlbums[userId];
    return bot.sendMessage(
      chatId,
      `✅ Пост запланирован на ${dateStr} в ${time}`
    );
  }
});

// --- Обработчик inline-кнопок ---

bot.on("callback_query", async (query) => {
  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;

  if (!pendingAlbums[userId])
    return bot.answerCallbackQuery(query.id, { text: "Нет активного поста." });

  if (data === "ignore") return bot.answerCallbackQuery(query.id);

  if (data === "post_now") {
    const post = pendingAlbums[userId];
    try {
      await bot.sendMediaGroup(CHANNEL_USERNAME, post.photos);
      delete pendingAlbums[userId];
      await bot.answerCallbackQuery(query.id);
      return bot.sendMessage(chatId, "✅ Пост опубликован сразу.");
    } catch (err) {
      console.error("Ошибка при публикации:", err);
      return bot.sendMessage(chatId, "❌ Ошибка при публикации.");
    }
  }

  if (data === "choose_date") {
    const now = new Date();
    await bot.sendMessage(
      chatId,
      "Выберите дату публикации:",
      buildDateKeyboard(now.getFullYear(), now.getMonth(), now.getDate())
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith("date_")) {
    const [, year, month, day] = data.split("_").map(Number);
    pendingAlbums[userId].scheduledDate = new Date(year, month, day);
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(
      chatId,
      "Выберите время публикации:",
      buildTimeKeyboard(year, month, day)
    );
  }

  if (data.startsWith("time_")) {
    const [, hour, minute] = data.split("_").slice(1);
    const post = pendingAlbums[userId];
    const date = post.scheduledDate;
    const dateStr = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const scheduledDateTime = new Date(`${dateStr}T${hour}:${minute}:00`);

    await addScheduledPost(
      userId,
      post.caption,
      post.photos,
      scheduledDateTime
    );

    delete pendingAlbums[userId];
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(
      chatId,
      `✅ Пост запланирован на ${dateStr} в ${hour}:${minute}`
    );
  }

  if (data === "manual_time") {
    pendingAlbums[userId].awaitingTimeInput = true;
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "Введите время публикации (ЧЧ:ММ):");
  }
});
