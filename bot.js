const TelegramBot = require("node-telegram-bot-api");
const { TOKEN, CHANNEL_USERNAME } = require("./config");

const bot = new TelegramBot(TOKEN, { polling: true });

const pendingAlbums = {}; // Для постов, ожидающих действия пользователя
const albumBuffer = {}; // Буфер для сбора фото из одного альбома (media_group_id)
const scheduledPosts = []; // Запланированные посты

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

const times = ["11:00", "16:00", "20:00"];

// Функция для получения времени в часовом поясе UTC+3 (Москва)
function getMoscowTime(date = new Date()) {
  const moscowOffset = 3 * 60;
  return new Date(
    date.getTime() + (moscowOffset + date.getTimezoneOffset()) * 60000
  );
}

function isDayFullyBooked(y, m, d) {
  const takenSlots = scheduledPosts
    .filter((post) => {
      const t = post.time;
      return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
    })
    .map((post) => {
      return `${String(post.time.getHours()).padStart(2, "0")}:${String(
        post.time.getMinutes()
      ).padStart(2, "0")}`;
    });

  return times.every((slot) => takenSlots.includes(slot));
}

function buildDateKeyboard(year, month, startDay = 1) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const keyboard = [];

  for (let i = startDay; i <= daysInMonth; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysInMonth; j++) {
      const fullyBooked = isDayFullyBooked(year, month, j);
      row.push({
        text: fullyBooked ? `${j} ❌` : `${j}`,
        callback_data: `date_${year}_${month}_${j}`,
      });
    }
    if (row.length) keyboard.push(row);
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
  const now = getMoscowTime();
  const isToday =
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day;

  const busyTimes = new Set();
  for (const post of scheduledPosts) {
    const postDate = post.time;
    if (
      postDate.getFullYear() === year &&
      postDate.getMonth() === month &&
      postDate.getDate() === day
    ) {
      const h = postDate.getHours();
      const m = postDate.getMinutes();
      busyTimes.add(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }

  const fullyBooked = times.every((time) => busyTimes.has(time));

  if (fullyBooked) {
    return {
      reply_markup: {
        inline_keyboard: [[{ text: "⌚ Ввести вручную", callback_data: "manual_time" }]],
      },
    };
  }

  const availableTimes = times
    .filter((time) => {
      if (!isToday) return true;
      const [h, m] = time.split(":").map(Number);
      return new Date(year, month, day, h, m) > now;
    })
    .filter((time) => !busyTimes.has(time));

  const buttons = availableTimes.map((time) => ({
    text: time,
    callback_data: `time_${time.replace(":", "_")}`,
  }));

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  rows.push([{ text: "⌚ Ввести вручную", callback_data: "manual_time" }]);

  return {
    reply_markup: { inline_keyboard: rows },
  };
}

// Таймер публикации - проверяет каждые 60 секунд, публикует посты по расписанию
setInterval(async () => {
  const now = getMoscowTime();
  for (const post of [...scheduledPosts]) {
    if (now >= post.time && !post.posted) {
      try {
        const mediaGroup = post.photos.map((photo, index) => ({
          ...photo,
          caption: index === 0 ? post.caption : undefined,
          parse_mode: index === 0 ? "HTML" : undefined,
        }));

        await bot.sendMediaGroup(CHANNEL_USERNAME, mediaGroup);
        post.posted = true;
        console.log("✅ Пост опубликован:", post.time.toISOString());
      } catch (err) {
        console.error("Ошибка при публикации:", err);
      }
    }
  }
}, 60 * 1000);

// === ВСТАВКА: Обработка входящих сообщений с командами /start и /schedule ===
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Команда /start - вывод меню команд
  if (msg.text === "/start") {
    return bot.sendMessage(
      chatId,
      "Привет! Вот что я умею:\n" +
        "/start - показать это сообщение\n" +
        "/time - показать московское время\n" +
        "/schedule - показать список твоих запланированных постов"
    );
  }

  // Команда /schedule - вывод списка запланированных постов текущего пользователя
  if (msg.text === "/schedule") {
    const userPosts = scheduledPosts.filter(
      (post) => post.userId === userId && !post.posted
    );
    if (userPosts.length === 0) {
      return bot.sendMessage(chatId, "У тебя нет запланированных постов.");
    }
    let response = "📅 Твои запланированные посты:\n";
    for (const post of userPosts) {
      const dateStr = `${post.time.getDate()} ${monthsRu[post.time.getMonth()]} ${post.time.getFullYear()} ${String(post.time.getHours()).padStart(2, "0")}:${String(post.time.getMinutes()).padStart(2, "0")}`;
      response += `• ${dateStr} — ${post.caption || "(без текста)"}\n`;
    }
    return bot.sendMessage(chatId, response);
  }

  // Команда /time - показать локальное время (Московское)
  if (msg.text === "/time") {
    const now = getMoscowTime();
    return bot.sendMessage(
      chatId,
      `⏰ Текущее московское время:\n${now.toISOString().replace("Z", "")}`
    );
  }

  // --- Здесь идет твоя текущая логика для фото и альбомов ---

  if (msg.media_group_id && msg.photo) {
    const groupId = msg.media_group_id;

    if (!albumBuffer[groupId]) {
      albumBuffer[groupId] = {
        photos: [],
        caption: msg.caption || "",
        chatId,
        userId,
        timeout: null,
      };
    }

    albumBuffer[groupId].photos.push({
      type: "photo",
      media: msg.photo[msg.photo.length - 1].file_id,
    });

    if (msg.caption) {
      albumBuffer[groupId].caption = msg.caption;
    }

    clearTimeout(albumBuffer[groupId].timeout);
    albumBuffer[groupId].timeout = setTimeout(() => {
      pendingAlbums[userId] = {
        photos: albumBuffer[groupId].photos,
        caption: albumBuffer[groupId].caption,
        chatId: albumBuffer[groupId].chatId,
        userId, // === ВАЖНО: добавляем userId для фильтрации расписания
      };
      delete albumBuffer[groupId];

      bot.sendMessage(chatId, "Что хотите сделать?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📅 Выбрать дату", callback_data: "choose_date" }],
            [{ text: "🚀 Опубликовать сразу", callback_data: "post_now" }],
          ],
        },
      });
    }, 1000);
    return;
  }

  if (msg.photo && !msg.media_group_id) {
    pendingAlbums[userId] = {
      photos: [
        {
          type: "photo",
          media: msg.photo[msg.photo.length - 1].file_id,
        },
      ],
      caption: msg.caption || "",
      chatId,
      userId, // === ВАЖНО: добавляем userId для фильтрации расписания
    };

    await bot.sendMessage(chatId, "Что хотите сделать?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 Выбрать дату", callback_data: "choose_date" }],
          [{ text: "🚀 Опубликовать сразу", callback_data: "post_now" }],
        ],
      },
    });
    return;
  }

  if (pendingAlbums[userId]?.awaitingTimeInput) {
    const time = msg.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return bot.sendMessage(chatId, "Введите время в формате ЧЧ:ММ");
    }

    const [h, m] = time.split(":").map(Number);
    const date = pendingAlbums[userId].scheduledDate;
    const dateObj = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      h,
      m
    );

    scheduledPosts.push({
      ...pendingAlbums[userId],
      time: dateObj,
      posted: false,
      userId, // === ВАЖНО: добавляем userId
    });

    delete pendingAlbums[userId];
    return bot.sendMessage(
      chatId,
      `✅ Пост запланирован на ${date.toDateString()} в ${time}`
    );
  }
});

// === ВСТАВКА: Обработка inline-кнопок с улучшениями ===
bot.on("callback_query", async (query) => {
  try {
    await bot.answerCallbackQuery(query.id);
    const data = query.data;
    const userId = query.from.id;
    const chatId = query.message.chat.id;

    if (!pendingAlbums[userId]) return;

    if (data === "ignore") return;

    if (data === "post_now") {
      const mediaGroup = pendingAlbums[userId].photos.map((photo, index) => ({
        ...photo,
        caption: index === 0 ? pendingAlbums[userId].caption : undefined,
        parse_mode: index === 0 ? "HTML" : undefined,
      }));

      await bot.sendMediaGroup(CHANNEL_USERNAME, mediaGroup);
      delete pendingAlbums[userId];
      await bot.sendMessage(chatId, "✅ Пост опубликован сразу.");
      return;
    }

    if (data === "choose_date") {
      const now = getMoscowTime();
      await bot.sendMessage(
        chatId,
        "Выберите дату:",
        buildDateKeyboard(now.getFullYear(), now.getMonth(), now.getDate())
      );
      return;
    }

    if (data.startsWith("date_")) {
      const [, y, m, d] = data.split("_").map(Number);
      pendingAlbums[userId].scheduledDate = new Date(y, m, d);
      await bot.sendMessage(chatId, "Выберите время:", buildTimeKeyboard(y, m, d));
      return;
    }

    if (data.startsWith("time_")) {
      const [hour, minute] = data.split("_").slice(1).map(Number);
      const date = pendingAlbums[userId].scheduledDate;
      const dateObj = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hour,
        minute
      );

      scheduledPosts.push({
        ...pendingAlbums[userId],
        time: dateObj,
        posted: false,
        userId, // === ВАЖНО: добавляем userId
      });

      delete pendingAlbums[userId];
      await bot.sendMessage(
        chatId,
        `✅ Пост запланирован на ${date.toDateString()} в ${hour}:${minute}`
      );
      return;
    }

    if (data === "manual_time") {
      pendingAlbums[userId].awaitingTimeInput = true;
      await bot.sendMessage(chatId, "Введите время (ЧЧ:ММ):");
      return;
    }
  } catch (error) {
    console.error("Ошибка в callback_query:", error);
  }
});



