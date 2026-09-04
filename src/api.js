// =============================================================
// api.js  — Capa de comunicación entre React y el backend
// Coloca este archivo en:  src/api.js
//
// En poa_app.jsx reemplaza las clases de servicio que tocan
// datos (POAService, ActividadService, etc.) por llamadas a
// estas funciones.  AuthService, CalendarioService y
// AlertaService de lógica pura NO cambian.
// =============================================================

const BASE_URL = 'https://poa-base-backend.onrender.com';
// ── Helper interno ────────────────────────────────────────────
// Adjunta el token JWT a cada petición y lanza error si el
// servidor responde con un status de error.
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('poa_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.mensaje || 'Error en la petición');
  return data;
}

// =============================================================
// AUTH
// =============================================================
export const AuthAPI = {
  /**
   * Inicia sesión. Guarda el token en localStorage.
   * @returns {{ usuario, token }}
   */
  async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('poa_token', data.token);
    return data;
  },

  /** Cierra sesión eliminando el token local. */
  logout() {
    localStorage.removeItem('poa_token');
  },

  /** Devuelve true si hay token guardado (sesión activa). */
  isLoggedIn() {
    return !!localStorage.getItem('poa_token');
  },
};

// =============================================================
// POAs
// =============================================================
export const POAAPI = {
  /** Obtiene todos los POAs, con filtros opcionales. */
  async listar({ anio = '', estado = '' } = {}) {
    const params = new URLSearchParams();
    if (anio)   params.append('anio', anio);
    if (estado) params.append('estado', estado);
    const qs = params.toString() ? `?${params}` : '';
    return apiFetch(`/poas${qs}`);
  },

  /** Obtiene un POA por id. */
  async obtener(id) {
    return apiFetch(`/poas/${id}`);
  },

  /** Crea un nuevo POA. */
  async crear(datos) {
    return apiFetch('/poas', {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  /** Edita un POA existente. */
  async editar(id, datos) {
    return apiFetch(`/poas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
  },

  /** Elimina un POA (el backend valida actividades pendientes). */
  async eliminar(id) {
    return apiFetch(`/poas/${id}`, { method: 'DELETE' });
  },

  /** Obtiene las metas de un POA. */
  async metas(poaId) {
    return apiFetch(`/poas/${poaId}/metas`);
  },

  /** Crea una meta dentro de un POA. */
  async crearMeta(poaId, datos) {
    return apiFetch(`/poas/${poaId}/metas`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },
};

// =============================================================
// ACTIVIDADES
// =============================================================
export const ActividadAPI = {
  /** Obtiene todas las actividades (dashboard / calendario). */
  async listar() {
    return apiFetch('/actividades');
  },

  /** Obtiene actividades de una meta específica. */
  async porMeta(metaId) {
    return apiFetch(`/metas/${metaId}/actividades`);
  },

  /** Registra una nueva actividad. */
  async registrar(metaId, datos) {
    return apiFetch(`/metas/${metaId}/actividades`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  /** Edita una actividad existente. */
  async editar(id, datos) {
    return apiFetch(`/actividades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
  },

  /** Elimina una actividad. */
  async eliminar(id) {
    return apiFetch(`/actividades/${id}`, { method: 'DELETE' });
  },
};

// =============================================================
// AVANCES
// =============================================================
export const AvanceAPI = {
  /** Historial de avances de una actividad. */
  async historial(actividadId) {
    return apiFetch(`/actividades/${actividadId}/avances`);
  },

  /** Obtiene todos los avances (para cálculo de progreso global). */
  async listar() {
    return apiFetch('/avances');
  },

  /** Registra un nuevo avance. */
  async registrar(actividadId, datos) {
    return apiFetch(`/actividades/${actividadId}/avances`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },
};

// =============================================================
// ALERTAS
// =============================================================
export const AlertaAPI = {
  /** Obtiene las alertas generadas por la vista SQL del backend. */
  async listar() {
    return apiFetch('/alertas');
  },
};
