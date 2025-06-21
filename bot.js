const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjL5FM";
const CHANNEL_USERNAME = "@diz673";

const bot = new TelegramBot(TOKEN, { polling: true });

const pendingAlbums = {};
const ALBUM_TIMEOUT = 2000;

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

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function buildDateKeyboardForMonth(year, month, now) {
  const daysCount = getDaysInMonth(year, month);
  const buttons = [];
  for (let i = 1; i <= daysCount; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysCount; j++) {
      const dateCheck = new Date(year, month, j);
      // Показываем только сегодняшние и будущие даты
      if (dateCheck >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        row.push({
          text: String(j),
          callback_data: `date_${year}_${month}_${j}`,
        });
      }
    }
    if (row.length) buttons.push(row);
  }
  return buttons;
}

function buildDateKeyboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Клавиатура с датами на два месяца: текущий и следующий
  const buttons = [];

  // Месяц 1 (текущий)
  buttons.push([
    { text: `${monthsRu[month]} ${year}`, callback_data: "ignore" },
  ]);
  buttons.push(...buildDateKeyboardForMonth(year, month, now));

  // Месяц 2 (следующий)
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextMonthYear = month === 11 ? year + 1 : year;

  buttons.push([
    { text: `${monthsRu[nextMonth]} ${nextMonthYear}`, callback_data: "ignore" },
  ]);
  buttons.push(...buildDateKeyboardForMonth(nextMonthYear, nextMonth, now));

  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

async function buildTimeKeyboard(selectedDate) {
  const now = new Date();
  const currentHour = now.getHours();

  const fixedTimes = [11, 16, 20];
  const buttons = [];

  const isToday =
    selectedDate.getDate() === now.getDate() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getFullYear() === now.getFullYear();

  for (let time of fixedTimes) {
    if (!isToday || time > currentHour) {
      buttons.push([{ text: `${time}:00`, callback_data: `time_${time}` }]);
    }
  }

  // Добавляем кнопки "Ввести время вручную" и "Опубликовать сейчас"
  buttons.push(
    [{ text: "Ввести время вручную", callback_data: "time_manual" }],
    [{ text: "Опубликовать сейчас", callback_data: "publish_now" }]
  );

  return { reply_markup: { inline_keyboard: buttons } };
}

async function publishAlbumNow(userId) {
  const album = pendingAlbums[userId];
  if (!album || !album.photos || album.photos.length === 0) {
    return;
  }
  if (album.caption) {
    album.photos[0].caption = album.caption;
  }
  await bot.sendMediaGroup(CHANNEL_USERNAME, album.photos);
  await bot.sendMessage(album.chatId, "✅ Пост опубликован сейчас!");
  delete pendingAlbums[userId];
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Обработка ручного ввода времени, если ожидается
  if (pendingAlbums[userId] && pendingAlbums[userId].awaitingManualTime) {
    const timeText = msg.text.trim();
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(timeText)) {
      return bot.sendMessage(chatId, "❌ Неверный формат времени. Введите в формате ЧЧ:ММ, например 14:30");
    }
    pendingAlbums[userId].scheduledTime = timeText;
    pendingAlbums[userId].awaitingManualTime = false;

    await bot.sendMessage(
      chatId,
      `Пост запланирован на ${pendingAlbums[userId].scheduledDate.getDate()} ${monthsRu[pendingAlbums[userId].scheduledDate.getMonth()]} ${pendingAlbums[userId].scheduledDate.getFullYear()} в ${timeText}`
    );

    // TODO: Сохранить и запланировать публикацию (например в файл или базу)
    clearTimeout(pendingAlbums[userId].timeout);
    delete pendingAlbums[userId];
    return;
  }

  try {
    if (msg.photo) {
      if (!pendingAlbums[userId]) {
        pendingAlbums[userId] = {
          photos: [],
          timeout: null,
          caption: msg.caption || "",
          chatId: chatId,
        };
      }

      pendingAlbums[userId].photos.push({
        type: "photo",
        media: msg.photo[msg.photo.length - 1].file_id,
      });

      if (msg.caption) {
        pendingAlbums[userId].caption = msg.caption;
      }

      if (pendingAlbums[userId].timeout) {
        clearTimeout(pendingAlbums[userId].timeout);
      }

      // Предлагаем выбрать дату публикации
      await bot.sendMessage(chatId, "Выберите дату публикации поста:", buildDateKeyboard());

      // Не запускаем отправку сразу — ждем выбора даты и времени
    } else {
      // Обработка других сообщений если нужно...
    }
  } catch (err) {
    console.error("Ошибка:", err);
    await bot.sendMessage(chatId, "❌ Ошибка при публикации.");
  }
});

bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  if (!pendingAlbums[userId]) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "Нет активного поста.",
    });
  }

  if (data === "ignore") {
    // Кнопка-заголовок, игнорируем
    return bot.answerCallbackQuery(callbackQuery.id);
  }

  if (data.startsWith("date_")) {
    // Формат: date_2025_5_21
    const parts = data.split("_");
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);

    pendingAlbums[userId].scheduledDate = new Date(year, month, day);

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `Вы выбрали дату: ${day} ${monthsRu[month]} ${year}`,
    });

    const timeKeyboard = await buildTimeKeyboard(pendingAlbums[userId].scheduledDate);

    await bot.sendMessage(pendingAlbums[userId].chatId, "Выберите время публикации:", timeKeyboard);

    return;
  }

  if (data.startsWith("time_")) {
    if (!pendingAlbums[userId] || !pendingAlbums[userId].scheduledDate) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "Сначала выберите дату.",
      });
    }

    if (data === "time_manual") {
      await bot.sendMessage(pendingAlbums[userId].chatId, "Введите время публикации в формате ЧЧ:ММ (например, 14:30):");
      pendingAlbums[userId].awaitingManualTime = true;
      return bot.answerCallbackQuery(callbackQuery.id);
    }

    if (data === "publish_now") {
      await publishAlbumNow(userId);
      return bot.answerCallbackQuery(callbackQuery.id);
    }

    const time = data.split("_")[1];
    pendingAlbums[userId].scheduledTime = time;

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `Вы выбрали время: ${time}:00`,
    });

    await bot.sendMessage(
      pendingAlbums[userId].chatId,
      `Пост запланирован на ${pendingAlbums[userId].scheduledDate.getDate()} ${monthsRu[pendingAlbums[userId].scheduledDate.getMonth()]} ${pendingAlbums[userId].scheduledDate.getFullYear()} в ${time}:00`
    );

    // TODO: сохранить и запланировать публикацию

    clearTimeout(pendingAlbums[userId].timeout);
    delete pendingAlbums[userId];

    return;
  }

  // Если попали сюда — нераспознанное callback_query
  await bot.answerCallbackQuery(callbackQuery.id, { text: "Неизвестная команда" });
});
