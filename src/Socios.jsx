import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Handshake, UserPlus, Trash2, Eye, EyeOff, Crown, ShieldCheck, Save, X } from 'lucide-react';
import { db } from './firebase';
import { llamarServidor } from './servidor';
import { PERMISOS, RANGOS, nombreRango } from './auditoria';

const claseInput = 'w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const RANGO_INICIAL = RANGOS.find(r => r.nombre === 'Editor');
const aMapa = (lista) => Object.fromEntries(PERMISOS.map(p => [p.clave, lista.includes(p.clave)]));

// Casillas de permisos con botones de rango rápido
function EditorPermisos({ permisos, onChange, puedeOtorgarSocios }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-500 self-center">Rango rápido:</span>
        {RANGOS.filter(r => puedeOtorgarSocios || !r.permisos.includes('socios')).map(r => (
          <button
            key={r.nombre}
            type="button"
            onClick={() => onChange(aMapa(r.permisos))}
            className="btn btn-claro btn-sm"
          >
            {r.nombre}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PERMISOS.map(p => {
          const bloqueado = p.clave === 'socios' && !puedeOtorgarSocios;
          return (
            <label
              key={p.clave}
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${
                permisos[p.clave] ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200'
              } ${bloqueado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                disabled={bloqueado}
                checked={!!permisos[p.clave]}
                onChange={(e) => onChange({ ...permisos, [p.clave]: e.target.checked })}
                className="mt-0.5 accent-indigo-600"
              />
              <span>
                <span className="font-semibold text-slate-800">{p.etiqueta}</span>
                <span className="block text-[11px] text-slate-500">{p.detalle}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function Socios({ usuario, negocioId, negocio }) {
  const [socios, setSocios] = useState([]);
  const [form, setForm] = useState({ nombre: '', correo: '', clave: '' });
  const [permisosNuevo, setPermisosNuevo] = useState(aMapa(RANGO_INICIAL.permisos));
  const [verClave, setVerClave] = useState(false);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [permisosEdicion, setPermisosEdicion] = useState({});

  useEffect(() => onSnapshot(collection(db, 'negocios', negocioId, 'miembros'), (snap) => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSocios(lista.sort((a, b) =>
      (a.rol === 'titular' ? 0 : 1) - (b.rol === 'titular' ? 0 : 1) || (a.nombre || '').localeCompare(b.nombre || '', 'es')
    ));
  }), [negocioId]);

  const yo = socios.find(s => s.id === usuario.uid);
  const soyTitular = yo?.rol === 'titular';
  const soyGestor = soyTitular || yo?.permisos?.socios === true;

  // Mismas reglas que aplica el servidor
  const puedoModificar = (s) =>
    soyGestor && s.id !== usuario.uid && s.rol !== 'titular' && (soyTitular || !s.permisos?.socios);

  const handleCrear = async (e) => {
    e.preventDefault();
    setEstado(null);
    if (form.clave && form.clave.length < 8) return setEstado({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' });
    setGuardando(true);
    try {
      const r = await llamarServidor('/miembros/crear', { negocioId, ...form, permisos: permisosNuevo });
      setEstado({
        tipo: 'ok',
        texto: r.cuentaNueva
          ? `Socio agregado a ${negocio?.nombre}. Comparte con ${form.nombre.trim() || form.correo.trim()} su correo y contraseña: la primera vez que entre recibirá un código en su correo.`
          : `Esa persona ya tenía cuenta en la app: quedó agregada a ${negocio?.nombre} y la verá en su selector de negocios.`
      });
      setForm({ nombre: '', correo: '', clave: '' });
      setPermisosNuevo(aMapa(RANGO_INICIAL.permisos));
    } catch (err) {
      setEstado({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  };

  const abrirEdicion = (s) => {
    setEditandoId(editandoId === s.id ? null : s.id);
    setPermisosEdicion(Object.fromEntries(PERMISOS.map(p => [p.clave, s.permisos?.[p.clave] === true])));
  };

  const handleGuardarPermisos = async (s) => {
    setGuardando(true);
    try {
      await llamarServidor('/miembros/permisos', { negocioId, uid: s.id, permisos: permisosEdicion });
      setEditandoId(null);
    } catch (err) {
      alert('No se pudo cambiar el rango: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (socio) => {
    if (!confirm(`¿Quitar a ${socio.nombre} de ${negocio?.nombre}?\n\nYa no verá este negocio. Si participa en otros negocios, los sigue viendo. Las ventas que registró y el historial de sus cambios se conservan.`)) return;
    try {
      await llamarServidor('/miembros/eliminar', { negocioId, uid: socio.id });
    } catch (err) {
      alert('No se pudo quitar al socio: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {soyGestor ? (
        <div className="panel p-6">
          <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
            <UserPlus size={18} className="text-indigo-600" /> Agregar socio
          </h2>
          <p className="text-xs text-slate-500 mb-4">Si la persona ya usa la app (por ejemplo, en otro negocio), basta con su correo. Si no, se crea su cuenta con esta contraseña.</p>
          <form onSubmit={handleCrear} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="etiqueta">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Maira Obregón"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className={claseInput}
                />
              </div>
              <div>
                <label className="etiqueta">Correo</label>
                <input
                  type="email"
                  required
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  className={claseInput}
                />
              </div>
              <div>
                <label className="etiqueta">Contraseña <span className="font-normal text-gris-calido">(solo si es cuenta nueva)</span></label>
                <div className="relative">
                  <input
                    type={verClave ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.clave}
                    onChange={(e) => setForm({ ...form, clave: e.target.value })}
                    className={`${claseInput} pr-9`}
                  />
                  <button
                    type="button"
                    onClick={() => setVerClave(!verClave)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={verClave ? 'Ocultar' : 'Mostrar'}
                  >
                    {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Rango de edición</p>
              <EditorPermisos permisos={permisosNuevo} onChange={setPermisosNuevo} puedeOtorgarSocios={soyTitular} />
            </div>

            <button
              type="submit"
              disabled={guardando}
              className="btn btn-primario"
            >
              <UserPlus size={16} /> {guardando ? 'Creando...' : 'Agregar socio'}
            </button>
          </form>
          {estado && (
            <p className={`mt-3 text-xs rounded-lg p-2 border ${estado.tipo === 'error'
              ? 'text-rose-600 bg-rose-50 border-rose-200'
              : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
              {estado.texto}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 bg-white p-4 rounded-xl border border-slate-200">
          🔒 Solo el titular, o los socios que él autorice, pueden agregar socios y cambiar rangos.
        </p>
      )}

      <div className="panel overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Handshake size={18} /> Socios de {negocio?.nombre} ({socios.length})
          </h2>
          <p className="text-xs text-slate-500 mt-1">Todos los cambios de cada socio, incluido el titular, quedan en la pestaña Historial.</p>
        </div>
        <div>
          {socios.map(s => {
            const editable = puedoModificar(s);
            const editando = editandoId === s.id;
            return (
              <div key={s.id} className="p-4 text-sm">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                      {s.rol === 'titular' && <Crown size={14} className="text-amber-500" />}
                      {s.nombre || 'Sin nombre'}
                      {s.id === usuario.uid && <span className="pastilla pastilla-info !text-[10px]">TÚ</span>}
                      <span className={`pastilla !text-[10px] ${
                        s.rol === 'titular' ? 'pastilla-pendiente' : 'pastilla-neutra'
                      }`}>
                        {nombreRango(s).toUpperCase()}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">{s.correo}</p>
                    {s.rol !== 'titular' && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {PERMISOS.filter(p => s.permisos?.[p.clave]).map(p => p.etiqueta).join(' · ') || 'Solo puede ver la información'}
                      </p>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => abrirEdicion(s)}
                        className="btn btn-claro btn-sm"
                        title="Cambiar rango"
                      >
                        <ShieldCheck size={16} /> Rango
                      </button>
                      <button onClick={() => handleQuitar(s)} className="btn-icono btn-icono-peligro" title="Quitar socio">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {editando && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                    <EditorPermisos permisos={permisosEdicion} onChange={setPermisosEdicion} puedeOtorgarSocios={soyTitular} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGuardarPermisos(s)}
                        disabled={guardando}
                        className="btn btn-primario"
                      >
                        <Save size={16} /> Guardar rango
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="btn btn-claro"
                      >
                        <X size={16} /> Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
