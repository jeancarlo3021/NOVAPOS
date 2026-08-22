import { apiFetch } from '@/lib/api';

/** Un lugar al que hay que ir dentro de la tarea. */
export interface TaskPlace {
  name: string;
  address?: string | null;
  /** El repartidor va marcando los que ya visitó. */
  done?: boolean;
}

export interface AgendaTask {
  id: string;
  title: string;
  notes?: string | null;
  scheduled_date: string;
  scheduled_time?: string | null;
  places: TaskPlace[];
  /** URLs de las fotos de respaldo. */
  photos: string[];
  assigned_to?: string | null;
  assigned_name?: string | null;
  status: 'pending' | 'done' | 'cancelled';
  /** Quedó pendiente de reprogramar: no se pudo hacer. */
  needs_reschedule?: boolean;
  reject_reason?: string | null;
  rejected_at?: string | null;
  done_at?: string | null;
  reschedule_log?: Array<{
    from: string | null; from_time?: string | null;
    to: string | null; to_time?: string | null;
    at: string; by?: string | null; reason?: string | null;
  }>;
  created_at?: string;
}

export interface AgendaTaskInput {
  title: string;
  notes?: string | null;
  scheduled_date: string;
  scheduled_time?: string | null;
  places?: TaskPlace[];
  photos?: string[];
  assigned_to?: string | null;
  assigned_name?: string | null;
}

export const agendaTasksService = {
  list: (range: { date?: string; from?: string; to?: string; assigned_to?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (range.date) p.set('date', range.date);
    else {
      if (range.from) p.set('from', range.from);
      if (range.to) p.set('to', range.to);
    }
    if (range.assigned_to) p.set('assigned_to', range.assigned_to);
    if (range.status) p.set('status', range.status);
    const qs = p.toString();
    return apiFetch<AgendaTask[]>(`/agenda-tasks${qs ? '?' + qs : ''}`);
  },

  create: (t: AgendaTaskInput) =>
    apiFetch<AgendaTask>('/agenda-tasks', { method: 'POST', body: JSON.stringify(t) }),

  update: (id: string, t: Partial<AgendaTaskInput>) =>
    apiFetch<AgendaTask>(`/agenda-tasks/${id}`, { method: 'PUT', body: JSON.stringify(t) }),

  /** Realizada / pendiente / anulada. */
  setStatus: (id: string, status: AgendaTask['status']) =>
    apiFetch<AgendaTask>(`/agenda-tasks/${id}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),

  /** "No se pudo hacer": queda pendiente y pidiendo fecha nueva. */
  reject: (id: string, reason: string) =>
    apiFetch<AgendaTask>(`/agenda-tasks/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),

  /** Pasarla a otro día u hora. Vuelve a quedar pendiente. */
  schedule: (id: string, patch: { scheduled_date?: string; scheduled_time?: string | null; reason?: string | null }) =>
    apiFetch<AgendaTask>(`/agenda-tasks/${id}/schedule`, {
      method: 'POST', body: JSON.stringify(patch),
    }),

  remove: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/agenda-tasks/${id}`, { method: 'DELETE' }),
};

export default agendaTasksService;
