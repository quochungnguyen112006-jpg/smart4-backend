const http = require("http");
const mqtt = require("mqtt");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const PORT = process.env.PORT || 10000;

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

const MQTT_SERVER =
    "mqtts://c8aa35bd14934f5ebd190c284377a7fe.s1.eu.hivemq.cloud:8883";

const MQTT_USERNAME =
    process.env.MQTT_USERNAME;

const MQTT_PASSWORD =
    process.env.MQTT_PASSWORD;

const MQTT_TOPIC =
    "lab/sensor";

const mqttClient = mqtt.connect(
    MQTT_SERVER,
    {
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        protocol: "mqtts",
        reconnectPeriod: 5000
    }
);

// =========================
// MQTT CONNECT
// =========================

mqttClient.on("connect", () => {

    console.log("✅ MQTT connected");

    mqttClient.subscribe(
        MQTT_TOPIC,
        (err) => {

            if (err) {

                console.error(
                    "❌ MQTT subscribe error:",
                    err
                );

            } else {

                console.log(
                    "📩 Topic:",
                    MQTT_TOPIC
                );

            }

        }
    );

});


// =========================
// MQTT MESSAGE
// =========================

mqttClient.on(
    "message",
    async (topic, message) => {

        try {

            const data =
                JSON.parse(
                    message.toString()
                );

            console.log(
                "📩 Message:",
                message.toString()
            );

            const temp =
                Number(data.temp);

            const gas =
                Number(data.gas);

            const temp_alert =
                Boolean(data.temp_alert);

            const gas_alert =
                Boolean(data.gas_alert);


            console.log(
                "🌡️ Temperature:",
                temp
            );

            console.log(
                "🔥 Gas:",
                gas
            );

            console.log(
                "Temp alert:",
                temp_alert
            );

            console.log(
                "Gas alert:",
                gas_alert
            );


            // =========================
            // SUPABASE INSERT
            // =========================

            const {
                data: insertedData,
                error
            } = await supabase
                .from("sensor_data")
                .insert([
                    {
                        temp: temp,
                        gas: gas,
                        temp_alert: temp_alert,
                        gas_alert: gas_alert
                    }
                ])
                .select();


            if (error) {

                console.error(
                    "❌ Supabase insert error:",
                    error
                );

            } else {

                console.log(
                    "✅ Supabase insert OK:",
                    insertedData
                );

            }


            // =========================
            // ONESIGNAL
            // =========================

            if (
                temp_alert ||
                gas_alert
            ) {

                try {

                    await axios.post(
                        "https://api.onesignal.com/notifications",
                        {
                            app_id:
                                process.env.ONESIGNAL_APP_ID,

                            included_segments:
                                ["All"],

                            headings: {
                                en: "Smart4 Alert"
                            },

                            contents: {
                                en:
                                    temp_alert &&
                                    gas_alert
                                        ? "Nhiệt độ và khí gas vượt ngưỡng!"
                                        : temp_alert
                                            ? "Nhiệt độ vượt ngưỡng!"
                                            : "Khí gas vượt ngưỡng!"
                            }
                        },
                        {
                            headers: {
                                Authorization:
                                    `Key ${process.env.ONESIGNAL_API_KEY}`,

                                "Content-Type":
                                    "application/json"
                            }
                        }
                    );

                    console.log(
                        "✅ OneSignal notification sent"
                    );

                } catch (notificationError) {

                    console.error(
                        "❌ OneSignal error:",
                        notificationError.response?.data ||
                        notificationError.message
                    );

                }

            }

        } catch (error) {

            console.error(
                "❌ MQTT message error:",
                error
            );

        }

    }
);


// =========================
// HTTP SERVER
// =========================

const server =
    http.createServer(
        async (req, res) => {

            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            res.setHeader(
                "Access-Control-Allow-Methods",
                "GET,DELETE,OPTIONS"
            );

            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type"
            );


            if (
                req.method === "OPTIONS"
            ) {

                res.writeHead(204);

                res.end();

                return;
            }


            // =========================
            // ROOT
            // =========================

            if (
                req.method === "GET" &&
                req.url === "/"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json"
                    }
                );

                res.end(
                    JSON.stringify({
                        status: "ok",
                        mqtt:
                            mqttClient.connected
                                ? "connected"
                                : "disconnected"
                    })
                );

                return;
            }


            // =========================
            // HEALTH
            // =========================

            if (
                req.method === "GET" &&
                req.url === "/health"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json"
                    }
                );

                res.end(
                    JSON.stringify({
                        status: "ok"
                    })
                );

                return;
            }


            // =========================
            // GET DATA
            // =========================

            if (
                req.method === "GET" &&
                req.url === "/data"
            ) {

                try {

                    const {
                        data,
                        error
                    } = await supabase
                        .from("sensor_data")
                        .select("*")
                        .order(
                            "created_at",
                            {
                                ascending: false
                            }
                        );


                    if (error) {

                        throw error;

                    }


                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                "application/json"
                        }
                    );

                    res.end(
                        JSON.stringify(data)
                    );

                } catch (error) {

                    console.error(
                        "❌ Supabase /data:",
                        error
                    );

                    res.writeHead(
                        500,
                        {
                            "Content-Type":
                                "application/json"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            error:
                                error.message
                        })
                    );

                }

                return;
            }


            // =========================
            // RESET DATA
            // =========================

            if (
                req.method === "DELETE" &&
                req.url === "/reset"
            ) {

                try {

                    const {
                        error
                    } = await supabase
                        .from("sensor_data")
                        .delete()
                        .neq(
                            "id",
                            0
                        );


                    if (error) {

                        throw error;

                    }


                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                "application/json"
                        }
                    );

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

                    res.writeHead(
                        500,
                        {
                            "Content-Type":
                                "application/json"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            error:
                                error.message
                        })
                    );

                }

                return;
            }


            // =========================
            // NOT FOUND
            // =========================

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "application/json"
                }
            );

            res.end(
                JSON.stringify({
                    error: "Not found"
                })
            );

        }
    );


// =========================
// START SERVER
// =========================

server.listen(
    PORT,
    () => {

        console.log(
            `🚀 Server running on port ${PORT}`
        );

    }
);