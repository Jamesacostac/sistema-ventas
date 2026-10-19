import React, { useState } from 'react';
import { PlusCircle, CheckCircle } from 'lucide-react';
import { llamarServidor } from './servidor';

// Colores disponibles para la cabecera de cada negocio (paleta de la marca + lila)
export const COLORES_NEGOCIO = {
  turquesa: { nombre: 'Turquesa', hex: '#55C4BF' },
  coral: { nombre: 'Coral', hex: '#EA6077' },
  sol: { nombre: 'Sol', hex: '#F8CB67' },
  verde: { nombre: 'Verde', hex: '#7EE5A8' },
  lila: { nombre: 'Lila', hex: '#B9A6E8' }
};
export const colorNegocio = (clave) => COLORES_NEGOCIO[clave]?.hex || COLORES_NEGOCIO.turquesa.hex;

export const ID_TAZON = 'tazon-para-dos';
// ---------- Formulario para registrar un negocio nuevo ----------
export function FormNuevoNegocio({ onCreado }) {
  const [form, setForm] = useState({ nombre: '', color: 'coral', porcentajeAhorro: 15, numeroSocios: 1 });
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const ahorro = Number(form.porcentajeAhorro) || 0;
  const socios = Math.max(1, Number(form.numeroSocios) || 1);
  const ejemplo = 100000;

  const crear = async (e) => {
    e.preventDefault();
    setEstado(null);
    setGuardando(true);
    try {
      const r = await llamarServidor('/negocios/crear', { ...form, porcentajeAhorro: ahorro, numeroSocios: socios });
      setForm({ nombre: '', color: 'coral', porcentajeAhorro: 15, numeroSocios: 1 });
      setEstado({ tipo: 'ok', texto: 'Negocio creado. Ya puedes cambiar a él desde la cabecera.' });
      onCreado?.(r.id);
    } catch (err) {
      setEstado({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={crear} className="space-y-4">
      <div>
        <label className="etiqueta">Nombre del negocio</label>
        <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Noguri" className="campo" />
      </div>
      <div>
        <p className="etiqueta">Color de la cabecera</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(COLORES_NEGOCIO).map(([clave, c]) => (
            <button
              type="button"
              key={clave}
              onClick={() => setForm({ ...form, color: clave })}
              className={`h-9 px-3 rounded-full border-2 text-xs font-bold flex items-center gap-1.5 ${form.color === clave ? 'border-tinta shadow-[2px_2px_0_var(--color-tinta)]' : 'border-transparent'}`}
              style={{ background: c.hex }}
            >
              {form.color === clave && <CheckCircle size={14} />} {c.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta">% para ahorro y mejoras</label>
          <input type="number" min="0" max="100" step="1" value={form.porcentajeAhorro} onChange={(e) => setForm({ ...form, porcentajeAhorro: e.target.value })} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Socios para el salario</label>
          <input type="number" min="1" max="50" step="1" value={form.numeroSocios} onChange={(e) => setForm({ ...form, numeroSocios: e.target.value })} className="campo" />
        </div>
      </div>
      <p className="text-xs text-gris-calido">
        Ejemplo: con una ganancia de ${ejemplo.toLocaleString('es-CO')}, van ${(ejemplo * ahorro / 100).toLocaleString('es-CO')} a ahorro
        y cada socio recibe ${Math.round(ejemplo * (100 - ahorro) / 100 / socios).toLocaleString('es-CO')}. Lo puedes cambiar después.
      </p>
      {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
      <button type="submit" disabled={guardando} className="btn btn-primario w-full">
        <PlusCircle size={16} /> {guardando ? 'Creando...' : 'Registrar negocio'}
      </button>
    </form>
  );
}

