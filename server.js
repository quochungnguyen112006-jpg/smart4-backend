const mqtt = require("mqtt");
const http = require("http");
const url = require("url");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ======================================================
// HIVEMQ CLOUD
// ======================================================

const MQTT_BROKER =
    "mqtts://c8aa35bd14934f5ebd190c284377a7fe.s1.eu.hivemq.cloud:8883";

const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const MQTT_TOPIC = "lab/sensor";

// ======================================================
// ONESIGNAL
// ======================================================

const ONESIGNAL_APP_ID =
    "4e288a67-5fb2-4249-aa99-be41582c25ef";

const ONESIGNAL_API_KEY =
    process.env.ONESIGNAL_API_KEY;

// ======================================================
// SUPABASE CLOUD
// ======================================================

const SUPABASE_URL =
    "https://eplpckbktkerxbyszvjb.supabase.co";

const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

// ======================================================
// SERVER
// ======================================================

const SERVER_PORT = 3000;

// ======================================================
// CHECK ENVIRONMENT VARIABLES
// ======================================================

console.log("--------------------------------");
console.log("🔧 Smart4 Backend Cloud");
console.log("--------------------------------");

console.log(
    "🔑 MQTT username:",
    MQTT_USERNAME ? "OK" : "THIẾU"
);

console.log(
    "🔑 MQTT password:",
    MQTT_PASSWORD ? "OK" : "THIẾU"
);

console.log(
    "🔑 OneSignal API:",
    ONESIGNAL_API_KEY ? "OK" : "THIẾU"
);

console.log(
    "🔑 Supabase secret:",
    SUPABASE_KEY?.startsWith("sb_secret_")
        ? "OK"
        : "THIẾU / KHÔNG ĐÚNG"
);

// ======================================================
// ONESIGNAL CHECK
// ======================================================

if (!ONESIGNAL_API_KEY) {
    console.log(
        "⚠️ Chưa cấu hình ONESIGNAL_API_KEY"
    );
} else {
    console.log(
        "✅ OneSignal API Key đã được nạp"
    );
}

// ======================================================
// GỬI PUSH NOTIFICATION
// ======================================================

async function sendNotification(
    temp,
    gas,
    tempAlert,
    gasAlert
) {
    if (!ONESIGNAL_API_KEY) {
        console.log(
            "⚠️ Không gửi notification: thiếu ONESIGNAL_API_KEY"
        );
        return;
    }

    let title = "🚨 Smart4 Cảnh báo";
    let message = "";

    if (tempAlert && gasAlert) {

        message =
            `⚠️ Nhiệt độ ${temp}°C và Gas ${gas} đang ở mức cảnh báo!`;

    } else if (tempAlert) {

        message =
            `🌡️ Nhiệt độ ${temp}°C đang vượt ngưỡng!`;

    } else if (gasAlert) {

        message =
            `🔥 Gas ${gas} đang vượt ngưỡng!`;

    } else {

        return;
    }

    try {

        const response = await axios.post(
            "https://api.onesignal.com/notifications",

            {
                app_id: ONESIGNAL_APP_ID,

                include_subscription_ids: [
                    "e96ea331-1b56-479f-a296-72b733a4f6e2"
                ],

                headings: {
                    en: title
                },

                contents: {
                    en: message
                }
            },

            {
                headers: {
                    Authorization:
                        `Key ${ONESIGNAL_API_KEY}`,

                    "Content-Type":
                        "application/json"
                }
            }
        );

        console.log(
            "📱 OneSignal đã gửi notification ID:",
            response.data.id
        );

    } catch (error) {

        console.error(
            "❌ OneSignal lỗi:",
            error.response?.data ||
            error.message
        );
    }
}

// ======================================================
// LƯU SUPABASE
// ======================================================

async function saveToSupabase(
    temp,
    gas,
    tempAlert,
    gasAlert
) {

    try {

        const { data, error } =
            await supabase
                .from("sensor_data")
                .insert([
                    {
                        temp: temp,
                        gas: gas,
                        temp_alert: tempAlert,
                        gas_alert: gasAlert
                    }
                ])
                .select();

        if (error) {

            console.error(
                "❌ Supabase lỗi:",
                error.message
            );

            return;
        }

        console.log(
            "☁️ Đã lưu Supabase - ID:",
            data[0].id
        );

    } catch (error) {

        console.error(
            "❌ Supabase exception:",
            error.message
        );
    }
}

// ======================================================
// MQTT
// ======================================================

console.log("--------------------------------");
console.log("🔄 Connecting to HiveMQ Cloud...");
console.log("📡 Broker:", MQTT_BROKER);
console.log("📨 Topic:", MQTT_TOPIC);
console.log("--------------------------------");

const mqttClient = mqtt.connect(
    MQTT_BROKER,
    {
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,

        clientId:
            "server_dashboard_" +
            Math.random()
                .toString(16)
                .substring(2, 10),

        clean: true,

        connectTimeout: 10000,

        reconnectPeriod: 3000
    }
);

// ======================================================
// MQTT CONNECT
// ======================================================

mqttClient.on(
    "connect",
    () => {

        console.log(
            "✅ MQTT HiveMQ Connected!"
        );

        mqttClient.subscribe(
            MQTT_TOPIC,
            (err) => {

                if (err) {

                    console.error(
                        "❌ Subscribe failed:",
                        err.message
                    );

                } else {

                    console.log(
                        "✅ Subscribed:",
                        MQTT_TOPIC
                    );
                }
            }
        );
    }
);

// ======================================================
// MQTT ERROR
// ======================================================

mqttClient.on(
    "error",
    (err) => {

        console.error(
            "❌ MQTT Error:",
            err.message
        );
    }
);

// ======================================================
// MQTT RECONNECT
// ======================================================

mqttClient.on(
    "reconnect",
    () => {

        console.log(
            "🔄 Đang reconnect HiveMQ..."
        );
    }
);

// ======================================================
// NHẬN DỮ LIỆU MQTT
// ======================================================

mqttClient.on(
    "message",
    async (topic, message) => {

        console.log("--------------------------------");
        console.log(
            "📩 Topic:",
            topic
        );

        try {

            const payload =
                JSON.parse(
                    message.toString()
                );

            const temp =
                Number(payload.temp);

            const gas =
                Number(payload.gas);

            const tempAlert =
                payload.temp_alert === true ||
                payload.temp_alert === 1 ||
                payload.temp_alert === "true"
                    ? 1
                    : 0;

            const gasAlert =
                payload.gas_alert === true ||
                payload.gas_alert === 1 ||
                payload.gas_alert === "true"
                    ? 1
                    : 0;

            // ==================================================
            // KIỂM TRA DỮ LIỆU
            // ==================================================

            if (
                !Number.isFinite(temp) ||
                !Number.isFinite(gas)
            ) {

                console.error(
                    "❌ temp/gas không hợp lệ"
                );

                return;
            }

            // ==================================================
            // LOG
            // ==================================================

            console.log(
                "🌡️ Nhiệt độ:",
                temp
            );

            console.log(
                "🔥 Gas:",
                gas
            );

            console.log(
                "⚠️ Temp alert:",
                tempAlert === 1
            );

            console.log(
                "⚠️ Gas alert:",
                gasAlert === 1
            );

            // ==================================================
            // LƯU SUPABASE
            // ==================================================

            await saveToSupabase(
                temp,
                gas,
                tempAlert,
                gasAlert
            );

            // ==================================================
            // GỬI NOTIFICATION
            // ==================================================

            if (
                tempAlert === 1 ||
                gasAlert === 1
            ) {

                await sendNotification(
                    temp,
                    gas,
                    tempAlert === 1,
                    gasAlert === 1
                );
            }

        } catch (err) {

            console.error(
                "❌ JSON không hợp lệ:",
                err.message
            );

            console.log(
                "Raw:",
                message.toString()
            );
        }
    }
);

// ======================================================
// HTTP SERVER
// ======================================================

const server =
    http.createServer(
        async (req, res) => {

            // ==================================================
            // CORS
            // ==================================================

            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            res.setHeader(
                "Access-Control-Allow-Methods",
                "GET, POST, DELETE, OPTIONS"
            );

            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type"
            );

            // ==================================================
            // OPTIONS
            // ==================================================

            if (req.method === "OPTIONS") {

                res.writeHead(204);

                res.end();

                return;
            }

            const parsedUrl =
                url.parse(
                    req.url,
                    true
                );

            // ==================================================
            // ROOT
            // ==================================================

            if (
                req.method === "GET" &&
                parsedUrl.pathname === "/"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                );

                res.end(
                    JSON.stringify({
                        success: true,

                        message:
                            "Smart4 Server đang chạy trên Render",

                        topic:
                            MQTT_TOPIC
                    })
                );

                return;
            }

            // ==================================================
            // GET DATA FROM SUPABASE
            // ==================================================

            if (
                req.method === "GET" &&
                parsedUrl.pathname === "/data"
            ) {

                try {

                    const {
                        data,
                        error
                    } = await supabase
                        .from("sensor_data")
                        .select(
                            "id,created_at,temp,gas,temp_alert,gas_alert"
                        )
                        .order(
                            "id",
                            {
                                ascending: true
                            }
                        );

                    if (error) {

                        console.error(
                            "❌ Supabase GET lỗi:",
                            error.message
                        );

                        res.writeHead(
                            500,
                            {
                                "Content-Type":
                                    "application/json; charset=utf-8"
                            }
                        );

                        res.end(
                            JSON.stringify({
                                success: false,
                                error: error.message
                            })
                        );

                        return;
                    }

                    const rows =
                        data.map(
                            (item) => ({
                                id: item.id,

                                timestamp:
                                    item.created_at,

                                temp: item.temp,

                                gas: item.gas,

                                temp_alert:
                                    item.temp_alert
                                        ? 1
                                        : 0,

                                gas_alert:
                                    item.gas_alert
                                        ? 1
                                        : 0
                            })
                        );

                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        }
                    );

                    res.end(
                        JSON.stringify(rows)
                    );

                } catch (error) {

                    console.error(
                        "❌ /data lỗi:",
                        error.message
                    );

                    res.writeHead(
                        500,
                        {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            success: false,
                            error: error.message
                        })
                    );
                }

                return;
            }

            // ==================================================
            // DELETE DATA FROM SUPABASE
            // ==================================================

            if (
                req.method === "DELETE" &&
                parsedUrl.pathname === "/reset"
            ) {

                try {

                    const {
                        error
                    } = await supabase
                        .from("sensor_data")
                        .delete()
                        .not(
                            "id",
                            "is",
                            null
                        );

                    if (error) {

                        console.error(
                            "❌ Supabase DELETE lỗi:",
                            error.message
                        );

                        res.writeHead(
                            500,
                            {
                                "Content-Type":
                                    "application/json; charset=utf-8"
                            }
                        );

                        res.end(
                            JSON.stringify({
                                success: false,
                                error: error.message
                            })
                        );

                        return;
                    }

                    console.log(
                        "🗑️ Đã xóa dữ liệu Supabase"
                    );

                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            success: true,

                            message:
                                "Đã xóa dữ liệu Supabase"
                        })
                    );

                } catch (error) {

                    console.error(
                        "❌ /reset lỗi:",
                        error.message
                    );

                    res.writeHead(
                        500,
                        {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            success: false,
                            error: error.message
                        })
                    );
                }

                return;
            }

            // ==================================================
            // 404
            // ==================================================

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "application/json; charset=utf-8"
                }
            );

            res.end(
                JSON.stringify({
                    success: false,

                    message:
                        "API không tồn tại"
                })
            );
        }
    );

// ======================================================
// START SERVER
// ======================================================

const PORT =
    process.env.PORT ||
    SERVER_PORT;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("--------------------------------");

        console.log(
            `🌐 Server running on port ${PORT}`
        );

        console.log(
            "📡 MQTT Broker:",
            MQTT_BROKER
        );

        console.log(
            "📨 MQTT Topic:",
            MQTT_TOPIC
        );

        console.log("--------------------------------");
    }
);