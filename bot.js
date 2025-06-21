const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjQ7d3oUBjL5FM";
const CHANNEL_USERNAME = "@diz673";

const bot = new TelegramBot(TOKEN, { polling: true });

const pendingAlbums = {};
const ALBUM_TIMEOUT = 2000;

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function buildDateKeyboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const daysCount = getDaysInMonth(year, month);
  const buttons = [];

  // Кнопки по 7 штук в ряд
  for (let i = 1; i <= daysCount; i += 7) {
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

      // Вместо отправки сразу — предложим выбрать дату
      await bot.sendMessage(
        chatId,
        "Выберите дату публикации поста:",
        buildDateKeyboard()
      );

      // Здесь не запускаем таймер на отправку сразу — ждем выбора даты
    }
  } catch (err) {
    console.error("Ошибка:", err);
    await bot.sendMessage(chatId, "❌ Ошибка при публикации.");
  }
});

// Обработка выбора даты
bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  if (!pendingAlbums[userId]) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "Нет активного поста.",
    });
  }

  if (data.startsWith("date_")) {
    // Пример callback_data: date_2025_5_21
    const parts = data.split("_");
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);

    // Сохраняем выбранную дату для публикации
    pendingAlbums[userId].scheduledDate = new Date(year, month, day);

    // Подтверждаем выбор
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `Вы выбрали дату: ${day}.${month + 1}.${year}`,
    });

    // Здесь можно далее отправить кнопки для выбора времени (11, 16, 20) — следующий шаг
    // Пока просто подтвердим выбор и попросим выбрать время

    const timeButtons = [
      [{ text: "11:00", callback_data: "time_11" }],
      [{ text: "16:00", callback_data: "time_16" }],
      [{ text: "20:00", callback_data: "time_20" }],
    ];

    await bot.sendMessage(
      pendingAlbums[userId].chatId,
      "Выберите время публикации:",
      {
        reply_markup: {
          inline_keyboard: timeButtons,
        },
      }
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

    // Подтверждаем, что пост запланирован
    await bot.sendMessage(
      pendingAlbums[userId].chatId,
      `Пост запланирован на ${pendingAlbums[
        userId
      ].scheduledDate.toLocaleDateString()} в ${time}:00`
    );

    // Здесь нужно сохранить пост в расписание, чтобы потом отправить по времени
    // Пока просто удалим таймер и сбросим состояние
    clearTimeout(pendingAlbums[userId].timeout);

    // TODO: Сохранить pendingAlbums[userId] в файл/базу для планировщика

    delete pendingAlbums[userId];
  }
});
