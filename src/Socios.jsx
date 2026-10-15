import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Users, UserPlus, Trash2, Eye, EyeOff, Crown } from 'lucide-react';
import { db } from './firebase';
import { llamarServidor } from './servidor';

const claseInput = 'w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

export default function Socios({ usuario }) {
  const [socios, setSocios] = useState([]);
  const [form, setForm] = useState({ nombre: '', correo: '', clave: '' });
  const [verClave, setVerClave] = useState(false);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'admins'), (snap) => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSocios(lista.sort((a, b) =>
      (a.rol === 'principal' ? 0 : 1) - (b.rol === 'principal' ? 0 : 1) || (a.nombre || '').localeCompare(b.nombre || '', 'es')
    ));
  }), []);

  const yo = socios.find(s => s.id === usuario.uid);
  const esPrincipal = yo?.rol === 'principal';

  const handleCrear = async (e) => {
    e.preventDefault();
    setEstado(null);
    if (form.clave.length < 8) return setEstado({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' });
    setGuardando(true);
    try {
      await llamarServidor('/socios/crear', form);
      setEstado({
        tipo: 'ok',
        texto: `Socio creado. Comparte con ${form.nombre.trim()} su correo y contraseña: la primera vez que entre recibirá un código en ${form.correo.trim()} y podrá cambiar su contraseña en "Mi Perfil".`
      });
      setForm({ nombre: '', correo: '', clave: '' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (socio) => {
    if (!confirm(`¿Quitar a ${socio.nombre} como socio?\n\nYa no podrá entrar al sistema y se cerrarán sus sesiones. Las ventas que registró se conservan.`)) return;
    try {
      await llamarServidor('/socios/eliminar', { uid: socio.id });
    } catch (err) {
      alert('No se pudo quitar al socio: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {esPrincipal ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
            <UserPlus size={18} className="text-indigo-600" /> Agregar socio
          </h2>
          <p className="text-xs text-slate-500 mb-4">Se crea su cuenta con este correo y contraseña. Tu sesión no se cierra.</p>
          <form onSubmit={handleCrear} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
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
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow disabled:opacity-50"
            >
              <UserPlus size={16} /> {guardando ? 'Creando...' : 'Agregar'}
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
          Solo el administrador principal puede agregar o quitar socios.
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" /> Socios con acceso ({socios.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-200">
          {socios.map(s => (
            <div key={s.id} className="flex justify-between items-center p-4 text-sm">
              <div>
                <p className="font-semibold text-slate-800 flex items-center gap-2">
                  {s.rol === 'principal' && <Crown size={14} className="text-amber-500" />}
                  {s.nombre || 'Sin nombre'}
                  {s.id === usuario.uid && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">TÚ</span>}
                </p>
                <p className="text-xs text-slate-500">{s.correo} · {s.rol === 'principal' ? 'Administrador principal' : 'Socio'}</p>
              </div>
              {esPrincipal && s.rol !== 'principal' && (
                <button onClick={() => handleQuitar(s)} className="text-rose-500 hover:text-rose-700 p-1" title="Quitar socio">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
