const { connectToDatabase, client } = require("./mongo");

async function test() {
  console.log("🔄 Начинаем подключение...");
  const db = await connectToDatabase();

  console.log("🔍 Получаем коллекции...");
  const collections = await db.collections();
  console.log(
    "Коллекции в базе:",
    collections.map((c) => c.collectionName)
  );

  console.log("🔒 Закрываем подключение...");
  await client.close();

  console.log("✅ Завершено");
  process.exit(0); // Явно завершаем процесс
}

test().catch((err) => {
  console.error("❌ Ошибка в тесте:", err);
  process.exit(1);
});
