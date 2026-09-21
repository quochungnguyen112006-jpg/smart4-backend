const http = require("http");
const mqtt = require("mqtt");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

// ======================================================
// CONFIG
// ======================================================

const PORT = process.env.PORT || 3000;

const MQTT_HOST =
  "c8aa35bd14934f5ebd190c284377a7fe.s1.eu.hivemq.cloud";

const MQTT_PORT = 8883;

const MQTT_USERNAME =
  process.env.MQTT_USERNAME;

const MQTT_PASSWORD =
  process.env.MQTT_PASSWORD;

const MQTT_TOPIC = "lab/sensor";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const ONESIGNAL_API_KEY =
  process.env.ONESIGNAL_API_KEY;

const ONESIGNAL_APP_ID =
  "4e288a67-5fb2-4249-aa99-be41582c25ef";

// ======================================================
// SUPABASE
// ======================================================

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY
);

// ======================================================
// MQTT
// ======================================================

let mqttConnected = false;

const mqttClient = mqtt.connect(
  `mqtts://${MQTT_HOST}:${MQTT_PORT}`,
  {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    clientId:
      "smart4-render-" +
      Math.random().toString(16).substring(2)
  }
);

// ======================================================
// HTTP SERVER
// ======================================================

const server = http.createServer(
  async (req, res) => {

    // CORS

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

    if (req.method === "OPTIONS") {

      res.writeHead(204);

      res.end();

      return;

    }

    // ==================================================
    // /
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/"
    ) {

      res.writeHead(200, {

        "Content-Type":
          "text/html; charset=utf-8"

      });

      res.end(`

        <h1>Smart4 Cloud Backend</h1>

        <p>Server đang hoạt động</p>

        <p>MQTT: ${
          mqttConnected
            ? "connected"
            : "disconnected"
        }</p>

      `);

      return;

    }

    // ==================================================
    // /health
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/health"
    ) {

      res.writeHead(200, {

        "Content-Type":
          "application/json; charset=utf-8"

      });

      res.end(

        JSON.stringify({

          status: "ok",

          service: "Smart4 Cloud Backend",

          mqtt: mqttConnected
            ? "connected"
            : "disconnected"

        })

      );

      return;

    }

    // ==================================================
    // /data
    // Dashboard dùng API này
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/data"
    ) {

      try {

        const { data, error } =
          await supabase

            .from("sensor_data")

            .select("*")

            .order("created_at", {
              ascending: false
            });

        if (error) {

          console.error(
            "❌ Supabase /data:",
            error
          );

          res.writeHead(500, {

            "Content-Type":
              "application/json"

          });

          res.end(

            JSON.stringify({

              error: error.message

            })

          );

          return;

        }

        res.writeHead(200, {

          "Content-Type":
            "application/json"

        });

        res.end(

          JSON.stringify(data || [])

        );

      } catch (error) {

        console.error(
          "❌ /data error:",
          error
        );

        res.writeHead(500, {

          "Content-Type":
            "application/json"

        });

        res.end(

          JSON.stringify({

            error: error.message

          })

        );

      }

      return;

    }

    // ==================================================
    // /reset
    // Dashboard dùng để xóa dữ liệu
    // ==================================================

    if (
      req.method === "DELETE" &&
      req.url === "/reset"
    ) {

      try {

        const { error } =
          await supabase

            .from("sensor_data")

            .delete()

            .gt("id", 0);

        if (error) {

          console.error(
            "❌ Supabase /reset:",
            error
          );

          res.writeHead(500, {

            "Content-Type":
              "application/json"

          });

          res.end(

            JSON.stringify({

              error: error.message

            })

          );

          return;

        }

        console.log(
          "🗑️ Đã xóa dữ liệu sensor_data"
        );

        res.writeHead(200, {

          "Content-Type":
            "application/json"

        });

        res.end(

          JSON.stringify({

            success: true,

            message: "Đã xóa dữ liệu"

          })

        );

      } catch (error) {

        console.error(
          "❌ /reset error:",
          error
        );

        res.writeHead(500, {

          "Content-Type":
            "application/json"

        });

        res.end(

          JSON.stringify({

            error: error.message

          })

        );

      }

      return;

    }

    // ==================================================
    // 404
    // ==================================================

    res.writeHead(404, {

      "Content-Type":
        "application/json"

    });

    res.end(

      JSON.stringify({

        error: "Not found"

      })

    );

  }

);

// ======================================================
// MQTT CONNECT
// ======================================================

mqttClient.on("connect", () => {

  mqttConnected = true;

  console.log(
    "✅ HiveMQ connected"
  );

  mqttClient.subscribe(
    MQTT_TOPIC,
    (error) => {

      if (error) {

        console.error(
          "❌ Subscribe error:",
          error
        );

        return;

      }

      console.log(
        "✅ Subscribed:",
        MQTT_TOPIC
      );

    }
  );

});

// ======================================================
// MQTT MESSAGE
// ======================================================

mqttClient.on(
  "message",
  async (topic, message) => {

    console.log("");

    console.log(
      "📩 Topic:",
      topic
    );

    console.log(
      "📩 Message:",
      message.toString()
    );

    let sensor;

    try {

      sensor = JSON.parse(
        message.toString()
      );

    } catch (error) {

      console.error(
        "❌ JSON lỗi:",
        error.message
      );

      return;

    }

    const temp = Number(
      sensor.temp
    );

    const gas = Number(
      sensor.gas
    );

    const temp_alert =
      Boolean(sensor.temp_alert);

    const gas_alert =
      Boolean(sensor.gas_alert);

    if (
      !Number.isFinite(temp) ||
      !Number.isFinite(gas)
    ) {

      console.error(
        "❌ temp/gas không hợp lệ"
      );

      return;

    }

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

    // ==================================================
    // SAVE SUPABASE
    // ==================================================

    const { error } =
      await supabase

        .from("sensor_data")

        .insert([

          {

            temp: temp,

            gas: gas,

            temp_alert:
              temp_alert,

            gas_alert:
              gas_alert

          }

        ]);

    if (error) {

      console.error(
        "❌ Supabase insert error:",
        error
      );

      return;

    }

    console.log(
      "✅ Đã lưu vào Supabase"
    );

    // ==================================================
    // ONESIGNAL
    // ==================================================

    if (
      (temp_alert || gas_alert) &&
      ONESIGNAL_API_KEY
    ) {

      let messageText =
        "Smart4 cảnh báo: ";

      if (temp_alert) {

        messageText +=
          `Nhiệt độ cao ${temp}°C. `;

      }

      if (gas_alert) {

        messageText +=
          `Khí gas cao ${gas}.`;

      }

      try {

        await axios.post(

          "https://api.onesignal.com/notifications",

          {

            app_id:
              ONESIGNAL_APP_ID,

            included_segments:
              ["All"],

            headings: {

              en:
                "Smart4 cảnh báo"

            },

            contents: {

              en:
                messageText

            }

          },

          {

            headers: {

              "Content-Type":
                "application/json",

              "Authorization":
                `Key ${ONESIGNAL_API_KEY}`

            }

          }

        );

        console.log(
          "🔔 OneSignal đã gửi cảnh báo"
        );

      } catch (error) {

        console.error(
          "❌ OneSignal error:",
          error.response?.data ||
          error.message
        );

      }

    }

  }

);

// ======================================================
// MQTT ERROR / RECONNECT
// ======================================================

mqttClient.on(
  "error",
  (error) => {

    mqttConnected = false;

    console.error(
      "❌ MQTT error:",
      error.message
    );

  }
);

mqttClient.on(
  "reconnect",
  () => {

    mqttConnected = false;

    console.log(
      "🔄 MQTT reconnecting..."
    );

  }
);

mqttClient.on(
  "close",
  () => {

    mqttConnected = false;

    console.log(
      "⚠️ MQTT connection closed"
    );

  }
);

// ======================================================
// START
// ======================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 Smart4 Server chạy port ${PORT}`
    );

    console.log(
      `📡 MQTT topic: ${MQTT_TOPIC}`
    );

  }
);