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
        inline_keyboard: [
          [{ text: "⌚ Ввести вручную", callback_data: "manual_time" }],
        ],
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

// Таймер публикации
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

// Обработка входящих сообщений и команд
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  // Главное меню команд при /start
  if (text === "/start") {
    const menuKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "/schedule" }],
          [{ text: "/time" }],
          [{ text: "/help" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
    return bot.sendMessage(chatId, "Привет! Выберите команду:", menuKeyboard);
  }

  // Команда /schedule — показать список запланированных постов
  if (text === "/schedule") {
    if (scheduledPosts.length === 0) {
      return bot.sendMessage(chatId, "📅 Запланированных постов нет.");
    }
    let message = "📅 Запланированные посты:\n\n";
    for (const post of scheduledPosts) {
      if (post.posted) continue;
      const t = post.time;
      message += `- ${t.getDate()} ${monthsRu[t.getMonth()]} ${t.getFullYear()} в ${String(
        t.getHours()
      ).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}\n`;
      message += post.caption ? `  ✏️ ${post.caption}\n` : "";
    }
    return bot.sendMessage(chatId, message);
  }

  // Команда /time - показать локальное время (Москва)
  if (text === "/time") {
    const now = getMoscowTime();
    return bot.sendMessage(
      chatId,
      `⏰ Текущее московское время:\n${now.toISOString().replace("Z", "")}`
    );
  }

  // Команда /help - список команд
  if (text === "/help") {
    return bot.sendMessage(
      chatId,
      `Доступные команды:
/start - Главное меню
/schedule - Список запланированных постов
/time - Текущее московское время
/help - Показать это сообщение`
    );
  }

  // Обработка фото (с альбомом и без)
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

  // Обработка ручного ввода времени для планирования
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
    });

    delete pendingAlbums[userId];
    return bot.sendMessage(
      chatId,
      `✅ Пост запланирован на ${date.toDateString()} в ${time}`
    );
  }
});

// Обработка inline-кнопок
bot.on("callback_query", async (query) => {
  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;

  if (!pendingAlbums[userId]) return bot.answerCallbackQuery(query.id);

  if (data === "ignore") return bot.answerCallbackQuery(query.id);

  if (data === "post_now") {
    try {
      const mediaGroup = pendingAlbums[userId].photos.map((photo, index) => ({
        ...photo,
        caption: index === 0 ? pendingAlbums[userId].caption : undefined,
        parse_mode: index === 0 ? "HTML" : undefined,
      }));

      await bot.sendMediaGroup(CHANNEL_USERNAME, mediaGroup);
      delete pendingAlbums[userId];
      return bot.sendMessage(chatId, "✅ Пост опубликован сразу.");
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, "❌ Ошибка при публикации.");
    }
  }

  if (data === "choose_date") {
    const now = getMoscowTime();
    return bot.sendMessage(
      chatId,
      "Выберите дату:",
      buildDateKeyboard(now.getFullYear(), now.getMonth(), now.getDate())
    );
  }

  if (data.startsWith("date_")) {
    const [, y, m, d] = data.split("_").map(Number);
    pendingAlbums[userId].scheduledDate = new Date(y, m, d);
    return bot.sendMessage(
      chatId,
      "Выберите время:",
      buildTimeKeyboard(y, m, d)
    );
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
    });

    delete pendingAlbums[userId];
    return bot.sendMessage(
      chatId,
      `✅ Пост запланирован на ${date.toDateString()} в ${hour}:${minute}`
    );
  }

  if (data === "manual_time") {
    pendingAlbums[userId].awaitingTimeInput = true;
    return bot.sendMessage(chatId, "Введите время (ЧЧ:ММ):");
  }
});


