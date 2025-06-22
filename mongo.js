const { MongoClient } = require("mongodb");

const uri =
  "mongodb+srv://oscar29bm:bnIl74Dq3k4q6GTl@cluster0.h4mfmk4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  tls: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
});

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("✅ Успешно подключились к MongoDB");
    return client.db("myTelegramBot"); // имя вашей базы, можно любое
  } catch (err) {
    console.error("❌ Ошибка подключения к MongoDB:", err);
    throw err;
  }
}

module.exports = { connectToDatabase, client };
