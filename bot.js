const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjQ7d3oUBjL5FM"; // Твой токен
const CHANNEL_USERNAME = "@diz673"; // Твой канал

const bot = new TelegramBot(TOKEN, { polling: true });

const pendingAlbums = {};
const ALBUM_TIMEOUT = 2000; // 2 секунды для сбора альбома

const monthsRu = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

// Функция для получения количества дней в месяце
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Функция для создания клавиатуры с выбором дат начиная с startDay
function buildDateKeyboard(year, month, startDay = 1) {
  const daysCount = getDaysInMonth(year, month);
  const buttons = [];

  for (let i = startDay; i <= daysCount; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysCount; j++) {
      row.push({
        text: String(j),
        callback_data: `date_${year}_${month}_${j}`,
      });
    }
    buttons.push(row);
  }

  return { reply_markup: { inline_keyboard: buttons } };
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  try {
    if (msg.photo) {
      const userId = msg.from.id;
      if (!pendingAlbums[userId]) {
        pendingAlbums[userId] = {
          photos: [],
          timeout: null,
          caption: msg.caption || "",
          chatId: chatId,
        };
      }

      // Добавляем фото в альбом
      pendingAlbums[userId].photos.push({
        type: "photo",
        media: msg.photo[msg.photo.length - 1].file_id,
      });

      // Обновляем подпись, если есть
      if (msg.caption) {
        pendingAlbums[userId].caption = msg.caption;
      }

      // Очищаем таймер, если был
      if (pendingAlbums[userId].timeout) {
        clearTimeout(pendingAlbums[userId].timeout);
      }

      // Показываем выбор даты начиная с сегодняшнего дня
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();

      await bot.sendMessage(
        chatId,
        `Выберите дату публикации поста — ${monthsRu[month]} ${year}:`,
        buildDateKeyboard(year, month, day)
      );
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

  if (data.startsWith("date_")) {
    const parts = data.split("_");
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);

    pendingAlbums[userId].scheduledDate = new Date(year, month, day);

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `Вы выбрали дату: ${day} ${monthsRu[month]} ${year}`,
    });

    // Кнопки для выбора времени
    const timeButtons = [
      [{ text: "11:00", callback_data: "time_11" }],
      [{ text: "16:00", callback_data: "time_16" }],
      [{ text: "20:00", callback_data: "time_20" }],
    ];

    await bot.sendMessage(
      pendingAlbums[userId].chatId,
      "Выберите время публикации:",
      { reply_markup: { inline_keyboard: timeButtons } }
    );
  }

  if (data.startsWith("time_")) {
    if (!pendingAlbums[userId] || !pendingAlbums[userId].scheduledDate) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "Сначала выберите дату.",
      });
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

    // TODO: здесь нужно сохранить пост и время в файл/базу для дальнейшей отправки

    clearTimeout(pendingAlbums[userId].timeout);
    delete pendingAlbums[userId];
  }
});

