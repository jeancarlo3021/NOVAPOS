'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar, AlertCircle, Loader2, Plus, Trash2, Edit,
  ChevronLeft, ChevronRight, Clock, Users,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { shiftsService } from '@/services/users/shiftsService';
import { teamsService } from '@/services/users/teamsService';
import { usersService } from '@/services/users/usersService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import type { Shift, User, Team } from '@/types/Types_Users';
import { ShiftFormModal } from '../components/ShiftFormModal';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const STATUS_COLORS: Record<Shift['status'], { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Programado' },
  active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Activo' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Completado' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelado' },
};

export const ShiftsCalendar: React.FC = () => {
  const { tenantId } = useTenantId();

  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'users' | 'teams'>('users');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const usersCacheKey_ = cacheKey(tenantId, 'users_list');
  const teamsCacheKey_ = cacheKey(tenantId, 'teams_list');
  const shiftsCacheKey_ = cacheKey(tenantId, 'shifts_list');

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const weekStart = getWeekStart(currentDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    try {
      if (!navigator.onLine) {
        const cachedUsers = cacheGet<User[]>(usersCacheKey_);
        const cachedTeams = cacheGet<Team[]>(teamsCacheKey_);
        const cachedShifts = cacheGet<Shift[]>(shiftsCacheKey_);
        if (cachedUsers) setUsers(cachedUsers);
        if (cachedTeams) setTeams(cachedTeams);
        if (cachedShifts) setShifts(cachedShifts);
        if (!cachedUsers || !cachedTeams || !cachedShifts) {
          setError('Sin conexión — sin datos en caché');
        }
        return;
      }

      // Load all data in parallel
      const [usersData, teamsData, shiftsData] = await Promise.all([
        usersService.getAllUsers(tenantId),
        teamsService.getAllTeams(tenantId),
        shiftsService.getShiftsForWeek(
          tenantId,
          weekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0]
        ),
      ]);

      setUsers(usersData);
      setTeams(teamsData);
      setShifts(shiftsData);

      if (!selectedId && usersData.length > 0) {
        setSelectedId(usersData[0].id);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar datos'
      );
      const cachedShifts = cacheGet<Shift[]>(shiftsCacheKey_);
      if (cachedShifts) setShifts(cachedShifts);
    } finally {
      setLoading(false);
    }
  }, [tenantId, weekStart, weekEnd, usersCacheKey_, teamsCacheKey_, shiftsCacheKey_, selectedId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const handleCreateShift = () => {
    setEditingShift(null);
    setShowFormModal(true);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShowFormModal(true);
  };

  const handleFormSuccess = async () => {
    setShowFormModal(false);
    setEditingShift(null);
    await loadData();
  };

  const handleDeleteShift = async (shiftId: string) => {
    setDeletingId(shiftId);
    try {
      await shiftsService.deleteShift(shiftId);
      setShifts(prev => prev.filter(s => s.id !== shiftId));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar turno'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const getShiftsForCell = (date: Date, entityId: string) => {
    return shifts.filter(shift => {
      const shiftDate = new Date(shift.start_datetime);
      const isSameDay = shiftDate.toDateString() === date.toDateString();
      const isCorrectEntity =
        viewMode === 'users'
          ? shift.user_id === entityId
          : shift.team_id === entityId;
      return isSameDay && isCorrectEntity;
    });
  };

  const displayEntities = viewMode === 'users' ? users : teams;

  if (!selectedId && displayEntities.length > 0 && !selectedId) {
    setSelectedId(displayEntities[0].id);
  }

  const selectedEntity = displayEntities.find(e => e.id === selectedId);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Calendario de Turnos</h2>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Week Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevWeek}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-gray-700 min-w-fit">
              {weekStart.toLocaleDateString('es-CR')} - {weekEnd.toLocaleDateString('es-CR')}
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreateShift}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nuevo Turno
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setViewMode('users');
              setSelectedId(users[0]?.id || null);
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Por Usuario
          </button>
          <button
            onClick={() => {
              setViewMode('teams');
              setSelectedId(teams[0]?.id || null);
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'teams'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Por Equipo
          </button>
        </div>

        {/* Entity Selector */}
        {displayEntities.length > 0 && (
          <select
            value={selectedId || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- Selecciona {viewMode === 'users' ? 'usuario' : 'equipo'} --</option>
            {displayEntities.map(entity => (
              <option key={entity.id} value={entity.id}>
                {'full_name' in entity ? entity.full_name : entity.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* Empty State */}
      {!loading && displayEntities.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            Sin {viewMode === 'users' ? 'usuarios' : 'equipos'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {viewMode === 'users'
              ? 'Crea usuarios para asignar turnos'
              : 'Crea equipos para asignar turnos'}
          </p>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && displayEntities.length > 0 && selectedEntity && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-gray-50 border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-700 w-32">
                  {'full_name' in selectedEntity ? selectedEntity.full_name : selectedEntity.name}
                </th>
                {weekDates.map(date => (
                  <th
                    key={date.toISOString()}
                    className="bg-gray-50 border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700 min-w-40"
                  >
                    <div>{WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}</div>
                    <div className="text-xs text-gray-500">
                      {date.toLocaleDateString('es-CR', { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="border border-gray-200 p-3">
                  {/* Shifts for the week */}
                  {weekDates.map(date => {
                    const dayShifts = getShiftsForCell(date, selectedId!);
                    return (
                      <div
                        key={date.toISOString()}
                        className="border border-gray-200 rounded-lg p-2 min-h-24 inline-block mr-2 mb-2 w-40"
                      >
                        {dayShifts.length === 0 ? (
                          <div className="text-xs text-gray-400 text-center py-8">
                            Sin turnos
                          </div>
                        ) : (
                          dayShifts.map(shift => {
                            const statusInfo = STATUS_COLORS[shift.status];
                            return (
                              <div
                                key={shift.id}
                                className={`${statusInfo.bg} ${statusInfo.text} text-xs rounded p-2 mb-1`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">
                                      {statusInfo.label}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {formatTime(shift.start_datetime)}
                                        {shift.end_datetime && ` - ${formatTime(shift.end_datetime)}`}
                                      </span>
                                    </div>
                                    {shift.notes && (
                                      <div className="text-xs mt-1 line-clamp-1">
                                        {shift.notes}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleEditShift(shift)}
                                      className="p-1 hover:opacity-70"
                                      title="Editar"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteShift(shift.id)}
                                      disabled={deletingId === shift.id}
                                      className="p-1 hover:opacity-70 disabled:opacity-50"
                                      title="Eliminar"
                                    >
                                      {deletingId === shift.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Status Legend */}
      {!loading && displayEntities.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${colors.bg}`} />
              <span className="text-gray-600">{colors.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showFormModal && (
        <ShiftFormModal
          shift={editingShift}
          users={users}
          teams={teams}
          onClose={() => {
            setShowFormModal(false);
            setEditingShift(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
};
