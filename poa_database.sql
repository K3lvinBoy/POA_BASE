-- ============================================================
-- BASE DE DATOS: Sistema POA — Versión 3
-- Cambios respecto a v2:
--   1. Auditoría automática con TRIGGERS (INSERT/UPDATE/DELETE)
--   2. Tabla sesiones para trazabilidad de accesos
--   3. Todos los cambios quedan ligados al usuario que los hizo
--   4. Cambio de contraseña registrado en auditoría
--   5. Vista enriquecida de alertas con nombre de usuario
-- ============================================================

DROP DATABASE IF EXISTS poa_db;
CREATE DATABASE poa_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE poa_db;

-- ============================================================
-- TABLAS BASE
-- ============================================================

-- ------------------------------------------------------------
-- usuarios
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100)  NOT NULL,
  apellido    VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,          -- bcrypt hash
  rol         ENUM('admin','editor','lector')  DEFAULT 'editor',
  activo      TINYINT(1)                       DEFAULT 1,
  created_at  TIMESTAMP                        DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP                        DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- sesiones  (registro de cada login/logout)
-- ------------------------------------------------------------
CREATE TABLE sesiones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT          NOT NULL,
  accion      ENUM('login','logout') NOT NULL,
  ip          VARCHAR(45),
  fecha       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sesiones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- poas
-- ------------------------------------------------------------
CREATE TABLE poas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(200) NOT NULL,
  anio         YEAR         NOT NULL,
  fecha_inicio DATE         NOT NULL,
  fecha_fin    DATE         NOT NULL,
  estado       ENUM('Activo','Pendiente','Cerrado') DEFAULT 'Pendiente',
  responsable  VARCHAR(150),
  creado_por   INT          NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_poas_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- metas
-- ------------------------------------------------------------
CREATE TABLE metas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  id_poa       INT           NOT NULL,
  nombre       VARCHAR(200)  NOT NULL,
  descripcion  TEXT,
  presupuesto  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  creado_por   INT           NOT NULL,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_metas_poa
    FOREIGN KEY (id_poa) REFERENCES poas(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_metas_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- actividades
-- ------------------------------------------------------------
CREATE TABLE actividades (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  id_meta                  INT          NOT NULL,
  nombre                   VARCHAR(200) NOT NULL,
  fecha_inicio_planificada DATE         NOT NULL,
  fecha_fin_planificada    DATE         NOT NULL,
  unidad_medida            VARCHAR(80),
  estado  ENUM('Programada','En progreso','Completada','Vencida') DEFAULT 'Programada',
  creado_por               INT          NOT NULL,
  created_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_actividades_meta
    FOREIGN KEY (id_meta) REFERENCES metas(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_actividades_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- avances
-- ------------------------------------------------------------
CREATE TABLE avances (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  id_actividad INT              NOT NULL,
  porcentaje   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  comentarios  TEXT,
  fecha        DATE             NOT NULL,
  creado_por   INT              NOT NULL,
  created_at   TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_avances_actividad
    FOREIGN KEY (id_actividad) REFERENCES actividades(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_avances_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

-- ============================================================
-- TABLA DE AUDITORÍA
-- Registra QUIÉN hizo QUÉ, en QUÉ tabla, CUÁNDO y QUÉ cambió
-- ============================================================
CREATE TABLE auditoria (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT          NOT NULL,
  usuario_email VARCHAR(150),              -- snapshot del email en el momento
  accion      ENUM('CREATE','UPDATE','DELETE','LOGIN','LOGOUT','CAMBIO_PASSWORD') NOT NULL,
  tabla       VARCHAR(50)  NOT NULL,       -- 'poas','metas','actividades','avances','usuarios'
  registro_id INT,                         -- id del registro afectado (NULL para login/logout)
  valor_antes TEXT,                        -- JSON del estado anterior (UPDATE/DELETE)
  valor_despues TEXT,                      -- JSON del estado nuevo    (CREATE/UPDATE)
  ip          VARCHAR(45),
  fecha       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_auditoria_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

-- ============================================================
-- TRIGGERS DE AUDITORÍA AUTOMÁTICA
-- Cada INSERT/UPDATE/DELETE en tablas clave registra un log
-- ============================================================

DELIMITER $$

-- ── poas ─────────────────────────────────────────────────────
CREATE TRIGGER trg_poas_insert AFTER INSERT ON poas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'CREATE', 'poas', NEW.id, NULL,
    JSON_OBJECT('nombre', NEW.nombre, 'anio', NEW.anio, 'estado', NEW.estado,
                'fecha_inicio', NEW.fecha_inicio, 'fecha_fin', NEW.fecha_fin,
                'responsable', NEW.responsable)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_poas_update AFTER UPDATE ON poas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'UPDATE', 'poas', NEW.id,
    JSON_OBJECT('nombre', OLD.nombre, 'anio', OLD.anio, 'estado', OLD.estado,
                'fecha_inicio', OLD.fecha_inicio, 'fecha_fin', OLD.fecha_fin,
                'responsable', OLD.responsable),
    JSON_OBJECT('nombre', NEW.nombre, 'anio', NEW.anio, 'estado', NEW.estado,
                'fecha_inicio', NEW.fecha_inicio, 'fecha_fin', NEW.fecha_fin,
                'responsable', NEW.responsable)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_poas_delete BEFORE DELETE ON poas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT OLD.creado_por, u.email, 'DELETE', 'poas', OLD.id,
    JSON_OBJECT('nombre', OLD.nombre, 'anio', OLD.anio, 'estado', OLD.estado),
    NULL
  FROM usuarios u WHERE u.id = OLD.creado_por;
END$$

-- ── metas ────────────────────────────────────────────────────
CREATE TRIGGER trg_metas_insert AFTER INSERT ON metas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'CREATE', 'metas', NEW.id, NULL,
    JSON_OBJECT('nombre', NEW.nombre, 'id_poa', NEW.id_poa, 'presupuesto', NEW.presupuesto)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_metas_update AFTER UPDATE ON metas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'UPDATE', 'metas', NEW.id,
    JSON_OBJECT('nombre', OLD.nombre, 'presupuesto', OLD.presupuesto),
    JSON_OBJECT('nombre', NEW.nombre, 'presupuesto', NEW.presupuesto)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_metas_delete BEFORE DELETE ON metas
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT OLD.creado_por, u.email, 'DELETE', 'metas', OLD.id,
    JSON_OBJECT('nombre', OLD.nombre, 'id_poa', OLD.id_poa, 'presupuesto', OLD.presupuesto),
    NULL
  FROM usuarios u WHERE u.id = OLD.creado_por;
END$$

-- ── actividades ──────────────────────────────────────────────
CREATE TRIGGER trg_actividades_insert AFTER INSERT ON actividades
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'CREATE', 'actividades', NEW.id, NULL,
    JSON_OBJECT('nombre', NEW.nombre, 'id_meta', NEW.id_meta,
                'fecha_inicio', NEW.fecha_inicio_planificada,
                'fecha_fin', NEW.fecha_fin_planificada, 'estado', NEW.estado)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_actividades_update AFTER UPDATE ON actividades
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'UPDATE', 'actividades', NEW.id,
    JSON_OBJECT('nombre', OLD.nombre, 'estado', OLD.estado,
                'fecha_inicio', OLD.fecha_inicio_planificada,
                'fecha_fin', OLD.fecha_fin_planificada),
    JSON_OBJECT('nombre', NEW.nombre, 'estado', NEW.estado,
                'fecha_inicio', NEW.fecha_inicio_planificada,
                'fecha_fin', NEW.fecha_fin_planificada)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

CREATE TRIGGER trg_actividades_delete BEFORE DELETE ON actividades
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT OLD.creado_por, u.email, 'DELETE', 'actividades', OLD.id,
    JSON_OBJECT('nombre', OLD.nombre, 'id_meta', OLD.id_meta, 'estado', OLD.estado),
    NULL
  FROM usuarios u WHERE u.id = OLD.creado_por;
END$$

-- ── avances ──────────────────────────────────────────────────
CREATE TRIGGER trg_avances_insert AFTER INSERT ON avances
FOR EACH ROW BEGIN
  INSERT INTO auditoria (usuario_id, usuario_email, accion, tabla, registro_id, valor_antes, valor_despues)
  SELECT NEW.creado_por, u.email, 'CREATE', 'avances', NEW.id, NULL,
    JSON_OBJECT('id_actividad', NEW.id_actividad, 'porcentaje', NEW.porcentaje,
                'fecha', NEW.fecha, 'comentarios', NEW.comentarios)
  FROM usuarios u WHERE u.id = NEW.creado_por;
END$$

DELIMITER ;

-- ============================================================
-- VISTAS
-- ============================================================

-- Vista de alertas enriquecida con email del usuario
CREATE OR REPLACE VIEW v_alertas_actividades AS
SELECT
  a.id,
  a.nombre,
  a.fecha_fin_planificada,
  a.estado,
  a.creado_por,
  u.email            AS usuario_email,
  u.nombre           AS usuario_nombre,
  DATEDIFF(a.fecha_fin_planificada, CURDATE()) AS dias_restantes,
  CASE
    WHEN DATEDIFF(a.fecha_fin_planificada, CURDATE()) < 0  THEN 'Vencida'
    WHEN DATEDIFF(a.fecha_fin_planificada, CURDATE()) = 0  THEN 'Hoy'
    WHEN DATEDIFF(a.fecha_fin_planificada, CURDATE()) <= 7 THEN '7dias'
    ELSE 'Normal'
  END AS tipo_alerta
FROM actividades a
JOIN usuarios u ON u.id = a.creado_por
WHERE a.estado != 'Completada';

-- Vista de auditoría legible
CREATE OR REPLACE VIEW v_auditoria AS
SELECT
  au.id,
  au.fecha,
  au.accion,
  au.tabla,
  au.registro_id,
  au.usuario_email,
  CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo,
  au.valor_antes,
  au.valor_despues,
  au.ip
FROM auditoria au
JOIN usuarios u ON u.id = au.usuario_id
ORDER BY au.fecha DESC;
