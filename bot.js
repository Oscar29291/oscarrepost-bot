const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjQ7d3oUBjL5FM";
const CHANNEL_USERNAME = "@diz673";
const SCHEDULE_FILE = path.join(__dirname, "schedule.json");

const bot = new TelegramBot(TOKEN, { polling: true });
const pendingAlbums = {};

const monthsRu = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

// 🔄 Планировщик
setInterval(() => {
  const now = new Date();
  const schedule = loadSchedule();

  const toPost = schedule.filter((post) => {
    const postTime = new Date(post.date + "T" + post.time);
    return now >= postTime && !post.posted;
  });

  toPost.forEach(async (post) => {
    try {
      await bot.sendMediaGroup(CHANNEL_USERNAME, post.photos);
      post.posted = true;
      saveSchedule(schedule);
    } catch (err) {
      console.error("Ошибка публикации:", err);
    }
  });
}, 60 * 1000);

function loadSchedule() {
  try {
    const data = fs.readFileSync(SCHEDULE_FILE);
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveSchedule(schedule) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
}

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

// 📤 Обработка сообщений
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
          [{ text: "⌚ Ввести время вручную", callback_data: "manual_time" }],
          [{ text: "🚀 Опубликовать сейчас", callback_data: "post_now" }],
        ],
      },
    });
  }

  if (pendingAlbums[userId]?.awaitingTimeInput) {
    const time = msg.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return bot.sendMessage(chatId, "Неверный формат времени. Введите в формате ЧЧ:ММ");
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

  if (data === "manual_time") {
    const now = new Date();
    pendingAlbums[userId].scheduledDate = now;
    pendingAlbums[userId].awaitingTimeInput = true;
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "Введите время публикации (ЧЧ:ММ):");
  }

  if (data.startsWith("date_")) {
    const [, year, month, day] = data.split("_").map(Number);
    pendingAlbums[userId].scheduledDate = new Date(year, month, day);

    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "Введите время публикации (ЧЧ:ММ):").then(() => {
      pendingAlbums[userId].awaitingTimeInput = true;
    });
  }
});
