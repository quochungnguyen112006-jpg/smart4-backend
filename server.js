const http = require("http");
const mqtt = require("mqtt");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const PORT = process.env.PORT || 10000;

const MQTT_SERVER =
    "mqtts://c8aa35bd14934f5ebd190c284377a7fe.s1.eu.hivemq.cloud:8883";

const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC = "lab/sensor";

const DEVICE_OFFLINE_MS = 10000;

// =========================
// SUPABASE
// =========================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
);

// =========================
// MQTT
// =========================

const mqttClient = mqtt.connect(MQTT_SERVER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocol: "mqtts",
    reconnectPeriod: 5000
});

let lastDeviceMessageAt = 0;

// Tránh gửi OneSignal liên tục mỗi 4 giây
let previousAlertState = {
    temp_alert: false,
    gas_alert: false
};

// =========================
// ONESIGNAL
// =========================

async function sendOneSignalNotification(temp_alert, gas_alert, temp, gas) {
    try {
        const appId = process.env.ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_API_KEY;

        if (!appId || !apiKey) {
            console.error("❌ Thiếu ONESIGNAL_APP_ID hoặc ONESIGNAL_API_KEY");
            return;
        }

        let message = "";

        if (temp_alert && gas_alert) {
            message = `Nhiệt độ ${temp.toFixed(1)}°C và khí gas ${gas} vượt ngưỡng!`;
        } else if (temp_alert) {
            message = `Nhiệt độ ${temp.toFixed(1)}°C vượt ngưỡng 30°C!`;
        } else if (gas_alert) {
            message = `Khí gas ${gas} vượt ngưỡng 2000!`;
        }

        const response = await axios.post(
            "https://api.onesignal.com/notifications",
            {
                app_id: appId,
                target_channel: "push",
                included_segments: ["All"],
                headings: {
                    en: "🚨 Smart4 Cảnh báo"
                },
                contents: {
                    en: message
                },
                url: "https://smart4-dashboard.vercel.app"
            },
            {
                headers: {
                    Authorization: `Key ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ OneSignal sent:", response.data);
    } catch (error) {
        console.error(
            "❌ OneSignal error:",
            error.response?.data || error.message
        );
    }
}

// =========================
// MQTT CONNECT
// =========================

mqttClient.on("connect", () => {
    console.log("✅ MQTT connected");

    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (err) {
            console.error("❌ MQTT subscribe error:", err);
        } else {
            console.log("📩 Topic:", MQTT_TOPIC);
        }
    });
});

mqttClient.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
});

mqttClient.on("error", (error) => {
    console.error("❌ MQTT error:", error.message);
});

mqttClient.on("close", () => {
    console.log("⚠️ MQTT disconnected");
});

// =========================
// MQTT MESSAGE
// =========================

mqttClient.on("message", async (topic, message) => {
    try {
        const data = JSON.parse(message.toString());

        console.log("📩 Message:", message.toString());

        const temp = Number(data.temp);
        const gas = Number(data.gas);

        const temp_alert = Boolean(data.temp_alert);
        const gas_alert = Boolean(data.gas_alert);

        lastDeviceMessageAt = Date.now();

        console.log("🌡️ Temperature:", temp);
        console.log("🔥 Gas:", gas);
        console.log("Temp alert:", temp_alert);
        console.log("Gas alert:", gas_alert);

        // =========================
        // SUPABASE
        // =========================

        const { data: insertedData, error } = await supabase
            .from("sensor_data")
            .insert([
                {
                    temp,
                    gas,
                    temp_alert,
                    gas_alert
                }
            ])
            .select();

        if (error) {
            console.error("❌ Supabase insert error:", error);
        } else {
            console.log("✅ Supabase insert OK:", insertedData);
        }

        // =========================
        // ONESIGNAL
        // Chỉ gửi khi trạng thái cảnh báo thay đổi
        // =========================

        const alertChanged =
            temp_alert !== previousAlertState.temp_alert ||
            gas_alert !== previousAlertState.gas_alert;

        if (alertChanged && (temp_alert || gas_alert)) {
            await sendOneSignalNotification(
                temp_alert,
                gas_alert,
                temp,
                gas
            );
        }

        previousAlertState = {
            temp_alert,
            gas_alert
        };
    } catch (error) {
        console.error("❌ MQTT message error:", error);
    }
});

// =========================
// HTTP SERVER
// =========================

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,DELETE,OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // =========================
    // ROOT
    // =========================

    if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(
            JSON.stringify({
                status: "ok",
                mqtt: mqttClient.connected
                    ? "connected"
                    : "disconnected"
            })
        );

        return;
    }

    // =========================
    // HEALTH
    // =========================

    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(
            JSON.stringify({
                status: "ok"
            })
        );

        return;
    }

    // =========================
    // STATUS
    // =========================

    if (req.method === "GET" && req.url === "/status") {
        const now = Date.now();

        const deviceOnline =
            lastDeviceMessageAt > 0 &&
            now - lastDeviceMessageAt <= DEVICE_OFFLINE_MS;

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(
            JSON.stringify({
                backend: "online",
                mqtt: mqttClient.connected
                    ? "connected"
                    : "disconnected",
                device: deviceOnline
                    ? "online"
                    : "offline",
                lastDeviceMessage:
                    lastDeviceMessageAt > 0
                        ? new Date(
                              lastDeviceMessageAt
                          ).toISOString()
                        : null,
                secondsSinceLastMessage:
                    lastDeviceMessageAt > 0
                        ? Math.floor(
                              (now - lastDeviceMessageAt) /
                                  1000
                          )
                        : null
            })
        );

        return;
    }

    // =========================
    // DATA
    // =========================

    if (req.method === "GET" && req.url === "/data") {
        try {
            const { data, error } = await supabase
                .from("sensor_data")
                .select("*")
                .order("created_at", {
                    ascending: false
                })
                .limit(100);

            if (error) {
                throw error;
            }

            res.writeHead(200, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify(data || []));
        } catch (error) {
            console.error(
                "❌ Supabase /data:",
                error
            );

            res.writeHead(500, {
                "Content-Type": "application/json"
            });

            res.end(
                JSON.stringify({
                    error: error.message
                })
            );
        }

        return;
    }

    // =========================
    // RESET
    // =========================

    if (
        req.method === "DELETE" &&
        req.url === "/reset"
    ) {
        try {
            const { error } = await supabase
                .from("sensor_data")
                .delete()
                .neq("id", 0);

            if (error) {
                throw error;
            }

            res.writeHead(200, {
                "Content-Type": "application/json"
            });

            res.end(
                JSON.stringify({
                    success: true
                })
            );
        } catch (error) {
            console.error(
                "❌ Reset error:",
                error
            );

            res.writeHead(500, {
                "Content-Type": "application/json"
            });

            res.end(
                JSON.stringify({
                    error: error.message
                })
            );
        }

        return;
    }

    // =========================
    // 404
    // =========================

    res.writeHead(404, {
        "Content-Type": "application/json"
    });

    res.end(
        JSON.stringify({
            error: "Not found"
        })
    );
});

// =========================
// START SERVER
// =========================

server.listen(PORT, () => {
    console.log(
        `🚀 Server running on port ${PORT}`
    );
});