const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const TOKEN = "ВАШ_ТОКЕН";
const CHANNEL_USERNAME = "@ваш_канал";
const SCHEDULE_FILE = path.join(__dirname, "schedule.json");

const bot = new TelegramBot(TOKEN, { polling: true });
const pendingAlbums = {};
const monthsRu = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// 🔄 Планировщик
setInterval(() => {
  const now = new Date();
  const schedule = loadSchedule();
  const toPost = schedule.filter(post => {
    const postTime = new Date(post.date + "T" + post.time);
    return now >= postTime && !post.posted;
  });

  toPost.forEach(async post => {
    try {
      await bot.sendMediaGroup(CHANNEL_USERNAME, post.photos);
      post.posted = true;
      saveSchedule(schedule);
    } catch (err) {
      console.error("Ошибка публикации:", err);
    }
  });
}, 60000);

function loadSchedule() {
  try {
    const data = fs.readFileSync(SCHEDULE_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveSchedule(data) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

// 📅 Клавиатура с датами
function buildDateKeyboard(year, month, startDay = 1) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const keyboard = [];

  for (let i = startDay; i <= daysInMonth; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysInMonth; j++) {
      row.push({ text: j.toString(), callback_data: `date_${year}_${month}_${j}` });
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

// 📤 Обработка фото
bot.on("message", async msg => {
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

    const now = new Date();
    await bot.sendMessage(chatId, "Выберите дату публикации:", buildDateKeyboard(
      now.getFullYear(), now.getMonth(), now.getDate()
    ));
  }

  // Ручной ввод времени
  if (pendingAlbums[userId]?.awaitingTimeInput) {
    const time = msg.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return bot.sendMessage(chatId, "⛔ Неверный формат. Введите время в формате ЧЧ:ММ");
    }

    const post = pendingAlbums[userId];
    const dateStr = `${post.scheduledDate.getFullYear()}-${String(post.scheduledDate.getMonth() + 1).padStart(2, "0")}-${String(post.scheduledDate.getDate()).padStart(2, "0")}`;

    saveSchedule([
      ...loadSchedule(),
      {
        date: dateStr,
        time: time,
        caption: post.caption,
        photos: post.photos,
        posted: false,
      },
    ]);

    delete pendingAlbums[userId];
    return bot.sendMessage(chatId, `✅ Пост запланирован на ${dateStr} в ${time}`);
  }
});

// ⏰ Обработка кнопок
bot.on("callback_query", async query => {
  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;

  if (!pendingAlbums[userId]) return bot.answerCallbackQuery(query.id, { text: "Нет активного поста" });
  if (data === "ignore") return bot.answerCallbackQuery(query.id);

  // Обработка выбора даты
  if (data.startsWith("date_")) {
    const [, year, month, day] = data.split("_").map(Number);
    const now = new Date();
    const chosenDate = new Date(year, month, day);
    pendingAlbums[userId].scheduledDate = chosenDate;

    await bot.answerCallbackQuery(query.id);

    const timeOptions = ["11:00", "16:00", "20:00"];
    const availableTimes = timeOptions.filter(timeStr => {
      if (
        now.getFullYear() === year &&
        now.getMonth() === month &&
        now.getDate() === day
      ) {
        const [h, m] = timeStr.split(":").map(Number);
        const postTime = new Date(year, month, day, h, m);
        return postTime > now;
      }
      return true;
    });

    availableTimes.push("ввести вручную");

    const timeButtons = availableTimes.map(time => [{
      text: time === "ввести вручную" ? "📝 Ввести вручную" : time,
      callback_data: time === "ввести вручную" ? "manual_time" : `time_${time}`,
    }]);

    if (timeButtons.length === 1) {
      return bot.sendMessage(chatId, "⛔ Сегодня уже все слоты прошли.");
    }

    return bot.sendMessage(chatId, "Выберите время публикации:", {
      reply_markup: { inline_keyboard: timeButtons },
    });
  }

  // Обработка выбора времени
  if (data.startsWith("time_")) {
    const time = data.split("_")[1];
    const post = pendingAlbums[userId];
    const dateStr = `${post.scheduledDate.getFullYear()}-${String(post.scheduledDate.getMonth() + 1).padStart(2, "0")}-${String(post.scheduledDate.getDate()).padStart(2, "0")}`;

    saveSchedule([
      ...loadSchedule(),
      {
        date: dateStr,
        time: time,
        caption: post.caption,
        photos: post.photos,
        posted: false,
      },
    ]);

    delete pendingAlbums[userId];
    return bot.sendMessage(chatId, `✅ Пост запланирован на ${dateStr} в ${time}`);
  }

  // Обработка ручного ввода
  if (data === "manual_time") {
    pendingAlbums[userId].awaitingTimeInput = true;
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "🕐 Введите время в формате ЧЧ:ММ");
  }
});

