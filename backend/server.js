// =============================================================
// BACKEND — Sistema POA
// Stack: Node.js + Express + MySQL2 + bcrypt + JWT
//
// Estructura de archivos que debes crear:
//   poa-backend/
//   ├── server.js          ← este archivo
//   ├── db.js              ← conexión a MySQL
//   ├── .env               ← variables de entorno (NO subir a git)
//   └── package.json       ← se genera con npm init
// =============================================================

// ── db.js ─────────────────────────────────────────────────────
// Crea un archivo separado llamado db.js con este contenido:
//
// const mysql = require('mysql2/promise');
// require('dotenv').config();
//
// const pool = mysql.createPool({
//   host:     process.env.DB_HOST     || 'localhost',
//   user:     process.env.DB_USER     || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME     || 'poa_db',
//   waitForConnections: true,
//   connectionLimit:    10,
// });
//
// module.exports = pool;
// ─────────────────────────────────────────────────────────────

// ── .env ──────────────────────────────────────────────────────
// Crea un archivo llamado .env con este contenido
// (cambia los valores según tu MySQL):
//
// DB_HOST=localhost
// DB_USER=root
// DB_PASSWORD=tu_contraseña_mysql
// DB_NAME=poa_db
// JWT_SECRET=una_clave_secreta_larga_y_dificil
// PORT=4000
// ─────────────────────────────────────────────────────────────

const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
require('dotenv').config();

// Importa el pool de conexiones (crea db.js aparte — ver arriba)
const pool = require('./db');

const app = express();
app.use(cors());               // permite peticiones desde React
app.use(express.json());       // parsea JSON en el body

// Sin caché en ningún endpoint — el navegador siempre consulta el servidor.
// Esto garantiza que los datos reflejen el estado real de la BD en tiempo real.
const sinCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
app.use(sinCache); // aplica a TODAS las rutas globalmente

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_poa_2026';

// =============================================================
// MIDDLEWARE — verifica JWT en rutas protegidas
// =============================================================
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ mensaje: 'Sin token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ mensaje: 'Token inválido' });
  }
}

// =============================================================
// AUTH — Iniciar Sesión
// POST /api/auth/login
// Body: { email, password }
// =============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ mensaje: 'Email y contraseña requeridos' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );
    const usuario = rows[0];
    if (!usuario)
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok)
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    // Registrar sesión en la tabla sesiones
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    await pool.query('INSERT INTO sesiones (usuario_id, accion, ip) VALUES (?,?,?)', [usuario.id, 'login', ip]);
    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, rol: usuario.rol } });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error del servidor', error: err.message });
  }
});

// Endpoint de utilidad para crear el primer usuario admin con hash correcto
// Úsalo UNA sola vez desde Postman o curl, luego puedes eliminarlo
// POST /api/auth/setup  Body: { nombre, apellido, email, password }
app.post('/api/auth/setup', async (req, res) => {
  const { nombre, apellido, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?,?,?,?,?)',
      [nombre, apellido, email, hash, 'admin']
    );
    res.json({ mensaje: 'Usuario admin creado' });
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// POST /api/auth/registro  — Crear cuenta de usuario nuevo
// Body: { nombre, apellido, email, password }
app.post('/api/auth/registro', async (req, res) => {
  const { nombre, apellido, email, password } = req.body;
  if (!nombre || !apellido || !email || !password)
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?,?,?,?,?)',
      [nombre, apellido, email, hash, 'editor']
    );
    res.status(201).json({ mensaje: 'Usuario creado correctamente', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'El email ya está registrado' });
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// USUARIO — Perfil y cambio de contraseña
// =============================================================

// GET /api/usuario/perfil
app.get('/api/usuario/perfil', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, email, rol, created_at FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// PUT /api/usuario/perfil  — Actualizar nombre, apellido, email
app.put('/api/usuario/perfil', authMiddleware, async (req, res) => {
  const { nombre, apellido, email } = req.body;
  if (!nombre || !apellido || !email)
    return res.status(400).json({ mensaje: 'Nombre, apellido y email son obligatorios' });
  try {
    await pool.query(
      'UPDATE usuarios SET nombre=?, apellido=?, email=? WHERE id=?',
      [nombre, apellido, email, req.user.id]
    );
    res.json({ mensaje: 'Perfil actualizado correctamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Ese email ya está en uso por otro usuario' });
    res.status(500).json({ mensaje: err.message });
  }
});

// PUT /api/usuario/cambiar-password
// Body: { passwordActual, passwordNueva }
app.put('/api/usuario/cambiar-password', authMiddleware, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;
  if (!passwordActual || !passwordNueva)
    return res.status(400).json({ mensaje: 'Contraseña actual y nueva son requeridas' });
  try {
    // Traemos también email para registrarlo en auditoría
    const [rows] = await pool.query('SELECT password, email FROM usuarios WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(passwordActual, rows[0].password);
    if (!ok) return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(passwordNueva, 10);
    await pool.query('UPDATE usuarios SET password=? WHERE id=?', [hash, req.user.id]);

    // Registrar en auditoría (la tabla tiene el tipo CAMBIO_PASSWORD en el schema SQL)
    await pool.query(
      `INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
       VALUES (?, ?, 'CAMBIO_PASSWORD', 'usuarios', ?, NULL, NULL)`,
      [req.user.id, rows[0].email, req.user.id]
    );

    res.json({ mensaje: 'Contraseña cambiada correctamente' });
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});


// =============================================================
// POAS — Consultar, Crear, Editar, Eliminar
// =============================================================

// GET /api/poas?anio=2026&estado=Activo
app.get('/api/poas', authMiddleware, async (req, res) => {
  const { anio, estado } = req.query;
  let sql = 'SELECT * FROM poas WHERE creado_por = ?';
  const params = [req.user.id];
  if (anio)   { sql += ' AND anio = ?';   params.push(anio); }
  if (estado) { sql += ' AND estado = ?'; params.push(estado); }
  sql += ' ORDER BY anio DESC';
  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// GET /api/poas/:id
app.get('/api/poas/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM poas WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'POA no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// POST /api/poas
app.post('/api/poas', authMiddleware, async (req, res) => {
  const { nombre, anio, fecha_inicio, fecha_fin, estado, responsable } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO poas (nombre, anio, fecha_inicio, fecha_fin, estado, responsable, creado_por) VALUES (?,?,?,?,?,?,?)',
      [nombre, anio, fecha_inicio, fecha_fin, estado || 'Pendiente', responsable, req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM poas WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// PUT /api/poas/:id
app.put('/api/poas/:id', authMiddleware, async (req, res) => {
  const { nombre, anio, fecha_inicio, fecha_fin, estado, responsable } = req.body;
  try {
    await pool.query(
      'UPDATE poas SET nombre=?, anio=?, fecha_inicio=?, fecha_fin=?, estado=?, responsable=? WHERE id=?',
      [nombre, anio, fecha_inicio, fecha_fin, estado, responsable, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM poas WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// DELETE /api/poas/:id  (valida actividades pendientes antes de borrar)
app.delete('/api/poas/:id', authMiddleware, async (req, res) => {
  try {
    const [poas] = await pool.query('SELECT * FROM poas WHERE id = ?', [req.params.id]);
    const poa = poas[0];
    if (!poa) return res.status(404).json({ mensaje: 'POA no encontrado' });

    if (poa.estado === 'Activo') {
      const [pendientes] = await pool.query(
        `SELECT a.id FROM actividades a
         JOIN metas m ON a.id_meta = m.id
         WHERE m.id_poa = ? AND a.estado != 'Completada'`,
        [req.params.id]
      );
      if (pendientes.length > 0)
        return res.status(409).json({ mensaje: 'No puedes eliminar un POA activo con actividades pendientes' });
    }

    await pool.query('DELETE FROM poas WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'POA eliminado' });
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// METAS
// =============================================================

// GET /api/poas/:poaId/metas
app.get('/api/poas/:poaId/metas', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.* FROM metas m JOIN poas p ON p.id = m.id_poa WHERE m.id_poa = ? AND p.creado_por = ?`,
      [req.params.poaId, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// POST /api/poas/:poaId/metas
app.post('/api/poas/:poaId/metas', authMiddleware, async (req, res) => {
  const { nombre, descripcion, presupuesto } = req.body;
  if (!nombre || !presupuesto)
    return res.status(400).json({ mensaje: 'Nombre y presupuesto son obligatorios' });
  try {
    const [result] = await pool.query(
      'INSERT INTO metas (id_poa, nombre, descripcion, presupuesto, creado_por) VALUES (?,?,?,?,?)',
      [req.params.poaId, nombre, descripcion, presupuesto, req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM metas WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// PUT /api/metas/:id
app.put('/api/metas/:id', authMiddleware, async (req, res) => {
  const { nombre, descripcion, presupuesto } = req.body;
  if (!nombre || !presupuesto)
    return res.status(400).json({ mensaje: 'Nombre y presupuesto son obligatorios' });
  try {
    await pool.query(
      'UPDATE metas SET nombre=?, descripcion=?, presupuesto=? WHERE id=?',
      [nombre, descripcion, presupuesto, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM metas WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Meta no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// ACTIVIDADES — Registrar, Editar, Eliminar
// =============================================================

// GET /api/actividades  (todas, para el dashboard y calendario)
app.get('/api/actividades', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.* FROM actividades a
       JOIN metas m ON m.id = a.id_meta
       JOIN poas  p ON p.id = m.id_poa
       WHERE p.creado_por = ?
       ORDER BY a.fecha_inicio_planificada`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// GET /api/metas/:metaId/actividades
app.get('/api/metas/:metaId/actividades', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM actividades WHERE id_meta = ? ORDER BY fecha_inicio_planificada',
      [req.params.metaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// POST /api/metas/:metaId/actividades  — Registrar actividad
app.post('/api/metas/:metaId/actividades', authMiddleware, async (req, res) => {
  const { nombre, fecha_inicio_planificada, fecha_fin_planificada, unidad_medida } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO actividades
         (id_meta, nombre, fecha_inicio_planificada, fecha_fin_planificada, unidad_medida, estado, creado_por)
       VALUES (?,?,?,?,?,'Programada',?)`,
      [req.params.metaId, nombre, fecha_inicio_planificada, fecha_fin_planificada, unidad_medida, req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM actividades WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// PUT /api/actividades/:id  — Editar actividad
app.put('/api/actividades/:id', authMiddleware, async (req, res) => {
  const { nombre, fecha_inicio_planificada, fecha_fin_planificada, unidad_medida, estado, id_meta } = req.body;
  try {
    await pool.query(
      'UPDATE actividades SET nombre=?, fecha_inicio_planificada=?, fecha_fin_planificada=?, unidad_medida=?, estado=?, id_meta=? WHERE id=?',
      [nombre, fecha_inicio_planificada, fecha_fin_planificada, unidad_medida, estado, id_meta, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM actividades WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// DELETE /api/actividades/:id  — Eliminar actividad
app.delete('/api/actividades/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM actividades WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Actividad eliminada' });
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// AVANCES — Registrar avance
// =============================================================

// GET /api/actividades/:actividadId/avances
app.get('/api/actividades/:actividadId/avances', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM avances WHERE id_actividad = ? ORDER BY fecha DESC',
      [req.params.actividadId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// GET /api/avances  (todos, para el progreso en metas/dashboard)
app.get('/api/avances', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT av.* FROM avances av
       JOIN actividades a ON a.id = av.id_actividad
       JOIN metas m       ON m.id = a.id_meta
       JOIN poas  p       ON p.id = m.id_poa
       WHERE p.creado_por = ?
       ORDER BY av.fecha DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// POST /api/actividades/:actividadId/avances  — Registrar avance
app.post('/api/actividades/:actividadId/avances', authMiddleware, async (req, res) => {
  const { porcentaje, comentarios } = req.body;
  const fecha = new Date().toISOString().slice(0, 10);
  try {
    const [result] = await pool.query(
      'INSERT INTO avances (id_actividad, porcentaje, comentarios, fecha, creado_por) VALUES (?,?,?,?,?)',
      [req.params.actividadId, porcentaje, comentarios, fecha, req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM avances WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// ALERTAS — Generar alerta de actividades (usa la vista SQL)
// GET /api/alertas
// =============================================================
app.get('/api/alertas', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM v_alertas_actividades WHERE tipo_alerta != 'Normal' AND creado_por = ?",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ mensaje: err.message });
  }
});

// =============================================================
// ARRANCAR EL SERVIDOR
// =============================================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ API POA corriendo en http://localhost:${PORT}`);
});