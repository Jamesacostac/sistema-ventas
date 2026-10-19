import React, { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Palette, Upload, Save, RotateCcw, ImageOff, AlertTriangle, CheckCircle, ShoppingCart, Wallet } from 'lucide-react';
import { db } from './firebase';
import { ROLES, MARCA_BASE, detectarMarca, leerLogo, estiloVistaPrevia, urlFuentes, contraste, esHex } from './marca';

/**
 * Marca del negocio: se importa de un manual de marca (HTML/CSS/SVG) o de un logo, se ajusta
 * y se guarda en negocios/{nid}/config/marca. Toda la app del negocio se ve con esa marca.
 */

const FUENTES_SUGERIDAS = ['Quicksand', 'Nunito Sans', 'Nunito', 'DM Sans', 'Space Grotesk', 'Poppins', 'Montserrat', 'Rubik', 'Fredoka', 'Lora', 'Playfair Display', 'Work Sans', 'Inter', 'Baloo 2', 'Comfortaa'];

const copiaMarca = (m) => ({
  colores: { ...MARCA_BASE.colores, ...(m?.colores || {}) },
  fuentes: { ...MARCA_BASE.fuentes, ...(m?.fuentes || {}) },
  estilo: m?.estilo || 'pop',
  logo: m?.logo || null,
  origen: m?.origen || ''
});

export default function ConfigMarca({ negocioId, negocio, marca, esTitular, operacion }) {
  const [form, setForm] = useState(() => copiaMarca(marca?.activa ? marca : null));
  const [detectado, setDetectado] = useState(null); // { paleta, logos }
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // La vista previa carga sus propias tipografías
  useEffect(() => {
    const url = urlFuentes(form.fuentes);
    let link = document.getElementById('fuentes-vista-marca');
    if (!url) { link?.remove(); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = 'fuentes-vista-marca';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [form.fuentes.titulos, form.fuentes.texto]);

  const setColor = (clave, valor) => setForm(f => ({ ...f, colores: { ...f.colores, [clave]: valor } }));

  const importar = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setEstado(null);
    try {
      if (/^image\/(png|jpe?g|webp|gif)$/.test(archivo.type)) {
        const logo = await leerLogo(archivo);
        setForm(f => ({ ...f, logo }));
        setEstado({ tipo: 'ok', texto: `Logo cargado de "${archivo.name}". Revisa la vista previa y guarda.` });
        return;
      }
      if (archivo.size > 8 * 1024 * 1024) throw new Error('El archivo pesa más de 8 MB.');
      const texto = await archivo.text();
      if (/\.json$/i.test(archivo.name)) {
        const datos = JSON.parse(texto);
        setForm(copiaMarca(datos));
        setEstado({ tipo: 'ok', texto: 'Marca cargada del archivo. Revisa la vista previa y guarda.' });
        return;
      }
      const { marca: m, paleta, logos } = detectarMarca(texto, archivo.name);
      setForm(copiaMarca(m));
      setDetectado({ paleta, logos });
      setEstado({
        tipo: 'ok',
        texto: `Detectado en "${archivo.name}": ${paleta.length} colores, letras ${m.fuentes.titulos} y ${m.fuentes.texto}, ${logos.length} imagen(es), estilo ${m.estilo === 'papel' ? 'papel' : 'pop'}. Ajusta lo que quieras y guarda.`
      });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo leer el archivo: ' + err.message });
    }
  };

  const subirLogo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      const logo = await leerLogo(archivo);
      setForm(f => ({ ...f, logo }));
    } catch (err) {
      setEstado({ tipo: 'error', texto: err.message });
    }
  };

  const guardar = async (activa) => {
    if (!esTitular) return;
    const malos = ROLES.filter(r => !esHex(form.colores[r.clave]));
    if (activa && malos.length) return setEstado({ tipo: 'error', texto: `Revisa el color de: ${malos.map(r => r.nombre).join(', ')} (formato #RRGGBB).` });
    setGuardando(true);
    setEstado(null);
    try {
      const datos = activa
        ? { ...form, fuentes: { titulos: form.fuentes.titulos.trim(), texto: form.fuentes.texto.trim() }, activa: true }
        : { activa: false };
      const op = operacion(activa ? 'Marca del negocio guardada' : 'Marca del negocio quitada', activa
        ? `${negocio.nombre}: acento ${form.colores.acento}, letras ${form.fuentes.titulos} / ${form.fuentes.texto}, estilo ${form.estilo}${form.origen ? ` (de ${form.origen})` : ''}`
        : `${negocio.nombre} vuelve a la apariencia original`);
      op.crear(doc(db, 'negocios', negocioId, 'config', 'marca'), datos);
      await op.guardar();
      if (!activa) setForm(copiaMarca(null));
      setEstado({ tipo: 'ok', texto: activa ? 'Marca guardada: el sitio ya se ve así para todo el equipo.' : 'Listo: el negocio volvió a la apariencia original.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const c = form.colores;
  const avisosContraste = [
    contraste(c.tinta, c.fondo) < 4.5 && 'el texto sobre el fondo',
    contraste(c.tinta, c.acento) < 4.5 && 'el texto sobre el acento',
    contraste(c.tinta, c.cabecera) < 4.5 && 'el texto sobre la cabecera'
  ].filter(Boolean);

  return (
    <div className="panel p-5 md:p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><Palette size={18} /> Marca y apariencia de {negocio.nombre}</h2>
        <p className="text-xs text-gris-calido mt-1">
          Sube el manual de marca (HTML), una hoja de estilos o el logo, y el sitio de este negocio toma sus colores, letras y logo.
          {marca?.activa ? ' Este negocio ya tiene una marca propia.' : ' Ahora usa la apariencia original.'}
        </p>
      </div>

      <fieldset disabled={!esTitular || guardando} className="space-y-5">
        <label className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border-[1.5px] border-dashed border-linea-fuerte p-4 cursor-pointer hover:bg-crema/50">
          <Upload size={22} className="text-tinta shrink-0" />
          <span className="flex-1">
            <span className="font-semibold text-sm text-tinta block">Importar desde un archivo</span>
            <span className="text-xs text-gris-calido">Manual de marca (.html), estilos (.css), logo (.svg, .png, .jpg) o una marca guardada (.json)</span>
          </span>
          <span className="btn btn-claro btn-sm">Elegir archivo</span>
          <input type="file" accept=".html,.htm,.css,.svg,.json,image/png,image/jpeg,image/webp" onChange={importar} className="hidden" />
        </label>

        {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <section>
              <p className="etiqueta">Colores</p>
              <datalist id="paleta-marca">{(detectado?.paleta || []).map(p => <option key={p.hex} value={p.hex}>{p.nombre}</option>)}</datalist>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <div key={r.clave} className="flex items-center gap-2" title={r.ayuda}>
                    <input type="color" value={esHex(c[r.clave]) && c[r.clave].length === 7 ? c[r.clave] : '#000000'} onChange={(e) => setColor(r.clave, e.target.value.toUpperCase())} className="h-9 w-10 rounded-lg border-[1.5px] border-linea-fuerte bg-tarjeta cursor-pointer shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-tinta truncate">{r.nombre}</span>
                      <input list="paleta-marca" value={c[r.clave]} onChange={(e) => setColor(r.clave, e.target.value.trim())} className="w-full bg-transparent text-[11px] text-gris-calido font-mono focus:outline-none" />
                    </span>
                  </div>
                ))}
              </div>
              {detectado?.paleta?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {detectado.paleta.map(p => (
                    <span key={p.hex} title={`${p.nombre || 'color'} ${p.hex}`} className="h-6 w-6 rounded-full border border-linea-fuerte" style={{ background: p.hex }} />
                  ))}
                </div>
              )}
              {avisosContraste.length > 0 && (
                <p className="text-[11px] text-[#B23A50] mt-2 flex items-center gap-1"><AlertTriangle size={12} /> Poco contraste en {avisosContraste.join(', ')}: puede costar leerlo.</p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <datalist id="fuentes-marca-lista">{FUENTES_SUGERIDAS.map(f => <option key={f} value={f} />)}</datalist>
              <div>
                <label className="etiqueta">Letra de títulos</label>
                <input list="fuentes-marca-lista" value={form.fuentes.titulos} onChange={(e) => setForm(f => ({ ...f, fuentes: { ...f.fuentes, titulos: e.target.value } }))} className="campo" />
              </div>
              <div>
                <label className="etiqueta">Letra de textos</label>
                <input list="fuentes-marca-lista" value={form.fuentes.texto} onChange={(e) => setForm(f => ({ ...f, fuentes: { ...f.fuentes, texto: e.target.value } }))} className="campo" />
              </div>
              <p className="col-span-2 text-[11px] text-gris-calido -mt-1">Nombres de Google Fonts (gratis).</p>
            </section>

            <section>
              <p className="etiqueta">Estilo</p>
              <div className="segmentado">
                <button type="button" onClick={() => setForm(f => ({ ...f, estilo: 'pop' }))} className={`segmento ${form.estilo === 'pop' ? 'segmento-activo' : ''}`}>Pop (sombras y puntos)</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, estilo: 'papel' }))} className={`segmento ${form.estilo === 'papel' ? 'segmento-activo' : ''}`}>Papel (suave y plano)</button>
              </div>
            </section>

            <section>
              <p className="etiqueta">Logo de la cabecera</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-14 w-14 rounded-full border-[1.5px] border-linea-fuerte bg-tarjeta flex items-center justify-center overflow-hidden">
                  {form.logo ? <img src={form.logo} alt="Logo" className="h-full w-full object-contain" /> : <img src="/marca/sello.svg" alt="" className="h-full w-full opacity-60" />}
                </span>
                <label className="btn btn-claro btn-sm cursor-pointer">
                  <Upload size={14} /> Subir logo
                  <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={subirLogo} className="hidden" />
                </label>
                {form.logo && <button type="button" onClick={() => setForm(f => ({ ...f, logo: null }))} className="btn btn-claro btn-sm"><ImageOff size={14} /> Quitar</button>}
              </div>
              {detectado?.logos?.length > 1 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {detectado.logos.slice(0, 16).map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, logo: l.src }))}
                      title={l.alt || 'Imagen del manual'}
                      className={`h-14 w-14 rounded-xl border-[1.5px] bg-tarjeta p-1 ${form.logo === l.src ? 'border-tinta' : 'border-linea'}`}
                    >
                      <img src={l.src} alt={l.alt} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Vista previa con la marca del formulario (no cambia el resto de la página) */}
          <div>
            <p className="etiqueta">Vista previa</p>
            <div data-estilo={form.estilo} style={{ ...estiloVistaPrevia(form), background: 'var(--color-papel)', fontFamily: 'var(--font-sans)', color: 'var(--color-tinta)' }} className="rounded-2xl border-[1.5px] border-linea p-3 space-y-3">
              <div className="marca-cabecera rounded-xl p-3 flex items-center gap-3">
                <img src={form.logo || '/marca/sello.svg'} alt="" className="h-10 w-10 rounded-full object-contain bg-tarjeta" />
                <div>
                  <p className="marca-eyebrow opacity-80">Ventas y finanzas</p>
                  <p className="marca-titular text-lg leading-tight">{negocio.nombre}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="kpi kpi-sol p-3"><p className="kpi-etiqueta">Ventas</p><p className="kpi-valor text-lg">$72.500</p></div>
                <div className="kpi kpi-turquesa p-3"><p className="kpi-etiqueta">Reposición</p><p className="kpi-valor text-lg">$38.369</p></div>
                <div className="kpi kpi-verde p-3"><p className="kpi-etiqueta">Ahorro</p><p className="kpi-valor text-lg">$6.826</p></div>
                <div className="kpi kpi-coral p-3"><p className="kpi-etiqueta">Por socio</p><p className="kpi-valor text-lg">$13.652</p></div>
              </div>
              <div className="panel p-3 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2"><ShoppingCart size={16} /> Pedido</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="pastilla pastilla-ok"><CheckCircle size={11} /> Pagado</span>
                  <span className="pastilla pastilla-pendiente">Fiado</span>
                  <span className="pastilla pastilla-neutra">3 listos</span>
                </div>
                <p className="text-xs text-gris-calido">Así se ven los textos de ayuda y las descripciones.</p>
                <div className="flex flex-wrap gap-2">
                  <span className="btn btn-primario btn-sm">Cobrar $5.000</span>
                  <span className="btn btn-oscuro btn-sm"><Wallet size={14} /> Escanear</span>
                  <span className="btn btn-claro btn-sm">Cancelar</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {esTitular ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => guardar(true)} className="btn btn-primario"><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar marca'}</button>
            {marca?.activa && <button type="button" onClick={() => guardar(false)} className="btn btn-claro"><RotateCcw size={16} /> Volver a la apariencia original</button>}
          </div>
        ) : (
          <p className="aviso aviso-atencion">🔒 Solo el titular de {negocio.nombre} puede cambiar la marca.</p>
        )}
      </fieldset>
    </div>
  );
}
