import React, { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// CONFIGURACIÓN DE LA API
// =============================================================================
const BASE_URL = 'https://poa-base-backend.onrender.com/api';

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

// =============================================================================
// CLASES DE SERVICIO
// =============================================================================

class AuthService {
  static async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('poa_token', data.token);
    return { ok: true, user: data.usuario };
  }
  static logout() {
    localStorage.removeItem('poa_token');
    return { user: null, route: '/login' };
  }
}

class POAService {
  static filtrar(poas, { year = '', estado = '' } = {}) {
    return poas.filter((p) => {
      if (year && String(p.anio) !== String(year)) return false;
      if (estado && p.estado !== estado) return false;
      return true;
    });
  }
  static async listar()        { return apiFetch('/poas'); }
  static async crear(datos) {
    return apiFetch('/poas', {
      method: 'POST',
      body: JSON.stringify({
        nombre: datos.nombre, anio: datos.anio,
        fecha_inicio: datos.fechaInicio, fecha_fin: datos.fechaFin,
        estado: datos.estado, responsable: datos.responsable,
      }),
    });
  }
  static async editar(id, datos) {
    return apiFetch(`/poas/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: datos.nombre, anio: datos.anio,
        fecha_inicio: datos.fechaInicio, fecha_fin: datos.fechaFin,
        estado: datos.estado, responsable: datos.responsable,
      }),
    });
  }
  static async eliminar(id)    { return apiFetch(`/poas/${id}`, { method: 'DELETE' }); }
  static obtenerActivo(poas)   { return poas.find((p) => p.estado === 'Activo'); }
}

class MetaService {
  static async listarPorPoa(poaId) { return apiFetch(`/poas/${poaId}/metas`); }
  static async crear(poaId, datos) {
    if (!datos.nombre || !datos.presupuesto)
      throw new Error('Nombre y presupuesto son obligatorios');
    return apiFetch(`/poas/${poaId}/metas`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  }
  static async editar(metaId, datos) {
    return apiFetch(`/metas/${metaId}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
  }
  static async eliminar(metaId) { return apiFetch(`/metas/${metaId}`, { method: 'DELETE' }); }
  static porPoa(metas, poaId) {
    return metas.filter((m) => m.id_poa === Number(poaId));
  }
  static calcularProgreso(actividades, avances, metaId) {
    const acts = actividades.filter((a) => a.id_meta === Number(metaId));
    const porcentajes = acts.map((a) => {
      const avs = avances.filter((x) => x.id_actividad === a.id);
      return avs.length ? Math.max(...avs.map((x) => x.porcentaje)) : 0;
    });
    if (!porcentajes.length) return 0;
    return Math.round(porcentajes.reduce((s, v) => s + v, 0) / porcentajes.length);
  }
}

class ActividadService {
  static async listar() { return apiFetch('/actividades'); }
  static async registrar(metaId, datos) {
    return apiFetch(`/metas/${metaId}/actividades`, {
      method: 'POST',
      body: JSON.stringify({
        nombre: datos.nombre,
        fecha_inicio_planificada: datos.fechaInicio,
        fecha_fin_planificada: datos.fechaFin,
        unidad_medida: datos.unidad,
      }),
    });
  }
  static async editar(id, datos) {
    return apiFetch(`/actividades/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: datos.nombre,
        fecha_inicio_planificada: datos.fechaInicio,
        fecha_fin_planificada: datos.fechaFin,
        unidad_medida: datos.unidad,
        estado: datos.estado || 'Programada',
        id_meta: Number(datos.selMeta),
      }),
    });
  }
  static async eliminar(id) { return apiFetch(`/actividades/${id}`, { method: 'DELETE' }); }
  static porMeta(actividades, metaId) {
    return actividades.filter((a) => a.id_meta === Number(metaId));
  }
  static proximasDias(actividades, dias = 7) {
    const today = new Date();
    return actividades.filter((a) => {
      if (!a.fecha_inicio_planificada) return false;
      const inicio = new Date(a.fecha_inicio_planificada);
      const diff = Math.ceil((inicio - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= dias;
    });
  }
  static contarDelMes(actividades) {
    const hoy = new Date();
    return actividades.filter((a) => {
      const fecha = new Date(a.fecha_inicio_planificada);
      return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear();
    }).length;
  }
}

class AlertaService {
  static async listar() { return apiFetch('/alertas'); }
  static generar(actividades) {
    const today = new Date();
    return actividades
      .map((a) => {
        const end = new Date(a.fecha_fin_planificada);
        const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        let tipo = 'Normal';
        if (diff < 0) tipo = 'Vencida';
        else if (diff === 0) tipo = 'Hoy';
        else if (diff <= 7) tipo = '7dias';
        return { actividad: a, tipo, dias: diff };
      })
      .filter((a) => a.tipo !== 'Normal');
  }
}

class CalendarioService {
  static MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  static calcularMes(currentDate) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = first.getDay();
    return { year, month, monthName: CalendarioService.MESES[month], daysInMonth, startDay };
  }
  static calcularEventos(actividades, avances) {
    const hoy = new Date();
    return actividades.map((a) => {
      const inicio = new Date(a.fecha_inicio_planificada);
      const fin = new Date(a.fecha_fin_planificada);
      const avancesAct = avances.filter((av) => av.id_actividad === a.id);
      const maxAvance = avancesAct.length ? Math.max(...avancesAct.map((av) => av.porcentaje)) : 0;
      let estadoFinal = 'Programada';
      if (maxAvance >= 100) estadoFinal = 'Completada';
      else if (fin < hoy) estadoFinal = 'Vencida';
      else if (inicio <= hoy) estadoFinal = 'En progreso';
      const color =
        estadoFinal === 'Programada'    ? 'bg-[#1a73e8] text-white'
        : estadoFinal === 'En progreso' ? 'bg-[#fbbc04] text-black'
        : estadoFinal === 'Completada'  ? 'bg-[#1e8e3e] text-white'
        :                                 'bg-[#d93025] text-white';
      return { ...a, estadoFinal, color };
    });
  }
  static eventosDel(eventos, year, month, day) {
    const current = new Date(year, month, day);
    return eventos.filter((e) => {
      const start = new Date(e.fecha_inicio_planificada);
      const end = new Date(e.fecha_fin_planificada);
      return current >= start && current <= end;
    });
  }
  static mesAnterior(d) { return new Date(d.getFullYear(), d.getMonth() - 1, 1); }
  static mesSiguiente(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
}

class AvanceService {
  static async listar() { return apiFetch('/avances'); }
  static async registrar(actividadId, datos) {
    return apiFetch(`/actividades/${actividadId}/avances`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  }
  static historial(avances, actividadId) {
    return avances
      .filter((v) => v.id_actividad === actividadId)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
}

// =============================================================================
// COMPONENTES — todos definidos FUERA de POAApp para evitar remounts
// =============================================================================

// ¿Desde dónde se llegó a una actividad? Así "Volver" regresa a Alertas,
// Calendario o Inicio en lugar de mandar siempre a la Meta.
function origenDesde(ruta) {
  if (ruta === '/alertas')   return { route: ruta, label: 'Alertas' };
  if (ruta === '/dashboard') return { route: ruta, label: 'Inicio' };
  if (ruta === '/calendario' || ruta.endsWith('/calendario')) return { route: ruta, label: 'Calendario' };
  return null; // desde una Meta (u otra pantalla): se vuelve a la Meta
}
function destinoVolver(origen, idMeta) {
  return origen
    ? { ruta: origen.route, etiqueta: origen.label }
    : { ruta: `/meta/${idMeta}`, etiqueta: 'la Meta' };
}

// Fecha legible: "01 ene 2026" (las fechas llegan del servidor como ISO en UTC)
function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d)) return String(f).slice(0, 10);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Iconos de línea (24x24) para menú y tarjetas
const ICONOS = {
  inicio:   'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  poas:     'M9 3h6a1 1 0 011 1v1h2a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h2V4a1 1 0 011-1zM8 12h8M8 16h5',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  config:   'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  alerta:   'M6 17v-6a6 6 0 1112 0v6l2 2H4l2-2zM10 21h4',
  meta:     'M5 21V4M5 4h12l-2 4 2 4H5',
  check:    'M9 12l2 2 4-4M12 21a9 9 0 100-18 9 9 0 000 18z',
  salir:    'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11',
};

function Icono({ nombre, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONOS[nombre]} />
    </svg>
  );
}

function Sidebar({ route, navigate, user, onLogout }) {
  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen p-4 flex flex-col flex-shrink-0">
      <div className="mb-6 flex items-center gap-3 px-1">
        <img
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS0lUOdC3FC0Ee_Rv-sTShXPjPQHzDcWb0vEK_fio8eJ60hQDTT"
          alt="Logo"
          className="w-12 h-12 rounded-xl object-cover shadow-sm"
        />
        <div>
          <div className="font-bold text-[#871A1A] leading-tight">Sistema POA</div>
          <div className="text-xs text-slate-500">KEALAR TECNOLOGY</div>
        </div>
      </div>
      <nav className="space-y-1">
        {[
          ['/dashboard',     'Inicio',          'inicio'],
          ['/gestion-poas',  'Gestión de POAs', 'poas'],
          ['/calendario',    'Calendario',      'calendar'],
          ['/configuracion', 'Configuración',   'config'],
          ['/alertas',       'Alertas',         'alerta'],
        ].map(([rt, label, icono]) => {
          const activo = route === rt;
          return (
            <button
              key={rt}
              onClick={() => navigate(rt)}
              aria-current={activo ? 'page' : undefined}
              className={`w-full flex items-center gap-3 text-left px-4 py-2.5 rounded-full font-medium transition-colors ${
                activo
                  ? 'bg-[#f7dede] text-[#871A1A]'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icono nombre={icono} className={`w-5 h-5 ${activo ? 'text-[#871A1A]' : 'text-slate-500'}`} />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-slate-200">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-9 h-9 rounded-full bg-[#871A1A] text-white flex items-center justify-center font-bold">
            {(user?.nombre || 'I').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{user?.nombre || 'Invitado'}</div>
            <div className="text-xs text-slate-500">Usuario</div>
          </div>
        </div>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-full text-sm font-medium text-[#d93025] hover:bg-[#fce8e6] transition-colors">
          <Icono nombre="salir" className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function Header({ user }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
      <h2 className="text-xl font-bold text-[#871A1A]">Bienvenidos</h2>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="w-2.5 h-2.5 rounded-full bg-[#1e8e3e]" aria-hidden="true" />
        {user ? `Conectado como ${user.nombre}` : 'No autenticado'}
      </div>
    </div>
  );
}

// Imágenes del carrusel (están en public/img/)
const SLIDES = [
  '/img/1.png',
  '/img/2.jpg',
  '/img/3.jpg',
  '/img/4.jpg',
];

function LoginCarousel() {
  const [actual, setActual] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActual((prev) => (prev + 1) % SLIDES.length);
    }, 5000); // cambia cada 5 segundos
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-gray-900">
      {SLIDES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={`Imagen ${i + 1}`}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'cover',       // llena la pantalla sin deformar
            objectPosition: 'center',
            opacity: i === actual ? 1 : 0,
            transition: 'opacity 1s ease-in-out',
          }}
        />
      ))}
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [cargando, setCargando] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const result = await AuthService.login(email, password);
      onLogin(result.user);
    } catch (err) {
      const msg = err?.message || '';
      if (msg === 'Failed to fetch') {
        setError('No se pudo conectar con el servidor. Si estaba inactivo, espera 1 minuto e intenta de nuevo.');
      } else {
        setError(msg || 'Credenciales inválidas. Verifica tu email y contraseña.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      {/* Carrusel de fondo */}
      <LoginCarousel />

      {/* Login encima del carrusel */}
      <div className="relative z-10 w-full max-w-md bg-white shadow-2xl p-8 rounded-3xl border-t-4 border-[#871A1A]">
        <div className="flex items-center gap-4 mb-6">
          <img
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS0lUOdC3FC0Ee_Rv-sTShXPjPQHzDcWb0vEK_fio8eJ60hQDTT"
            alt="Logo"
            className="w-14 h-14 rounded object-cover"
          />
          <div>
            <h1 className="text-xl font-bold">Iniciar Sesión</h1>
            <p className="text-sm text-gray-500">Sistema POA - Tetla De La Solidaridad</p>
          </div>
        </div>
        <form onSubmit={handle} className="space-y-3">
          <div>
            <label className="block text-sm">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" type="email" required />
          </div>
          <div>
            <label className="block text-sm">Contraseña</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" type="password" required />
          </div>
          {error && <div className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors">{error}</div>}
          <div className="flex justify-end">
            <button disabled={cargando}
              className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors disabled:opacity-50">
              {cargando ? 'Entrando...' : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ poas, metas, actividades, alerts, navigate }) {
  const poasActivos       = poas.filter((p) => p.estado === 'Activo').length;
  const metasEnProgreso   = metas.length;
  const actividadesMes    = ActividadService.contarDelMes(actividades);
  const alertasPendientes = alerts.length;
  const poaActivo         = POAService.obtenerActivo(poas);
  const upcoming          = ActividadService.proximasDias(actividades, 7);

  const tarjetasConteo = (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        // [etiqueta, valor, icono, fondo, color del texto/icono, fondo del icono]
        ['POAs Activos',        poasActivos,       'poas',     'bg-[#fbeaea]', 'text-[#871A1A]', 'bg-[#871A1A]'],
        ['Metas',               metasEnProgreso,   'meta',     'bg-[#e8f0fe]', 'text-[#1967d2]', 'bg-[#1a73e8]'],
        ['Actividades del Mes', actividadesMes,    'calendar', 'bg-[#e6f4ea]', 'text-[#137333]', 'bg-[#1e8e3e]'],
        ['Alertas',             alertasPendientes, 'alerta',   'bg-[#fef7e0]', 'text-[#b06000]', 'bg-[#f9ab00]'],
      ].map(([label, val, icono, fondo, texto, fondoIcono]) => (
        <div key={label} className={`p-4 rounded-2xl flex items-center gap-4 ${fondo}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0 ${fondoIcono}`}>
            <Icono nombre={icono} className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-slate-600">{label}</div>
            <div className={`text-3xl font-bold leading-tight ${texto}`}>{val}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const proximasPanel = (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <h3 className="font-semibold mb-3 text-slate-800 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center">
          <Icono nombre="calendar" className="w-4 h-4" />
        </span>
        Próximas actividades (7 días)
      </h3>
      <ul className="space-y-2 text-sm">
        {upcoming.length === 0 && <li className="text-gray-500">No hay actividades próximas</li>}
        {upcoming.map((a) => (
          <li key={a.id} className="border border-slate-200 bg-white p-3 rounded-xl flex justify-between items-center hover:border-[#1a73e8]/40 hover:shadow-md transition">
            <div>
              <div className="font-medium">{a.nombre}</div>
              <div className="text-xs text-gray-500">{fmtFecha(a.fecha_inicio_planificada)} → {fmtFecha(a.fecha_fin_planificada)}</div>
            </div>
            <button className="text-sm text-[#1a73e8] font-medium px-3 py-1 rounded-full hover:bg-[#e8f0fe] transition-colors" onClick={() => navigate(`/actividad/${a.id}`)}>Ver</button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!poaActivo) {
    return (
      <div className="p-6 space-y-6">
        {tarjetasConteo}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-[#871A1A] mb-3">POA activo actual</h3>
            <div className="text-gray-500 text-sm">No hay un POA activo actualmente.</div>
          </div>
          {proximasPanel}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {tarjetasConteo}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#871A1A] via-[#d93025] to-[#f9ab00]" />
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#871A1A]">POA activo actual</h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e6f4ea] text-[#137333] text-xs font-semibold rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#1e8e3e]" aria-hidden="true" />
                {poaActivo.estado}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Nombre',      poaActivo.nombre],
                ['Año',         poaActivo.anio],
                ['Período',     `${fmtFecha(poaActivo.fecha_inicio)} — ${fmtFecha(poaActivo.fecha_fin)}`],
                ['Responsable', poaActivo.responsable || 'No asignado'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-semibold text-slate-900">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {proximasPanel}
      </div>
    </div>
  );
}

function GestionPoas({ poas, setPoas, metas, actividades, navigate }) {
  const [filterYear, setFilterYear]     = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const filtered = POAService.filtrar(poas, { year: filterYear, estado: filterEstado });

  const handleEliminar = async (id) => {
    const poa = poas.find((p) => p.id === id);
    if (!poa) return;
    if (poa.estado === 'Activo') {
      const tienePendientes = actividades.some((a) => {
        const meta = metas.find((m) => m.id === a.id_meta);
        return meta?.id_poa === poa.id && a.estado !== 'Completada';
      });
      if (tienePendientes) { alert('No puedes eliminar un POA activo con actividades pendientes'); return; }
    }
    if (!window.confirm('¿Eliminar POA? Esta acción requiere confirmación doble.')) return;
    if (!window.confirm('¿Está SEGURO? Esta acción es irreversible.')) return;
    try {
      await POAService.eliminar(id);
      setPoas((prev) => prev.filter((p) => p.id !== id));
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Gestión de POAs</h3>
        <button onClick={() => navigate('/poa/nuevo')} className="bg-[#871A1A] hover:bg-[#6b1313] text-white px-5 py-2 rounded-full shadow-sm font-medium transition-colors">+ Nuevo POA</button>
      </div>
      <div className="mb-4 flex gap-2">
        <input placeholder="Año" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="border border-slate-300 px-2 py-1 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="border border-slate-300 px-2 py-1 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]">
          <option value="">Todos</option>
          <option>Activo</option>
          <option>Pendiente</option>
          <option>Cerrado</option>
        </select>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#871A1A] text-white">
            <tr>
              <th className="p-3 text-left font-semibold">Año</th>
              <th className="p-3 text-left font-semibold">Nombre</th>
              <th className="p-3 text-left font-semibold">Estado</th>
              <th className="p-3 text-left font-semibold">Fecha Inicio</th>
              <th className="p-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-gray-500 text-center">No hay POAs registrados.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                <td className="p-3">{p.anio}</td>
                <td className="p-3 font-medium text-slate-900">{p.nombre}</td>
                <td className="p-3"><span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${p.estado === 'Activo' ? 'bg-[#e6f4ea] text-[#137333]' : p.estado === 'Cerrado' ? 'bg-slate-100 text-slate-600' : 'bg-[#e8f0fe] text-[#1967d2]'}`}>{p.estado}</span></td>
                <td className="p-3">{fmtFecha(p.fecha_inicio)}</td>
                <td className="p-2 space-x-2 whitespace-nowrap">
                  <button className="bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1967d2] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors" onClick={() => navigate(`/poa/${p.id}`)}>Ver Detalles</button>
                  <button className="bg-[#fef7e0] hover:bg-[#feefc3] text-[#b06000] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors" onClick={() => navigate(`/poa/${p.id}/editar`)}>Editar</button>
                  <button className="bg-[#fce8e6] hover:bg-[#fad2cf] text-[#c5221f] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors" onClick={() => handleEliminar(p.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PoaForm({ poas, setPoas, navigate, editId }) {
  const editing = poas.find((p) => p.id === Number(editId));
  const [nombre, setNombre]           = useState(editing?.nombre       || '');
  const [anio, setAnio]               = useState(editing?.anio         || new Date().getFullYear());
  const [fechaInicio, setFechaInicio] = useState(editing?.fecha_inicio || '');
  const [fechaFin, setFechaFin]       = useState(editing?.fecha_fin    || '');
  const [estado, setEstado]           = useState(editing?.estado       || 'Pendiente');
  const [responsable, setResponsable] = useState(editing?.responsable  || '');

  const save = async () => {
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    const datos = { nombre, anio, fechaInicio, fechaFin, estado, responsable };
    try {
      if (editing) {
        const updated = await POAService.editar(editing.id, datos);
        setPoas((prev) => prev.map((p) => (p.id === editing.id ? updated : p)));
        navigate(`/poa/${editing.id}`);
      } else {
        const nuevo = await POAService.crear(datos);
        setPoas((prev) => [...prev, nuevo]);
        navigate('/gestion-poas');
      }
    } catch (err) { alert('Error al guardar: ' + err.message); }
  };

  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate('/gestion-poas')} className="text-sm text-gray-500 hover:underline">← Volver a Gestión de POAs</button>
      </div>
      <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar POA' : 'Crear POA'}</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3 max-w-xl">
        <div>
          <label className="text-sm">Nombre del POA *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div>
          <label className="text-sm">Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div>
          <label className="text-sm">Responsable</label>
          <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" placeholder="Ej: Lic. Francisco Navarrete" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm">Fecha Inicio</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          </div>
          <div className="flex-1">
            <label className="text-sm">Fecha Fin</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          </div>
        </div>
        <div>
          <label className="text-sm">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]">
            <option>Activo</option>
            <option>Pendiente</option>
            <option>Cerrado</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => navigate('/gestion-poas')} className="px-5 py-2 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={save} className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function PoaDetail({ id, poas, metas, setMetas, actividades = [], setActividades, setAvances, navigate }) {
  const poa = poas.find((p) => p.id === Number(id));
  const [cargandoMetas, setCargandoMetas] = useState(false);

  // Elimina una meta (también dentro de un POA activo). El backend borra en cascada
  // sus actividades y avances; aquí se limpia el estado local para reflejarlo.
  const handleEliminarMeta = async (meta) => {
    const actsMeta = actividades.filter((a) => a.id_meta === meta.id);
    const aviso = actsMeta.length > 0
      ? `¿Eliminar la meta "${meta.nombre}"?\n\nTambién se eliminarán sus ${actsMeta.length} actividad(es) y sus avances. Esta acción es irreversible.`
      : `¿Eliminar la meta "${meta.nombre}"? Esta acción es irreversible.`;
    if (!window.confirm(aviso)) return;
    try {
      await MetaService.eliminar(meta.id);
      const idsActs = new Set(actsMeta.map((a) => a.id));
      setMetas((prev) => prev.filter((m) => m.id !== meta.id));
      if (setActividades) setActividades((prev) => prev.filter((a) => a.id_meta !== meta.id));
      if (setAvances)     setAvances((prev) => prev.filter((av) => !idsActs.has(av.id_actividad)));
    } catch (err) {
      alert('Error al eliminar la meta: ' + err.message);
    }
  };

  // useCallback con [id] para que esta función solo se recree si cambia el POA
  const cargarMetas = useCallback(() => {
    if (!id) return;
    setCargandoMetas(true);
    MetaService.listarPorPoa(id)
      .then((data) => {
        // Usamos la forma funcional para no necesitar 'metas' como dependencia
        setMetas((prev) => {
          const sinEste = prev.filter((m) => m.id_poa !== Number(id));
          return [...sinEste, ...data];
        });
      })
      .catch((err) => console.error('Error cargando metas:', err.message))
      .finally(() => setCargandoMetas(false));
  }, [id, setMetas]);

  // Al montar o cambiar de POA, carga las metas una sola vez
  useEffect(() => {
    cargarMetas();
  }, [cargarMetas]);

  if (!poa) return <div className="p-6">POA no encontrado</div>;
  const poaMetas = MetaService.porPoa(metas, poa.id);

  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate('/gestion-poas')} className="text-sm text-gray-500 hover:underline">← Volver a Gestión de POAs</button>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold">{poa.nombre}</h3>
        <div className="text-sm text-gray-600">Año {poa.anio} · {poa.estado} · Responsable: {poa.responsable || 'N/A'}</div>
        <div className="text-sm text-gray-500">Período: {fmtFecha(poa.fecha_inicio)} — {fmtFecha(poa.fecha_fin)}</div>
        <div className="mt-4 border-t border-slate-200 pt-4 flex gap-2">
          <button className="px-4 py-1.5 rounded-full border border-slate-300 text-sm text-slate-700 font-medium hover:bg-[#fbeaea] hover:border-[#871A1A]/40 transition-colors" onClick={() => navigate(`/poa/${poa.id}/editar`)}>Editar POA</button>
          <button className="px-4 py-1.5 rounded-full border border-slate-300 text-sm text-slate-700 font-medium hover:bg-[#fbeaea] hover:border-[#871A1A]/40 transition-colors" onClick={() => navigate(`/poa/${poa.id}/calendario`)}>Ver Calendario</button>
        </div>
        <div className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">
              Metas ({poaMetas.length})
              {cargandoMetas && <span className="ml-2 text-xs text-gray-400 font-normal">Cargando...</span>}
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => cargarMetas(true)}
                disabled={cargandoMetas}
                className="px-4 py-1.5 border border-slate-300 rounded-full text-sm text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
                title="Recargar metas"
              >↻ Actualizar</button>
              <button
                onClick={() => navigate(`/poa/${poa.id}/metas/nueva`)}
                className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors text-sm"
              >
                + Agregar Meta
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {cargandoMetas && poaMetas.length === 0 && (
              <div className="text-slate-400 text-sm py-6 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50 animate-pulse">
                Cargando metas del servidor...
              </div>
            )}
            {!cargandoMetas && poaMetas.length === 0 && (
              <div className="text-slate-500 text-sm py-6 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50">
                Este POA aún no tiene metas. Usa el botón "Agregar Meta" para comenzar.
              </div>
            )}
            {poaMetas.map((m) => (
              <div key={m.id} className="border border-slate-200 bg-white p-3 rounded-xl flex justify-between items-center hover:border-[#871A1A]/30 hover:shadow-md transition">
                <div>
                  <div className="font-medium">{m.nombre}</div>
                  <div className="text-xs text-gray-500">Presupuesto: ${Number(m.presupuesto).toFixed(2)}</div>
                  {m.descripcion && <div className="text-xs text-gray-400 mt-0.5">{m.descripcion}</div>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="text-[#871A1A] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fbeaea] transition-colors" onClick={() => navigate(`/meta/${m.id}`)}>Ver</button>
                  <button className="text-[#b45309] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fef3c7] transition-colors" onClick={() => navigate(`/meta/${m.id}/editar`)}>Editar</button>
                  <button className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors" onClick={() => handleEliminarMeta(m)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaForm({ poaId, setMetas, navigate }) {
  const [nombre, setNombre]           = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [error, setError]             = useState('');
  const [guardando, setGuardando]     = useState(false);

  const save = async () => {
    if (!nombre || !presupuesto) { setError('Nombre y presupuesto son obligatorios'); return; }
    setGuardando(true);
    try {
      const nueva = await MetaService.crear(poaId, { nombre, descripcion, presupuesto });
      setMetas((prev) => [...prev, nueva]);
      navigate(`/poa/${poaId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6 flex justify-center">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 w-full max-w-xl space-y-4">
        <div>
          <button onClick={() => navigate(`/poa/${poaId}`)} className="text-sm text-gray-500 hover:underline">← Volver al POA</button>
        </div>
        <h2 className="text-xl font-bold text-[#871A1A]">Agregar Nueva Meta</h2>
        <div>
          <label className="text-sm font-medium">Nombre de la Meta *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" placeholder="Ej: Mejorar sistema de riego" />
        </div>
        <div>
          <label className="text-sm font-medium">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" placeholder="Describe la meta..." rows={3} />
        </div>
        <div>
          <label className="text-sm font-medium">Presupuesto ($) *</label>
          <input type="number" step="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" placeholder="Ej: 50000.00" />
        </div>
        {error && <div className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => navigate(`/poa/${poaId}`)} className="px-5 py-2 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={save} disabled={guardando} className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar Meta'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaEditForm({ metaId, metas, setMetas, navigate }) {
  const meta = metas.find((m) => m.id === Number(metaId));
  const [nombre, setNombre]           = useState(meta?.nombre      || '');
  const [descripcion, setDescripcion] = useState(meta?.descripcion || '');
  const [presupuesto, setPresupuesto] = useState(meta?.presupuesto || '');
  const [error, setError]             = useState('');

  if (!meta) return <div className="p-6">Meta no encontrada</div>;

  const save = async () => {
    if (!nombre || !presupuesto) { setError('Nombre y presupuesto son obligatorios'); return; }
    try {
      const updated = await MetaService.editar(metaId, { nombre, descripcion, presupuesto });
      setMetas((prev) => prev.map((m) => (m.id === Number(metaId) ? updated : m)));
      navigate(`/poa/${meta.id_poa}`);
    } catch (err) { setError(err.message || 'Error al guardar'); }
  };

  return (
    <div className="p-6 flex justify-center">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 w-full max-w-xl space-y-4">
        <div>
          <button onClick={() => navigate(`/poa/${meta.id_poa}`)} className="text-sm text-gray-500 hover:underline">← Volver al POA</button>
        </div>
        <h2 className="text-xl font-bold text-[#871A1A]">Editar Meta</h2>
        <div>
          <label className="text-sm font-medium">Nombre de la Meta *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div>
          <label className="text-sm font-medium">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" rows={3} />
        </div>
        <div>
          <label className="text-sm font-medium">Presupuesto ($) *</label>
          <input type="number" step="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        {error && <div className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => navigate(`/poa/${meta.id_poa}`)} className="px-5 py-2 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={save} className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors">Guardar Meta</button>
        </div>
      </div>
    </div>
  );
}

function MetaDetail({ id, metas, actividades, setActividades, avances, navigate }) {
  const meta = metas.find((m) => m.id === Number(id));
  if (!meta) return <div className="p-6">Meta no encontrada</div>;

  const metaActividades = ActividadService.porMeta(actividades, meta.id);
  const progreso = MetaService.calcularProgreso(actividades, avances, meta.id);

  const handleEliminar = async (actId) => {
    if (window.confirm('¿Eliminar esta actividad?')) {
      try {
        await ActividadService.eliminar(actId);
        setActividades((prev) => prev.filter((a) => a.id !== actId));
      } catch (err) { alert('Error al eliminar: ' + err.message); }
    }
  };

  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate(`/poa/${meta.id_poa}`)} className="text-sm text-gray-500 hover:underline">← Volver al POA</button>
      </div>
      <h3 className="text-lg font-semibold">{meta.nombre}</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mt-3">
        <div className="text-sm text-gray-600">Presupuesto: ${Number(meta.presupuesto).toFixed(2)}</div>
        <div className="mt-3 text-sm">Progreso estimado: {progreso}%</div>
        <div className="w-full bg-slate-200 rounded-full h-2.5 mt-1 overflow-hidden">
          <div className="bg-gradient-to-r from-[#871A1A] to-[#d93025] h-2.5 rounded-full transition-all" style={{ width: `${progreso}%` }} />
        </div>
        <div className="mt-5">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">Actividades ({metaActividades.length})</h4>
            <button onClick={() => navigate(`/meta/${meta.id}/actividad/nueva`)}
              className="px-4 py-1.5 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors text-sm">
              + Agregar Actividad
            </button>
          </div>
          <div className="space-y-2">
            {metaActividades.length === 0 && <div className="text-gray-500 text-sm">No hay actividades registradas.</div>}
            {metaActividades.map((a) => (
              <div key={a.id} className="border border-slate-200 bg-white p-3 rounded-xl flex justify-between items-center hover:border-[#871A1A]/30 hover:shadow-md transition">
                <div>
                  <div className="font-medium">{a.nombre}</div>
                  <div className="text-xs text-gray-500">{fmtFecha(a.fecha_inicio_planificada)} → {fmtFecha(a.fecha_fin_planificada)}</div>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    a.estado === 'Completada'   ? 'bg-[#e6f4ea] text-[#137333]'
                    : a.estado === 'Vencida'    ? 'bg-[#fce8e6] text-[#c5221f]'
                    : a.estado === 'En progreso'? 'bg-[#fef7e0] text-[#b06000]'
                    : 'bg-[#e8f0fe] text-[#1967d2]'
                  }`}>{a.estado}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="text-[#871A1A] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fbeaea] transition-colors" onClick={() => navigate(`/actividad/${a.id}`)}>Ver</button>
                  <button className="text-[#b45309] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fef3c7] transition-colors" onClick={() => navigate(`/actividad/${a.id}/editar`)}>Editar</button>
                  <button className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors" onClick={() => handleEliminar(a.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActividadForm({ id, metaId, actividades, metas, setActividades, navigate, origen }) {
  const editing   = actividades.find((a) => a.id === Number(id));
  const [nombre, setNombre]           = useState(editing?.nombre                  || '');
  const [fechaInicio, setFechaInicio] = useState(editing?.fecha_inicio_planificada || '');
  const [fechaFin, setFechaFin]       = useState(editing?.fecha_fin_planificada    || '');
  const [unidad, setUnidad]           = useState(editing?.unidad_medida            || '');
  const [selMeta, setSelMeta]         = useState(String(editing?.id_meta || metaId || ''));
  const [error, setError]             = useState('');
  const [guardando, setGuardando]     = useState(false);

  const backRoute = editing ? destinoVolver(origen, editing.id_meta).ruta : (selMeta ? `/meta/${selMeta}` : '/gestion-poas');

  const save = async () => {
    if (!nombre || !fechaInicio || !fechaFin) { setError('Nombre y fechas son obligatorios'); return; }
    if (!selMeta) { setError('Selecciona una meta'); return; }
    setGuardando(true);
    const datos = { nombre, fechaInicio, fechaFin, unidad, selMeta };
    try {
      if (editing) {
        const updated = await ActividadService.editar(editing.id, { ...datos, estado: editing.estado });
        setActividades((prev) => prev.map((a) => (a.id === editing.id ? updated : a)));
        navigate(backRoute);
      } else {
        const nueva = await ActividadService.registrar(selMeta, datos);
        setActividades((prev) => [...prev, nueva]);
        navigate(`/meta/${selMeta}`);
      }
    } catch (err) {
      setError('Error al guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate(backRoute)} className="text-sm text-gray-500 hover:underline">← Volver</button>
      </div>
      <h3 className="text-lg font-semibold mb-3">{editing ? 'Editar Actividad' : 'Registrar Actividad'}</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 max-w-2xl space-y-3">
        <div>
          <label className="text-sm">Nombre de Actividad *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm">Fecha Inicio Planificada *</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          </div>
          <div className="flex-1">
            <label className="text-sm">Fecha Fin Planificada *</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          </div>
        </div>
        <div>
          <label className="text-sm">Meta *</label>
          <select value={selMeta} onChange={(e) => setSelMeta(e.target.value)} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]">
            <option value="">-- Selecciona una meta --</option>
            {metas.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm">Unidad de Medida</label>
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" placeholder="Ej: Informes, Talleres, Km..." />
        </div>
        {error && <div className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(backRoute)} className="px-5 py-2 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={save} disabled={guardando} className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActividadDetalle({ id, actividades, navigate, origen }) {
  const act = actividades.find((a) => a.id === Number(id));
  if (!act) return <div className="p-6">Actividad no encontrada</div>;
  const volver = destinoVolver(origen, act.id_meta);
  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate(volver.ruta)} className="text-sm text-gray-500 hover:underline">← Volver a {volver.etiqueta}</button>
      </div>
      <h3 className="text-lg font-semibold">{act.nombre}</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mt-3 space-y-2 text-sm">
        <div>Fechas: {fmtFecha(act.fecha_inicio_planificada)} → {fmtFecha(act.fecha_fin_planificada)}</div>
        <div>Unidad: {act.unidad_medida || '—'}</div>
        <div>Estado: {act.estado}</div>
        <div className="mt-4 space-x-2">
          <button onClick={() => navigate(`/actividad/${act.id}/avance`)} className="px-4 py-1.5 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors">Registrar Avance</button>
          <button onClick={() => navigate(`/actividad/${act.id}/editar`)} className="px-4 py-1.5 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Editar</button>
        </div>
      </div>
    </div>
  );
}

function RegistroAvance({ actividadId, actividades, avances, setAvances, navigate, origen }) {
  const actividad = actividades.find((a) => a.id === Number(actividadId));
  const [porcentaje, setPorcentaje]             = useState(0);
  const [comentariosLocal, setComentariosLocal] = useState('');

  if (!actividad) return <div className="p-6">Actividad no encontrada</div>;
  const hist = AvanceService.historial(avances, actividad.id);
  const volver = destinoVolver(origen, actividad.id_meta);

  const guardar = async () => {
    try {
      const nuevo = await AvanceService.registrar(actividad.id, {
        porcentaje: Number(porcentaje),
        comentarios: comentariosLocal,
      });
      setAvances((prev) => [...prev, nuevo]);
      navigate(volver.ruta);
    } catch (err) { alert('Error al guardar avance: ' + err.message); }
  };

  return (
    <div className="p-6">
      <div className="mb-3">
        <button onClick={() => navigate(volver.ruta)} className="text-sm text-gray-500 hover:underline">← Volver a {volver.etiqueta}</button>
      </div>
      <h3 className="text-lg font-semibold">Registrar Avance — {actividad.nombre}</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 max-w-2xl mt-3 space-y-3">
        <div className="text-sm text-gray-600">Periodo: {fmtFecha(actividad.fecha_inicio_planificada)} → {fmtFecha(actividad.fecha_fin_planificada)}</div>
        <div>
          <label className="text-sm">Porcentaje de Avance (0–100)</label>
          <input type="number" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)}
            min={0} max={100} className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div>
          <label className="text-sm">Comentarios</label>
          <textarea value={comentariosLocal} onChange={(e) => setComentariosLocal(e.target.value)}
            className="w-full border border-slate-300 px-3 py-2 rounded-lg mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" rows={3} />
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-2">Historial de avances</h4>
          {hist.length === 0 && <div className="text-gray-500 text-sm">Sin registros aún</div>}
          {hist.map((h) => (
            <div key={h.id} className="border border-slate-200 p-2 rounded-lg mb-1 bg-white">
              <div className="font-medium text-sm">{h.porcentaje}%</div>
              <div className="text-xs text-gray-500">{h.fecha} · {h.comentarios}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(volver.ruta)} className="px-5 py-2 border border-slate-300 rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={guardar} className="px-5 py-2 bg-[#871A1A] hover:bg-[#6b1313] text-white rounded-full shadow-sm font-medium transition-colors">Guardar Avance</button>
        </div>
      </div>
    </div>
  );
}

function CalendarioPOA({ poaId, poas, metas, actividades, avances, navigate }) {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { year, month, monthName, daysInMonth, startDay } = CalendarioService.calcularMes(currentDate);

  const actividadesFiltradas = (() => {
    if (poaId) {
      const metasDelPoa = metas.filter((m) => m.id_poa === Number(poaId));
      const ids = new Set(metasDelPoa.map((m) => m.id));
      return actividades.filter((a) => ids.has(a.id_meta));
    }
    const poaActivo = POAService.obtenerActivo(poas);
    if (!poaActivo) return [];
    const metasDelPoa = metas.filter((m) => m.id_poa === poaActivo.id);
    const ids = new Set(metasDelPoa.map((m) => m.id));
    return actividades.filter((a) => ids.has(a.id_meta));
  })();

  const eventos = CalendarioService.calcularEventos(actividadesFiltradas, avances);

  const renderDay = (d) => {
    const evts = CalendarioService.eventosDel(eventos, year, month, d);
    return (
      <div key={d} className="border border-slate-200 p-2 min-h-[110px] bg-white rounded-lg">
        <div className="text-lg font-bold">{d}</div>
        {evts.map((ev) => (
          <div key={ev.id} onClick={() => navigate(`/actividad/${ev.id}`)}
            className={`text-sm mt-1 px-2 py-1 rounded-md cursor-pointer hover:opacity-80 ${ev.color}`}>
            {ev.nombre}
          </div>
        ))}
      </div>
    );
  };

  const grid = [];
  for (let i = 0; i < startDay; i++) grid.push(<div key={`e${i}`} className="border border-slate-200 bg-slate-50 min-h-[110px] rounded-lg" />);
  for (let d = 1; d <= daysInMonth; d++) grid.push(renderDay(d));

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
        <span className="text-sm font-semibold text-slate-700 mr-2">Leyenda</span>
        <span className="bg-[#1a73e8] text-white px-3 py-1 rounded-full text-sm font-medium">Programadas</span>
        <span className="bg-[#fbbc04] text-black px-3 py-1 rounded-full text-sm font-medium">En proceso</span>
        <span className="bg-[#1e8e3e] text-white px-3 py-1 rounded-full text-sm font-medium">Completadas</span>
        <span className="bg-[#d93025] text-white px-3 py-1 rounded-full text-sm font-medium">Vencidas</span>
      </div>
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setCurrentDate(CalendarioService.mesAnterior(currentDate))} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-full text-lg transition-colors">◀</button>
        <h2 className="text-2xl font-bold">{monthName} {year}</h2>
        <button onClick={() => setCurrentDate(CalendarioService.mesSiguiente(currentDate))} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-full text-lg transition-colors">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-2">{grid}</div>
    </div>
  );
}

function AlertasPage({ alerts, notificaciones, navigate }) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-3">Alertas y recordatorios</h3>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        {!notificaciones && (
          <div className="text-gray-500 text-sm">
            Las alertas están desactivadas. Puedes activarlas en Configuración.
          </div>
        )}
        {notificaciones && alerts.length === 0 && (
          <div className="text-gray-500">No hay alertas importantes</div>
        )}
        {notificaciones && alerts.map((a, i) => (
          <div key={i} className="border border-slate-200 bg-white p-3 rounded-xl flex justify-between items-center hover:border-[#871A1A]/30 hover:shadow-md transition">
            <div>
              <div className="font-medium">{a.actividad.nombre}</div>
              <div className="text-xs text-gray-500">
                Fin: {fmtFecha(a.actividad.fecha_fin_planificada)} · Tipo: {a.tipo} · Días: {a.dias}
              </div>
            </div>
            <button className="text-sm text-[#871A1A] font-medium px-3 py-1 rounded-full hover:bg-[#fbeaea] transition-colors" onClick={() => navigate(`/actividad/${a.actividad.id}`)}>
              Ir a Actividad
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfiguracionPOA({ user, setUser, notificaciones, setNotificaciones }) {
  const [nombre, setNombre]       = useState(user?.nombre   || '');
  const [apellido, setApellido]   = useState(user?.apellido || '');
  const [email, setEmail]         = useState(user?.email    || '');
  const [passActual, setPassActual]   = useState('');
  const [passNueva, setPassNueva]     = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [msg, setMsg]   = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/usuario/perfil')
      .then((perfil) => {
        setNombre(perfil.nombre || '');
        setApellido(perfil.apellido || '');
        setEmail(perfil.email || '');
      })
      .catch(() => {});
  }, []);

  const guardar = async () => {
    setMsg(''); setError('');

    // Validar contraseña PRIMERO, antes de tocar el servidor
    const cambiarPass = passNueva || passConfirm;
    if (cambiarPass) {
      if (!passActual)                       { setError('Escribe tu contraseña actual');           return; }
      if (!passNueva)                        { setError('Escribe la nueva contraseña');            return; }
      if (passNueva.length < 6)             { setError('La nueva contraseña debe tener al menos 6 caracteres'); return; }
      if (passNueva !== passConfirm)         { setError('Las contraseñas nuevas no coinciden');    return; }
    }

    try {
      // 1. Actualizar perfil
      await apiFetch('/usuario/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nombre, apellido, email }),
      });
      setUser((prev) => ({ ...prev, nombre, apellido, email }));

      // 2. Cambiar contraseña solo si se llenaron los campos
      if (cambiarPass) {
        await apiFetch('/usuario/cambiar-password', {
          method: 'PUT',
          body: JSON.stringify({ passwordActual: passActual, passwordNueva: passNueva }),
        });
        setPassActual(''); setPassNueva(''); setPassConfirm('');
        setMsg('Configuración y contraseña guardadas correctamente');
      } else {
        setMsg('Datos de perfil actualizados correctamente');
      }
    } catch (err) {
      setError(err.message || 'Error al guardar');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h2 className="text-2xl font-semibold">Configuración del Usuario</h2>
      <div className="bg-white p-5 rounded shadow space-y-4">
        <h3 className="font-semibold text-lg">Seguridad y Notificaciones</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notificaciones}
            onChange={(e) => {
              setNotificaciones(e.target.checked);
              setError('');
              setMsg(e.target.checked ? 'Alertas activadas' : 'Alertas desactivadas');
            }}
          />
          Activar notificaciones de alertas y actividades vencidas
        </label>
      </div>
      <div className="bg-white p-5 rounded shadow space-y-5">
        <h3 className="font-semibold text-lg">Mis Datos</h3>
        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          <input type="text" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          <input type="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg col-span-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Cambiar Contraseña</h4>
          <input type="password" autoComplete="current-password" placeholder="Contraseña actual" value={passActual} onChange={(e) => setPassActual(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg w-full bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          <input type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg w-full bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
          <input type="password" autoComplete="new-password" placeholder="Confirmar nueva contraseña" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} className="border border-slate-300 px-3 py-2 rounded-lg w-full bg-white focus:outline-none focus:ring-2 focus:ring-[#871A1A]/30 focus:border-[#871A1A]" />
        </div>
        {msg   && <div className="text-green-600 text-sm">{msg}</div>}
        {error && <div className="text-[#d93025] text-sm font-medium px-3 py-1 rounded-full hover:bg-[#fce8e6] transition-colors">{error}</div>}
      </div>
      <div className="flex justify-end">
        <button onClick={guardar} className="px-5 py-2 bg-[#460809] hover:bg-[#2f0506] text-white rounded-full shadow-sm font-medium transition-colors">Guardar Configuración</button>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTE RAÍZ — solo maneja estado global y routing
// =============================================================================
export default function POAApp() {
  const [user, setUser]               = useState(null);
  const [route, setRoute]             = useState('/login');
  const [loading, setLoading]         = useState(false);
  const [poas, setPoas]               = useState([]);
  const [metas, setMetas]             = useState([]);
  const [actividades, setActividades] = useState([]);
  const [avances, setAvances]         = useState([]);
  const [alerts, setAlerts]           = useState([]);

  // Preferencia de alertas (se guarda en el navegador)
  const [notificaciones, setNotificacionesState] = useState(() => {
    try { return localStorage.getItem('poa_notificaciones') !== 'false'; }
    catch { return true; }
  });
  const setNotificaciones = useCallback((valor) => {
    setNotificacionesState(valor);
    try { localStorage.setItem('poa_notificaciones', String(valor)); } catch {}
  }, []);

  // useCallback garantiza que navigate, setPoas, setMetas, etc.
  // no cambien de referencia en cada render, evitando loops en useEffect de hijos
  // Recuerda desde qué pestaña se entró a una actividad (Alertas, Calendario, Inicio)
  const [origenActividad, setOrigenActividad] = useState(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const navigate = useCallback((r) => {
    if (r.startsWith('/actividad/')) {
      // Dentro de la actividad (editar, avance) se conserva el origen
      if (!routeRef.current.startsWith('/actividad/')) setOrigenActividad(origenDesde(routeRef.current));
    } else {
      setOrigenActividad(null);
    }
    setRoute(r);
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      // Cargar POAs primero — son los más importantes para navegar
      const poasData = await POAService.listar();
      setPoas(poasData);
      setLoading(false);  // ya podemos mostrar la UI

      // Cargar actividades y avances en segundo plano (no bloquean la UI)
      // Las metas de todos los POAs se cargan aquí para que cualquier pantalla
      // (actividad, calendario, alertas) pueda encontrar su meta.
      const [actData, avData, metasData] = await Promise.all([
        ActividadService.listar(),
        AvanceService.listar(),
        Promise.all(poasData.map((p) => MetaService.listarPorPoa(p.id).catch(() => []))).then((r) => r.flat()),
      ]);
      setMetas(metasData);
      setActividades(actData);
      setAvances(avData);
      setAlerts(AlertaService.generar(actData));
    } catch (err) {
      console.error('Error cargando datos:', err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    setAlerts(AlertaService.generar(actividades));
  }, [actividades]);

  // Redirigir si se pierde la sesión (en useEffect, nunca en render)
  useEffect(() => {
    if (!user && route !== '/login') setRoute('/login');
  }, [user]);

  const handleLogin = async (userData) => {
    setUser(userData);
    await cargarDatos();
    navigate('/dashboard');
  };

  const handleLogout = () => {
    AuthService.logout();
    setUser(null);
    setPoas([]); setMetas([]); setActividades([]); setAvances([]); setAlerts([]);
    setRoute('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <div className="text-gray-600">Cargando datos...</div>
        </div>
      </div>
    );
  }

  if (!user || route === '/login') {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Si las alertas están desactivadas, no se muestra ninguna
  const alertsVisibles = notificaciones ? alerts : [];

  // Props base para componentes que solo necesitan navegar y leer estado
  const sharedProps = {
    navigate, poas, setPoas, metas, setMetas,
    actividades, setActividades, avances, setAvances, alerts,
  };

  const renderRoute = () => {
    // Rutas exactas
    if (route === '/dashboard')     return <Dashboard poas={poas} metas={metas} actividades={actividades} alerts={alertsVisibles} navigate={navigate} />;
    if (route === '/gestion-poas')  return <GestionPoas poas={poas} setPoas={setPoas} metas={metas} actividades={actividades} navigate={navigate} />;
    if (route === '/calendario')    return <CalendarioPOA poas={poas} metas={metas} actividades={actividades} avances={avances} navigate={navigate} />;
    if (route === '/alertas')       return <AlertasPage alerts={alertsVisibles} notificaciones={notificaciones} navigate={navigate} />;
    if (route === '/configuracion') return <ConfiguracionPOA user={user} setUser={setUser} notificaciones={notificaciones} setNotificaciones={setNotificaciones} />;
    if (route === '/poa/nuevo')     return <PoaForm poas={poas} setPoas={setPoas} navigate={navigate} />;

    // Rutas /poa/... — orden: más específicas primero
    if (route.startsWith('/poa/')) {
      const partes = route.split('/');            // ['', 'poa', ':id', ...]
      const poaId  = partes[2];
      const sufijo = partes.slice(3).join('/');   // 'metas/nueva' | 'editar' | 'calendario' | ''

      if (sufijo === 'metas/nueva') return <MetaForm poaId={poaId} setMetas={setMetas} navigate={navigate} />;
      if (sufijo === 'editar')      return <PoaForm poas={poas} setPoas={setPoas} navigate={navigate} editId={poaId} />;
      if (sufijo === 'calendario')  return <CalendarioPOA poaId={poaId} poas={poas} metas={metas} actividades={actividades} avances={avances} navigate={navigate} />;
      // '' | 'metas' -> Ver detalles del POA
      return <PoaDetail id={poaId} poas={poas} metas={metas} setMetas={setMetas} actividades={actividades} setActividades={setActividades} setAvances={setAvances} navigate={navigate} />;
    }

    // Rutas /meta/... — orden: más específicas primero
    if (route.startsWith('/meta/')) {
      const partes  = route.split('/');
      const metaId  = partes[2];
      const sufijo  = partes.slice(3).join('/');

      if (sufijo === 'editar')            return <MetaEditForm metaId={metaId} metas={metas} setMetas={setMetas} navigate={navigate} />;
      if (sufijo === 'actividad/nueva')   return <ActividadForm metaId={metaId} actividades={actividades} metas={metas} setActividades={setActividades} navigate={navigate} />;
      return <MetaDetail id={metaId} metas={metas} actividades={actividades} setActividades={setActividades} avances={avances} navigate={navigate} />;
    }

    // Rutas /actividad/... — orden: más específicas primero
    if (route.startsWith('/actividad/')) {
      const partes      = route.split('/');
      const actividadId = partes[2];
      const sufijo      = partes.slice(3).join('/');

      if (sufijo === 'editar') return <ActividadForm id={actividadId} actividades={actividades} metas={metas} setActividades={setActividades} navigate={navigate} origen={origenActividad} />;
      if (sufijo === 'avance') return <RegistroAvance actividadId={actividadId} actividades={actividades} avances={avances} setAvances={setAvances} navigate={navigate} origen={origenActividad} />;
      return <ActividadDetalle id={actividadId} actividades={actividades} navigate={navigate} origen={origenActividad} />;
    }

    return <div className="p-6 text-gray-500">Ruta no encontrada: {route}</div>;
  };

  return (
    <div className="flex h-screen bg-[#f3f6fb] overflow-hidden">
      <Sidebar route={route} navigate={navigate} user={user} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} />
        <div className="flex-1 overflow-auto">{renderRoute()}</div>
      </div>
    </div>
  );
}
