import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query, limit, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { MessageCircle, X, Send, Camera, ArrowLeft, Package, Check } from 'lucide-react';
import { db } from './firebase';
import { achicarFoto, enlaceWhatsApp } from './fotos';
import { fechaHora, URL_API_NOGURI } from './pedidosEnLinea';

const CADA_SYNC = 15000;
// Igual que en la API de la página (Apps Script). Tras «/finalizar», al recargar, el cliente ve el chat desde cero.
const DESPEDIDA_CHAT = '✅ Finalizamos esta conversación. ¡Gracias por escribirnos! Si necesitas algo más, escríbenos de nuevo por aquí.';
const finalizada = (c) => {
  const ultimo = (c.mensajes || [])[c.mensajes?.length - 1];
  return !!c.cerradoEn && (!ultimo || String(ultimo.en) <= c.cerradoEn);
};

/**
 * Bandeja flotante con las conversaciones del chat de la página (negocios/{id}/chats).
 * Se responde una por una; el cliente lo ve en el chat de la página. Las respuestas dadas en Telegram
 * también llegan aquí (mientras está abierta se le pide a la API que las traiga).
 * Tocar el nombre del cliente abre el seguimiento de su pedido. Escribir «/finalizar» cierra la conversación.
 */
export default function ChatsFlotante({ negocioId, usuario, nombreUsuario, onAbrirPedido, mostrarToast }) {
  const [chats, setChats] = useState([]);
  const [abierta, setAbierta] = useState(false);
  const [elegido, setElegido] = useState(null);
  const [fotosChat, setFotosChat] = useState({});
  const [fotosPedido, setFotosPedido] = useState({});
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [ampliada, setAmpliada] = useState(null);
  const ultimos = useRef(null);
  const archivo = useRef(null);
  const lista = useRef(null);

  const colChats = collection(db, 'negocios', negocioId, 'chats');

  useEffect(() => onSnapshot(query(colChats, orderBy('actualizadoEn', 'desc'), limit(60)), (snap) => {
    const nuevos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Aviso cuando un cliente escribe algo nuevo
    if (ultimos.current) {
      nuevos.forEach(c => {
        const m = (c.mensajes || [])[c.mensajes?.length - 1];
        if (m && m.de === 'cliente' && ultimos.current[c.id] !== m.id) mostrarToast(`💬 ${c.nombre || 'Cliente'}: ${m.texto || '📷 foto'}`.slice(0, 120), 'info');
      });
    }
    ultimos.current = Object.fromEntries(nuevos.map(c => [c.id, (c.mensajes || [])[c.mensajes?.length - 1]?.id]));
    setChats(nuevos);
  }, (e) => console.error('Chats de la página:', e)), [negocioId]);

  // Respuestas dadas en Telegram: la API las recoge cuando se le pregunta
  useEffect(() => {
    if (!abierta) return undefined;
    const sync = () => fetch(`${URL_API_NOGURI}?op=sync&t=${Date.now()}`).catch(() => {});
    sync();
    const t = setInterval(sync, CADA_SYNC);
    return () => clearInterval(t);
  }, [abierta]);

  const chat = chats.find(c => c.id === elegido) || null;

  useEffect(() => {
    if (!elegido) return undefined;
    setFotosChat({});
    return onSnapshot(collection(colChats, elegido, 'fotos'),
      (s) => setFotosChat(Object.fromEntries(s.docs.map(d => [d.id, d.data().data]))),
      (e) => console.error('Fotos del chat:', e));
  }, [elegido]);

  // Fotos que el cliente adjuntó a un reporte (viven en el pedido)
  useEffect(() => {
    (chat?.mensajes || []).flatMap(m => m.fotos || []).filter(r => r.pedido && !fotosPedido[r.id]).forEach(r => {
      getDoc(doc(db, 'negocios', negocioId, 'pedidos', r.pedido, 'fotos', r.id))
        .then(s => s.exists() && setFotosPedido(f => ({ ...f, [r.id]: s.data().data })))
        .catch(() => {});
    });
  }, [chat?.mensajes?.length, elegido]);

  useEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [chat?.mensajes?.length, elegido]);

  useEffect(() => {
    if (!abierta) return undefined;
    const cerrar = (e) => { if (e.key === 'Escape') (ampliada ? setAmpliada(null) : setAbierta(false)); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [abierta, ampliada]);

  const porResponder = chats.filter(c => c.pendiente).length;
  const ordenados = useMemo(() => [...chats].sort((a, b) => (b.pendiente === true) - (a.pendiente === true) || finalizada(a) - finalizada(b)), [chats]);

  if (!chats.length) return null;

  const agregarFotos = async (lista) => {
    const archivos = Array.from(lista || []).filter(f => f.type.startsWith('image/')).slice(0, 4 - adjuntos.length);
    try {
      const datos = await Promise.all(archivos.map(achicarFoto));
      setAdjuntos(a => [...a, ...datos]);
    } catch (e) {
      alert(e.message);
    }
  };

  const finalizar = async () => {
    setEnviando(true);
    try {
      const ahora = new Date().toISOString();
      await updateDoc(doc(colChats, chat.id), {
        mensajes: arrayUnion({ id: Math.random().toString(36).slice(2, 10), de: 'noguri', texto: DESPEDIDA_CHAT, en: ahora, fin: true, autor: nombreUsuario || '' }),
        actualizadoEn: ahora,
        cerradoEn: ahora,
        pendiente: false,
      });
      setTexto('');
      mostrarToast(`✅ Conversación con ${chat.nombre || 'el cliente'} finalizada. Al recargar, su chat empieza desde cero.`);
    } catch (err) {
      alert('No se pudo finalizar: ' + err.message);
    } finally {
      setEnviando(false);
    }
  };

  const responder = async (e) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!chat || enviando || (!t && !adjuntos.length)) return;
    if (/^\/finalizar/i.test(t) && !adjuntos.length) return finalizar();
    setEnviando(true);
    try {
      const refChat = doc(colChats, chat.id);
      const fotos = [];
      for (const data of adjuntos) {
        const ref = doc(collection(refChat, 'fotos'));
        await setDoc(ref, { data, origen: 'equipo', subidoPor: usuario.uid, creadoEn: serverTimestamp() });
        fotos.push({ id: ref.id });
      }
      const ahora = new Date().toISOString();
      const mensaje = { id: Math.random().toString(36).slice(2, 10), de: 'noguri', texto: t, en: ahora, autor: nombreUsuario || '' };
      if (fotos.length) mensaje.fotos = fotos;
      await updateDoc(refChat, { mensajes: arrayUnion(mensaje), actualizadoEn: ahora, pendiente: false });
      setTexto('');
      setAdjuntos([]);
    } catch (err) {
      alert('No se pudo enviar: ' + err.message);
    } finally {
      setEnviando(false);
    }
  };

  const marcarAtendido = () => updateDoc(doc(colChats, chat.id), { pendiente: false }).catch(err => alert(err.message));

  const fotoDe = (r) => (r.pedido ? fotosPedido[r.id] : fotosChat[r.id]);

  return (
    <>
      {!abierta && (
        <button
          onClick={() => setAbierta(true)}
          className="fixed z-30 left-4 bottom-20 sm:bottom-4 btn btn-oscuro !rounded-full !py-3 !px-4 shadow-[4px_4px_0_var(--color-turquesa)] no-print"
          aria-label={`Chats de la página${porResponder ? `, ${porResponder} por responder` : ''}`}
        >
          <MessageCircle size={18} /> Chats
          {porResponder > 0 && <span className="pastilla pastilla-peligro !py-0 !px-2">{porResponder}</span>}
        </button>
      )}

      {abierta && (
        <div className="fixed z-40 inset-0 sm:inset-auto sm:left-4 sm:bottom-4 sm:w-[760px] sm:h-[600px] sm:max-h-[calc(100dvh-2rem)] bg-white sm:border-2 border-tinta sm:rounded-[1.25rem] shadow-[6px_6px_0_rgba(40,32,59,0.25)] flex flex-col overflow-hidden no-print" role="dialog" aria-label="Chats de la página">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b-[1.5px] border-linea bg-crema">
            <h2 className="font-bold text-tinta flex items-center gap-2"><MessageCircle size={18} /> Chats de la página {porResponder > 0 && <span className="pastilla pastilla-peligro">{porResponder} por responder</span>}</h2>
            <button onClick={() => setAbierta(false)} className="btn-icono" title="Cerrar"><X size={18} /></button>
          </div>
          <div className="flex-1 min-h-0 flex">
            {/* Lista de conversaciones */}
            <ul className={`${chat ? 'hidden sm:block' : 'block'} w-full sm:w-64 shrink-0 overflow-y-auto border-r-[1.5px] border-linea`}>
              {ordenados.map(c => {
                const m = (c.mensajes || [])[c.mensajes?.length - 1];
                return (
                  <li key={c.id}>
                    <button onClick={() => setElegido(c.id)} className={`w-full text-left px-3 py-2.5 border-b border-linea-suave hover:bg-crema ${c.id === elegido ? 'bg-sol/30' : ''}`}>
                      <span className="flex items-center justify-between gap-2">
                        <b className="text-sm truncate">{c.nombre || 'Cliente sin nombre'}</b>
                        {c.pendiente && <span className="w-2.5 h-2.5 rounded-full bg-coral shrink-0" title="Por responder" />}
                        {!c.pendiente && finalizada(c) && <span className="pastilla pastilla-neutra !text-[10px] !py-0 shrink-0">Finalizada</span>}
                      </span>
                      {c.pedidoCodigo && <span className="block text-[11px] font-mono text-gris-calido">📦 {c.pedidoCodigo}</span>}
                      <span className="block text-xs text-gris-calido truncate">{m ? `${m.de === 'cliente' ? '' : 'Tú: '}${m.texto || '📷 foto'}` : 'Sin mensajes'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Conversación */}
            {chat ? (
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2 border-b-[1.5px] border-linea">
                  <button onClick={() => setElegido(null)} className="btn-icono sm:hidden" title="Volver"><ArrowLeft size={18} /></button>
                  <div className="min-w-0 flex-1">
                    {chat.pedidoId
                      ? <button onClick={() => onAbrirPedido(chat.pedidoId)} className="font-bold text-tinta underline decoration-2 underline-offset-2 truncate max-w-full text-left" title="Ver el pedido">{chat.nombre || 'Cliente'}</button>
                      : <b className="text-tinta truncate block">{chat.nombre || 'Cliente'}</b>}
                    <p className="text-[11px] text-gris-calido truncate">
                      {chat.pedidoId ? <><Package size={11} className="inline" /> {chat.pedidoCodigo}{chat.pedidoNombre ? ` «${chat.pedidoNombre}»` : ''} · </> : 'Sin pedido · '}
                      {chat.telefono ? <a className="enlace" href={enlaceWhatsApp(chat.telefono, `Hola ${String(chat.nombre || '').split(' ')[0]}, te escribimos de NOGURI.`)} target="_blank" rel="noreferrer">{chat.telefono}</a> : null}
                      {chat.correo ? ` · ${chat.correo}` : ''}
                    </p>
                  </div>
                  {chat.pendiente && <button onClick={marcarAtendido} className="btn btn-claro btn-sm" title="Quitar de «por responder» sin escribir"><Check size={14} /> Atendido</button>}
                </div>
                <div ref={lista} className="flex-1 overflow-y-auto p-3 space-y-2 bg-crema/60">
                  {(chat.mensajes || []).map(m => (
                    <React.Fragment key={m.id}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.de === 'cliente' ? 'bg-white border border-linea' : 'ml-auto bg-tinta text-white'}`}>
                      {m.texto}
                      {m.fotos?.length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          {m.fotos.map(r => (
                            <button key={r.id} type="button" onClick={() => fotoDe(r) && setAmpliada(fotoDe(r))} className="block aspect-square rounded-lg overflow-hidden bg-linea">
                              {fotoDe(r) ? <img src={fotoDe(r)} alt="Foto" className="w-full h-full object-cover" /> : null}
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="block text-[10px] opacity-60 mt-1">{m.de === 'cliente' ? 'Cliente' : (m.autor || 'Noguri')} · {fechaHora(Date.parse(m.en))}</span>
                    </div>
                    {m.fin && <p className="separador text-[11px] text-gris-calido text-center py-1">— Conversación finalizada · al recargar, el cliente empieza un chat nuevo —</p>}
                    </React.Fragment>
                  ))}
                </div>
                <form onSubmit={responder} className="border-t-[1.5px] border-linea p-2 space-y-2">
                  {adjuntos.length > 0 && (
                    <div className="flex gap-2">
                      {adjuntos.map((d, i) => (
                        <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden">
                          <img src={d} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setAdjuntos(adjuntos.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-tinta text-white rounded-full w-5 h-5 text-xs" aria-label="Quitar foto">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input ref={archivo} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
                    <button type="button" onClick={() => archivo.current.click()} disabled={adjuntos.length >= 4} className="btn-icono shrink-0" title="Adjuntar fotos"><Camera size={18} /></button>
                    <textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                      rows={1}
                      maxLength={2000}
                      placeholder={`Responder a ${String(chat.nombre || 'el cliente').split(' ')[0]}… (/finalizar para cerrar)`}
                      className="campo resize-none"
                      aria-label="Respuesta"
                    />
                    <button type="submit" disabled={enviando || (!texto.trim() && !adjuntos.length)} className="btn btn-primario shrink-0" title="Enviar"><Send size={16} /></button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="hidden sm:flex flex-1 items-center justify-center text-sm text-gris-calido p-6 text-center">
                Elige una conversación. Lo que respondas aquí le aparece al cliente en el chat de la página.
              </div>
            )}
          </div>
        </div>
      )}

      {ampliada && (
        <div className="fixed inset-0 z-[60] bg-tinta/85 flex items-center justify-center p-4" onClick={() => setAmpliada(null)} role="dialog" aria-label="Foto ampliada">
          <img src={ampliada} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl bg-white" />
        </div>
      )}
    </>
  );
}
