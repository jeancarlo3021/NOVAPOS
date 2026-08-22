import React, { useRef, useState } from 'react';
import {
  X, Save, Loader2, AlertCircle, Plus, Trash2, Camera, MapPin, Clock, User,
} from 'lucide-react';
import { storageService } from '@/services/storage/storageService';
import { useTenantId } from '@/hooks/useTenant';
import { agendaTasksService, type AgendaTask, type TaskPlace } from '@/services/agents/agendaTasksService';

/**
 * Alta y edición de una tarea de agenda (mandado, trámite, visita).
 *
 * Las fotos van a Storage antes de guardar: la tarea guarda solo las URLs, así
 * un mandado con seis fotos no infla la fila ni el listado del día.
 */
export const TaskEditor: React.FC<{
  task: AgendaTask | null;
  day: string;
  people: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (t: AgendaTask) => void;
}> = ({ task, day, people, onClose, onSaved }) => {
  const { tenantId } = useTenantId();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [date, setDate] = useState(task?.scheduled_date ?? day);
  const [time, setTime] = useState((task?.scheduled_time ?? '').slice(0, 5));
  const [places, setPlaces] = useState<TaskPlace[]>(task?.places ?? []);
  const [photos, setPhotos] = useState<string[]>(task?.photos ?? []);
  const [assigned, setAssigned] = useState(task?.assigned_to ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !tenantId) return;
    setUploading(true); setError(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        // El bucket 'products' ya es público y existe en todos los tenants; se
        // reusa para no depender de crear uno nuevo en cada instalación.
        const path = `${tenantId}/agenda/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`;
        urls.push(await storageService.upload('products', path, f));
      }
      setPhotos(prev => [...prev, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron subir las fotos');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!title.trim()) { setError('Ponle un nombre a la tarea (ej. "Ir a la encomienda").'); return; }
    setSaving(true); setError(null);
    try {
      const person = people.find(p => p.id === assigned);
      const payload = {
        title: title.trim(),
        notes: notes.trim() || null,
        scheduled_date: date,
        scheduled_time: time || null,
        places: places.filter(p => p.name.trim()),
        photos,
        assigned_to: assigned || null,
        assigned_name: person?.name ?? null,
      };
      const saved = task
        ? await agendaTasksService.update(task.id, payload)
        : await agendaTasksService.create(payload);
      // La fecha no se mueve con `update`: para eso está el traslado, que deja
      // bitácora. Si cambió acá, se aplica como traslado.
      if (task && date !== task.scheduled_date) {
        await agendaTasksService.schedule(task.id, { scheduled_date: date, scheduled_time: time || null });
      }
      onSaved({ ...saved, scheduled_date: date, scheduled_time: time || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">
            {task ? 'Editar tarea' : 'Nueva tarea'}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="¿Qué hay que hacer? Ej. Ir a la encomienda"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />

          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <span className="relative w-32 shrink-0">
              <Clock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full pl-8 pr-2 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            </span>
          </div>

          <span className="relative block">
            <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={assigned} onChange={e => setAssigned(e.target.value)}
              className="w-full pl-8 pr-2 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800">
              <option value="">Sin responsable</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </span>

          {/* Lugares a los que hay que ir */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
              <MapPin size={13} /> Lugares
            </p>
            <div className="space-y-1.5">
              {places.map((pl, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={pl.name}
                    onChange={e => setPlaces(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Lugar (ej. Correos de CR, San Ramón)"
                    className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
                  <button onClick={() => setPlaces(prev => prev.filter((_, j) => j !== i))}
                    className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setPlaces(prev => [...prev, { name: '', done: false }])}
              className="mt-1.5 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50">
              <Plus size={14} /> Agregar lugar
            </button>
          </div>

          {/* Fotos */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
              <Camera size={13} /> Fotos
            </p>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/50 text-white">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
              onChange={e => void addPhotos(e.target.files)} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {uploading ? 'Subiendo…' : 'Tomar o subir foto'}
            </button>
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Notas (número de guía, a quién buscar, qué llevar…)"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button onClick={() => void save()} disabled={saving || uploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar tarea
          </button>
        </div>
      </div>
    </div>
  );
};

/** Miniaturas de las fotos de una tarea, con visor al tocarlas. */
export const TaskPhotos: React.FC<{ photos: string[] }> = ({ photos }) => {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto no-scrollbar">
        {photos.map((url, i) => (
          <button key={i} onClick={() => setZoom(url)}
            className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0">
            <img src={url} alt="" className="w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </button>
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl"
            onError={e => { (e.currentTarget as HTMLImageElement).replaceWith(document.createTextNode('')); }} />
        </div>
      )}
    </>
  );
};

export default TaskEditor;
