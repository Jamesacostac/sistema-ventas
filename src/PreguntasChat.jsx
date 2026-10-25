import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { MessageCircleQuestion, Plus, Save, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { db } from './firebase';

// Las que más se preguntan en negocios de stickers, botones y pines. Sin respuesta no salen en el chat.
const SUGERIDAS = [
  ['Garantía por daño del producto', true],
  ['¿Cuánto se demora mi pedido?', false],
  ['¿Cómo me lo envían?', false],
  ['¿Cómo puedo pagar?', false],
  ['¿Hay pedido mínimo?', false],
  ['¿Hay descuento por cantidad?', false],
  ['¿Me ayudan con el diseño?', false],
  ['¿Qué pasa si mi imagen tiene mala calidad?', false],
  ['¿Resisten el agua y el sol?', false],
  ['¿Puedo ver una prueba antes?', false],
  ['¿Puedo cambiar o cancelar mi pedido?', false],
  ['¿Hacen diseños de marcas o personajes?', false],
].map(([pregunta, reporte], i) => ({ id: 'sugerida' + i, pregunta, respuesta: '', reporte }));

const nuevoId = () => Math.random().toString(36).slice(2, 10);

/**
 * Preguntas frecuentes del chat de la página (negocios/{id}/config/chat). El chat muestra cada una como botón
 * y responde al instante; «reportar» agrega el botón para reportar un daño con fotos.
 */
export default function PreguntasChat({ negocioId, esTitular, operacion }) {
  const [preguntas, setPreguntas] = useState(null);
  const [antes, setAntes] = useState(null);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const ref = doc(db, 'negocios', negocioId, 'config', 'chat');

  useEffect(() => {
    getDoc(ref)
      .then(s => {
        const guardadas = s.exists() ? s.data().preguntas || [] : null;
        setAntes(guardadas);
        setPreguntas(guardadas || SUGERIDAS);
      })
      .catch(() => setPreguntas(SUGERIDAS));
  }, [negocioId]);

  if (!preguntas) return null;

  const cambiar = (i, campos) => setPreguntas(preguntas.map((p, j) => (j === i ? { ...p, ...campos } : p)));
  const mover = (i, d) => {
    const lista = [...preguntas];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    setPreguntas(lista);
  };

  const guardar = async () => {
    setEstado(null);
    const limpias = preguntas
      .map(p => ({ id: p.id || nuevoId(), pregunta: p.pregunta.trim(), respuesta: p.respuesta.trim(), reporte: !!p.reporte }))
      .filter(p => p.pregunta);
    setGuardando(true);
    try {
      const op = operacion('Preguntas del chat cambiadas', `${limpias.filter(p => p.respuesta).length} con respuesta`);
      op.crear(ref, { preguntas: limpias });
      await op.guardar();
      setAntes(limpias);
      setPreguntas(limpias);
      setEstado({ tipo: 'ok', texto: 'Guardado. El chat de la página las muestra en unos 2 minutos.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const conRespuesta = preguntas.filter(p => p.pregunta.trim() && p.respuesta.trim()).length;

  return (
    <div className="panel p-5 md:p-6">
      <h2 className="text-base font-bold text-tinta flex items-center gap-2.5 mb-1"><MessageCircleQuestion size={18} /> Preguntas del chat de la página</h2>
      <p className="text-xs text-gris-calido mb-4">
        Salen como botones al abrir el chat y se responden al instante. <b>Solo se muestran las que tienen respuesta</b> ({conRespuesta} de {preguntas.length}).
        {!antes && ' Te dejamos las que más se preguntan en este tipo de negocio: escribe tus respuestas.'}
      </p>
      <fieldset disabled={!esTitular} className="space-y-3">
        {preguntas.map((p, i) => (
          <div key={p.id || i} className={`rounded-xl border-[1.5px] p-3 space-y-2 ${p.respuesta.trim() ? 'border-tinta' : 'border-linea'}`}>
            <div className="flex gap-2">
              <input value={p.pregunta} onChange={(e) => cambiar(i, { pregunta: e.target.value })} maxLength={80} className="campo font-semibold" placeholder="Pregunta" aria-label={`Pregunta ${i + 1}`} />
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="btn-icono" title="Subir"><ArrowUp size={16} /></button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === preguntas.length - 1} className="btn-icono" title="Bajar"><ArrowDown size={16} /></button>
              <button type="button" onClick={() => setPreguntas(preguntas.filter((_, j) => j !== i))} className="btn-icono" title="Quitar"><Trash2 size={16} /></button>
            </div>
            <textarea value={p.respuesta} onChange={(e) => cambiar(i, { respuesta: e.target.value })} rows={2} maxLength={1000} className="campo" placeholder="Respuesta (vacía = no sale en el chat)" aria-label={`Respuesta ${i + 1}`} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!p.reporte} onChange={(e) => cambiar(i, { reporte: e.target.checked })} />
              Después de responder, ofrecer «Reportar un daño con fotos»
            </label>
          </div>
        ))}
        {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
        {esTitular && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={guardar} disabled={guardando} className="btn btn-primario"><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar preguntas'}</button>
            <button type="button" onClick={() => setPreguntas([...preguntas, { id: nuevoId(), pregunta: '', respuesta: '', reporte: false }])} className="btn btn-claro"><Plus size={16} /> Agregar pregunta</button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
