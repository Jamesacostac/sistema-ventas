import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Users, UserPlus, Trash2, Eye, EyeOff, Crown, ShieldCheck, Save, X } from 'lucide-react';
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
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 transition"
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

export default function Socios({ usuario }) {
  const [socios, setSocios] = useState([]);
  const [form, setForm] = useState({ nombre: '', correo: '', clave: '' });
  const [permisosNuevo, setPermisosNuevo] = useState(aMapa(RANGO_INICIAL.permisos));
  const [verClave, setVerClave] = useState(false);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [permisosEdicion, setPermisosEdicion] = useState({});

  useEffect(() => onSnapshot(collection(db, 'admins'), (snap) => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSocios(lista.sort((a, b) =>
      (a.rol === 'principal' ? 0 : 1) - (b.rol === 'principal' ? 0 : 1) || (a.nombre || '').localeCompare(b.nombre || '', 'es')
    ));
  }), []);

  const yo = socios.find(s => s.id === usuario.uid);
  const soyTitular = yo?.rol === 'principal';
  const soyGestor = soyTitular || yo?.permisos?.socios === true;

  // Mismas reglas que aplica el servidor
  const puedoModificar = (s) =>
    soyGestor && s.id !== usuario.uid && s.rol !== 'principal' && (soyTitular || !s.permisos?.socios);

  const handleCrear = async (e) => {
    e.preventDefault();
    setEstado(null);
    if (form.clave.length < 8) return setEstado({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' });
    setGuardando(true);
    try {
      await llamarServidor('/socios/crear', { ...form, permisos: permisosNuevo });
      setEstado({
        tipo: 'ok',
        texto: `Socio creado. Comparte con ${form.nombre.trim()} su correo y contraseña: la primera vez que entre recibirá un código en ${form.correo.trim()} y podrá cambiar su contraseña en "Mi Perfil".`
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
      await llamarServidor('/socios/permisos', { uid: s.id, permisos: permisosEdicion });
      setEditandoId(null);
    } catch (err) {
      alert('No se pudo cambiar el rango: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (socio) => {
    if (!confirm(`¿Quitar a ${socio.nombre} como socio?\n\nYa no podrá entrar al sistema y se cerrarán sus sesiones. Las ventas que registró y el historial de sus cambios se conservan.`)) return;
    try {
      await llamarServidor('/socios/eliminar', { uid: socio.id });
    } catch (err) {
      alert('No se pudo quitar al socio: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {soyGestor ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
            <UserPlus size={18} className="text-indigo-600" /> Agregar socio
          </h2>
          <p className="text-xs text-slate-500 mb-4">Se crea su cuenta con este correo y contraseña. Tu sesión no se cierra.</p>
          <form onSubmit={handleCrear} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo</label>
                <input
                  type="email"
                  required
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  className={claseInput}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña (mín. 8)</label>
                <div className="relative">
                  <input
                    type={verClave ? 'text' : 'password'}
                    required
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
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow disabled:opacity-50"
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" /> Socios y rangos ({socios.length})
          </h2>
          <p className="text-xs text-slate-500 mt-1">Todos los cambios de cada socio, incluido el titular, quedan en la pestaña Historial.</p>
        </div>
        <div className="divide-y divide-slate-200">
          {socios.map(s => {
            const editable = puedoModificar(s);
            const editando = editandoId === s.id;
            return (
              <div key={s.id} className="p-4 text-sm">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                      {s.rol === 'principal' && <Crown size={14} className="text-amber-500" />}
                      {s.nombre || 'Sin nombre'}
                      {s.id === usuario.uid && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">TÚ</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        s.rol === 'principal' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {nombreRango(s).toUpperCase()}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">{s.correo}</p>
                    {s.rol !== 'principal' && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {PERMISOS.filter(p => s.permisos?.[p.clave]).map(p => p.etiqueta).join(' · ') || 'Solo puede ver la información'}
                      </p>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => abrirEdicion(s)}
                        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 p-1"
                        title="Cambiar rango"
                      >
                        <ShieldCheck size={16} /> Rango
                      </button>
                      <button onClick={() => handleQuitar(s)} className="text-rose-500 hover:text-rose-700 p-1" title="Quitar socio">
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
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow disabled:opacity-50"
                      >
                        <Save size={16} /> Guardar rango
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="flex items-center gap-2 bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
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
