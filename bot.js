const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "7722913115:AAEMsjjYap5XvIGdBL8bZQjQ7d3oUBjL5FM"; // <-- твой токен
const CHANNEL_USERNAME = "@diz673"; // <-- замени на username твоего канала

const bot = new TelegramBot(TOKEN, { polling: true });

const pendingAlbums = {};
const ALBUM_TIMEOUT = 2000; // 2 секунды для "сбора" альбома

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
        };
      }

      // Добавляем фото
      pendingAlbums[userId].photos.push({
        type: "photo",
        media: msg.photo[msg.photo.length - 1].file_id,
      });

      // Обновляем подпись, если она есть (перезаписываем)
      if (msg.caption) {
        pendingAlbums[userId].caption = msg.caption;
      }

      // Сбрасываем таймер отправки альбома
      if (pendingAlbums[userId].timeout) {
        clearTimeout(pendingAlbums[userId].timeout);
      }

      // Запускаем таймер, по истечении которого отправим альбом
      pendingAlbums[userId].timeout = setTimeout(async () => {
        const album = pendingAlbums[userId];
        if (album.photos.length > 0) {
          if (album.caption) {
            album.photos[0].caption = album.caption;
          }
          await bot.sendMediaGroup(CHANNEL_USERNAME, album.photos);
          await bot.sendMessage(chatId, "✅ Альбом отправлен в канал!");
        }
        delete pendingAlbums[userId];
      }, ALBUM_TIMEOUT);
    } else {
      // Обработка остальных типов сообщений как обычно
      // ...
    }
  } catch (err) {
    console.error("Ошибка:", err);
    await bot.sendMessage(chatId, "❌ Ошибка при публикации.");
  }
});
