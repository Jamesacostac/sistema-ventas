import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, collection, onSnapshot, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { X, Camera, CheckCircle2, MessageCircle, AlertTriangle, Columns2, ThumbsUp, PencilLine, ExternalLink } from 'lucide-react';
import { db } from './firebase';
import { achicarFoto, enlaceWhatsApp } from './fotos';
import { fechaHora, aMilis, URL_PAGINA_NOGURI } from './pedidosEnLinea';

/**
 * Seguimiento de un pedido en línea: fotos de cómo salió del taller, marcarlo listo y avisarle al cliente
 * (en el chat de la página y por WhatsApp), y los reportes del cliente con sus fotos para compararlas.
 * Las fotos viven en negocios/{id}/pedidos/{pedido}/fotos (no se editan; quedan como prueba).
 */
export default function SeguimientoPedido({ pedidoInicial, negocioId, usuario, operacion, puedeEditar, onCerrar, mostrarToast }) {
  const [pedido, setPedido] = useState(pedidoInicial);
  const [fotos, setFotos] = useState({});
  const [chat, setChat] = useState(null);
  const [fotosChat, setFotosChat] = useState({});
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [reporteElegido, setReporteElegido] = useState(null);
  const [ampliada, setAmpliada] = useState(null);
  const archivo = useRef(null);

  const refPedido = doc(db, 'negocios', negocioId, 'pedidos', pedidoInicial.id);

  useEffect(() => onSnapshot(refPedido, (s) => s.exists() && setPedido({ id: s.id, ...s.data() }), (e) => console.error('Pedido:', e)), [pedidoInicial.id]);
  useEffect(() => onSnapshot(collection(refPedido, 'fotos'),
    (s) => setFotos(Object.fromEntries(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]))),
    (e) => console.error('Fotos del pedido:', e)), [pedidoInicial.id]);
  useEffect(() => {
    if (!pedido.chatId) return undefined;
    const refChat = doc(db, 'negocios', negocioId, 'chats', pedido.chatId);
    const fin1 = onSnapshot(refChat, (s) => setChat(s.exists() ? s.data() : null), (e) => console.error('Chat:', e));
    const fin2 = onSnapshot(collection(refChat, 'fotos'),
      (s) => setFotosChat(Object.fromEntries(s.docs.map(d => [d.id, d.data().data]))),
      (e) => console.error('Fotos del chat:', e));
    return () => { fin1(); fin2(); };
  }, [pedido.chatId]);

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape') (ampliada ? setAmpliada(null) : onCerrar()); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [ampliada, onCerrar]);

  const fotosTaller = (pedido.fotosTaller || []).map(id => fotos[id]).filter(Boolean);
  const reportes = pedido.reportes || [];
  const reporte = reporteElegido !== null ? reportes[reporteElegido] : reportes[reportes.length - 1];
  const fotosReporte = (reporte?.fotos || []).map(id => fotos[id]).filter(Boolean);
  const enlacePedido = `${URL_PAGINA_NOGURI}?pedido=${pedido.id}`;
  const nombreCliente = String(pedido.clienteNombre || '').split(' ')[0];
  const nombrePedido = pedido.nombreSolicitud || pedido.codigo;
  const textoListo = `¡Hola ${nombreCliente}! 🎉 Tu pedido «${nombrePedido}» de NOGURI ya está listo. Mira cómo quedó y cuéntanos si te gusta o si quieres corregir algo: ${enlacePedido}`;
  const whatsappListo = enlaceWhatsApp(pedido.telefono, textoListo);

  const subirFotos = async (lista) => {
    const archivos = Array.from(lista || []).filter(f => f.type.startsWith('image/'));
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      const ids = [];
      for (const f of archivos) {
        const data = await achicarFoto(f);
        const ref = doc(collection(refPedido, 'fotos'));
        await setDoc(ref, { data, origen: 'taller', subidoPor: usuario.uid, creadoEn: serverTimestamp() });
        ids.push(ref.id);
      }
      const op = operacion('Fotos del taller', `${pedido.codigo} — ${ids.length} foto(s)`);
      op.actualizar(refPedido, { fotosTaller: [...(pedido.fotosTaller || []), ...ids] }, pedido);
      await op.guardar();
      mostrarToast(`📷 ${ids.length === 1 ? 'Foto guardada' : `${ids.length} fotos guardadas`}`);
    } catch (e) {
      alert('No se pudieron guardar las fotos: ' + e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const quitarFotoTaller = async (id) => {
    if (!confirm('¿Quitar esta foto de las que ve el cliente? (Queda guardada como registro.)')) return;
    const op = operacion('Foto del taller quitada', pedido.codigo);
    op.actualizar(refPedido, { fotosTaller: (pedido.fotosTaller || []).filter(f => f !== id) }, pedido);
    await op.guardar().catch(e => alert('No se pudo quitar: ' + e.message));
  };

  const marcarListo = async () => {
    if (!fotosTaller.length && !confirm('Todavía no hay fotos del taller. ¿Marcarlo listo sin fotos?')) return;
    setGuardando(true);
    try {
      const op = operacion('Pedido listo', `${pedido.codigo} — ${pedido.clienteNombre}`);
      op.actualizar(refPedido, { listo: true, listoEn: Date.now() }, pedido);
      await op.guardar();
      if (pedido.chatId) {
        const ahora = new Date().toISOString();
        await updateDoc(doc(db, 'negocios', negocioId, 'chats', pedido.chatId), {
          mensajes: arrayUnion({
            id: Math.random().toString(36).slice(2, 10), de: 'noguri', en: ahora,
            texto: `🎉 ¡Hola ${nombreCliente}! Tu pedido «${nombrePedido}» ya está listo. Mira cómo quedó y cuéntanos si te gusta o si quieres corregir algo.`,
            fotos: (pedido.fotosTaller || []).map(id => ({ pedido: pedido.id, id })),
          }),
          actualizadoEn: ahora,
          pendiente: false,
        });
      }
      mostrarToast(pedido.chatId ? '✅ Listo. Se le avisó en el chat de la página.' : '✅ Marcado como listo. Avísale por WhatsApp.');
    } catch (e) {
      alert('No se pudo marcar como listo: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarCampos = async (campos, accion) => {
    setGuardando(true);
    try {
      const op = operacion(accion, `${pedido.codigo} — ${pedido.clienteNombre}`);
      op.actualizar(refPedido, campos, pedido);
      await op.guardar();
    } catch (e) {
      alert('No se pudo guardar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const mensajesChat = useMemo(() => (chat?.mensajes || []).slice(-30), [chat]);
  const fotoDeRef = (r) => (r.pedido ? fotos[r.id]?.data : fotosChat[r.id]);

  const Miniatura = ({ data, etiqueta, onQuitar }) => (
    <div className="relative">
      <button type="button" onClick={() => setAmpliada(data)} className="block w-full aspect-square rounded-xl overflow-hidden border-[1.5px] border-linea bg-crema" title="Ampliar">
        {data ? <img src={data} alt={etiqueta || ''} className="w-full h-full object-cover" /> : null}
      </button>
      {onQuitar && <button type="button" onClick={onQuitar} className="absolute top-1 right-1 btn-icono bg-white/90 w-7 h-7" title="Quitar"><X size={14} /></button>}
    </div>
  );

  const estado = pedido.estado === 'cancelado' ? ['Cancelado', 'pastilla-peligro']
    : pedido.estado === 'pagado' ? ['Pagado', 'pastilla-ok']
    : pedido.listo ? ['Listo', 'pastilla-ok'] : ['En proceso', 'pastilla-pendiente'];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" role="dialog" aria-modal="true" aria-label={`Seguimiento del pedido ${pedido.codigo}`}>
      <div className="absolute inset-0 bg-tinta/50" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] shadow-[6px_6px_0_rgba(40,32,59,0.25)] p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold tracking-widest leading-none">{pedido.codigo}</p>
            <h2 className="text-lg font-bold text-tinta truncate">{pedido.clienteNombre}{pedido.nombreSolicitud ? ` · «${pedido.nombreSolicitud}»` : ''}</h2>
            <p className="text-xs text-gris-calido">
              {fechaHora(pedido.creadoEn)}{pedido.entregaFecha ? ` · para el ${pedido.entregaFecha}` : ''}
              {pedido.telefono ? <> · <a className="enlace" href={enlaceWhatsApp(pedido.telefono, `Hola ${nombreCliente}, te escribimos de NOGURI por tu pedido «${nombrePedido}».`)} target="_blank" rel="noreferrer">{pedido.telefono}</a></> : null}
            </p>
            <p className="text-[11px] text-gris-calido font-mono break-all">Seguimiento: {pedido.id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`pastilla ${estado[1]}`}>{estado[0]}</span>
            <button onClick={onCerrar} className="btn-icono" title="Cerrar"><X size={18} /></button>
          </div>
        </div>

        <ul className="text-sm space-y-0.5">
          {(pedido.items || []).map((it, i) => <li key={i}><b>{it.cantidad} × {it.nombre}</b>{it.descripcion ? <span className="text-gris-calido"> · {it.descripcion}</span> : null}</li>)}
        </ul>
        {pedido.carpetaUrl && <a href={pedido.carpetaUrl} target="_blank" rel="noreferrer" className="enlace text-xs inline-flex items-center gap-1">Ver los dibujos que envió <ExternalLink size={12} /></a>}

        {/* ---------- Fotos del taller ---------- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-tinta flex items-center gap-2"><Camera size={16} /> Así salió del taller</h3>
            {puedeEditar && (
              <>
                <input ref={archivo} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { subirFotos(e.target.files); e.target.value = ''; }} />
                <button onClick={() => archivo.current.click()} disabled={subiendo} className="btn btn-claro btn-sm"><Camera size={14} /> {subiendo ? 'Subiendo…' : 'Agregar fotos'}</button>
              </>
            )}
          </div>
          {fotosTaller.length
            ? <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{fotosTaller.map(f => <Miniatura key={f.id} data={f.data} etiqueta="Foto del taller" onQuitar={puedeEditar ? () => quitarFotoTaller(f.id) : null} />)}</div>
            : <p className="text-xs text-gris-calido">Toma fotos del producto terminado antes de entregarlo: el cliente las ve y sirven para comparar si reporta un problema.</p>}
        </section>

        {/* ---------- Avisar ---------- */}
        {puedeEditar && pedido.estado !== 'cancelado' && (
          <section className="rounded-xl border-[1.5px] border-linea p-3 space-y-2">
            {pedido.listo ? (
              <>
                <p className="text-sm flex items-center gap-2"><CheckCircle2 size={16} className="text-tinta" /> <b>Listo</b> desde {fechaHora(pedido.listoEn)}{pedido.chatId ? ' · se le avisó en el chat de la página' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {whatsappListo && <a href={whatsappListo} target="_blank" rel="noreferrer" className="btn btn-primario btn-sm"><MessageCircle size={14} /> Avisar por WhatsApp</a>}
                  <button onClick={() => cambiarCampos({ listo: false }, 'Pedido ya no está listo')} disabled={guardando} className="btn btn-claro btn-sm">Desmarcar listo</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gris-calido">Al marcarlo listo, el cliente ve el aviso con las fotos en el chat de la página{pedido.chatId ? '' : ' cuando abra su enlace'}. Después puedes avisarle por WhatsApp con el enlace a su pedido.</p>
                <button onClick={marcarListo} disabled={guardando} className="btn btn-primario btn-sm"><CheckCircle2 size={14} /> Marcar listo y avisar al cliente</button>
              </>
            )}
            {pedido.valoracion?.tipo === 'bien' && <p className="text-sm flex items-center gap-2"><ThumbsUp size={16} className="text-tinta" /> Al cliente le gustó ({fechaHora(Date.parse(pedido.valoracion.en))})</p>}
          </section>
        )}

        {/* ---------- Reportes del cliente y comparación ---------- */}
        {reportes.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-tinta flex items-center gap-2"><AlertTriangle size={16} /> Lo que reportó el cliente</h3>
              {pedido.reporteNuevo && puedeEditar && (
                <button onClick={() => cambiarCampos({ reporteNuevo: false }, 'Reporte de cliente revisado')} disabled={guardando} className="btn btn-oscuro btn-sm">Ya lo revisé</button>
              )}
            </div>
            {reportes.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {reportes.map((r, i) => (
                  <button key={i} onClick={() => setReporteElegido(i)} className={`chip ${r === reporte ? 'chip-activo' : ''}`}>
                    {r.tipo === 'corregir' ? '✏️' : '⚠️'} {fechaHora(Date.parse(r.en))}
                  </button>
                ))}
              </div>
            )}
            {reporte && (
              <div className="rounded-xl border-[1.5px] border-tinta p-3 space-y-3">
                <p className="text-sm">
                  <b>{reporte.tipo === 'corregir' ? <><PencilLine size={14} className="inline" /> Quiere corregir algo</> : <><AlertTriangle size={14} className="inline" /> Reporta un problema</>}</b>
                  <span className="text-gris-calido"> · {fechaHora(Date.parse(reporte.en))}</span>
                </p>
                {reporte.texto && <p className="text-sm whitespace-pre-wrap">«{reporte.texto}»</p>}
                <div>
                  <p className="text-xs font-bold text-gris-calido mb-2 flex items-center gap-1.5"><Columns2 size={14} /> Comparar</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-bold">Así salió del taller</p>
                      {fotosTaller.length
                        ? <div className="grid grid-cols-2 gap-2">{fotosTaller.map(f => <Miniatura key={f.id} data={f.data} etiqueta="Taller" />)}</div>
                        : <p className="text-xs text-gris-calido">No hay fotos del taller.</p>}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold">Lo que envió el cliente</p>
                      {fotosReporte.length
                        ? <div className="grid grid-cols-2 gap-2">{fotosReporte.map(f => <Miniatura key={f.id} data={f.data} etiqueta="Cliente" />)}</div>
                        : <p className="text-xs text-gris-calido">El cliente no envió fotos.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------- Conversación de la página ---------- */}
        {chat && (
          <section className="space-y-2">
            <h3 className="font-bold text-tinta flex items-center gap-2"><MessageCircle size={16} /> Conversación en la página</h3>
            <p className="text-xs text-gris-calido">Para contestarle, usa «Responder» sobre su mensaje en Telegram.</p>
            <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl bg-crema p-3">
              {mensajesChat.map(m => (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.de === 'cliente' ? 'bg-white border border-linea' : 'ml-auto bg-tinta text-white'}`}>
                  {m.texto}
                  {m.fotos?.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {m.fotos.map(r => <Miniatura key={r.id} data={fotoDeRef(r)} />)}
                    </div>
                  )}
                  <span className="block text-[10px] opacity-60 mt-1">{m.de === 'cliente' ? 'Cliente' : 'Noguri'} · {fechaHora(Date.parse(m.en))}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-[11px] text-gris-calido">
          Enlace del cliente a su pedido: <a className="enlace break-all" href={enlacePedido} target="_blank" rel="noreferrer">{enlacePedido}</a>
          {' '}· Última actualización {fechaHora(Math.max(aMilis(pedido.modificadoEn), aMilis(pedido.creadoEn)))}
        </p>
      </div>

      {ampliada && (
        <div className="fixed inset-0 z-[60] bg-tinta/85 flex items-center justify-center p-4" onClick={() => setAmpliada(null)} role="dialog" aria-label="Foto ampliada">
          <img src={ampliada} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl bg-white" />
        </div>
      )}
    </div>
  );
}
