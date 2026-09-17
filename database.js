const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./iot.db", (err) => {
    if (err) {
        console.error("❌ Không thể mở database:", err.message);
    } else {
        console.log("✅ Đã kết nối SQLite");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS sensor_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temp REAL,
        gas INTEGER,
        temp_alert INTEGER,
        gas_alert INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error("❌ Lỗi tạo bảng:", err.message);
    } else {
        console.log("✅ Bảng sensor_data đã sẵn sàng");
    }
});

module.exports = db;